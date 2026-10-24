/* ============ presence.js — bộ đếm số người chơi online thời gian thực ============
 * Sử dụng Firebase Realtime Database:
 *   - Đường dẫn: /presence/{uid}/{connId} = { at: ServerValue.TIMESTAMP }
 *   - Định danh duy nhất theo UID: mở nhiều tab trong cùng trình duyệt chỉ tính 1 người online.
 *   - onDisconnect().remove() dọn dẹp kết nối tự động trên server khi thoát hoặc mất mạng.
 *   - Lắng nghe .info/connected để cập nhật trạng thái kết nối ngay lập tức.
 *   - Hỗ trợ cả người chơi đã đăng nhập Google lẫn người chơi khách (Anonymous Auth an toàn).
 *   - Hoàn toàn độc lập với hệ thống Cloud Save, không làm ảnh hưởng chế độ chơi đơn.
 *   - Khi offline hoặc Firebase chưa bật: hiển thị "Online: —" và chấm trạng thái màu xám.
 */
G.Presence = (() => {
  const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/';
  let app = null;
  let auth = null;
  let rtdb = null;
  let currentUid = null;
  let connId = null;
  let userConnRef = null;
  let connectedRef = null;
  let presenceRef = null;
  let isConnected = false;
  let onlineCount = null;
  let initialized = false;

  function loadScript(src) {
    if (typeof document === 'undefined') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = err => reject(err);
      document.head.appendChild(s);
    });
  }

  function updateUI(count, connected) {
    if (typeof document === 'undefined') return;
    const pill = document.getElementById('online-pill');
    const label = document.getElementById('online-count');
    const dot = pill ? pill.querySelector('.online-dot') : null;
    if (!pill || !label) return;

    if (connected && typeof count === 'number' && count >= 0) {
      label.textContent = 'Online: ' + count;
      if (dot) dot.classList.remove('offline');
      pill.title = 'Người chơi trực tuyến: ' + count;
    } else {
      label.textContent = 'Online: —';
      if (dot) dot.classList.add('offline');
      pill.title = connected ? 'Đang cập nhật số người chơi...' : 'Chưa kết nối máy chủ';
    }
  }

  async function ensureSdk() {
    if (typeof window === 'undefined') return false;
    if (!window.firebase || !window.firebase.database || !window.firebase.auth) {
      try {
        if (!window.firebase) await loadScript(SDK + 'firebase-app-compat.js');
        if (!window.firebase.auth) await loadScript(SDK + 'firebase-auth-compat.js');
        if (!window.firebase.database) await loadScript(SDK + 'firebase-database-compat.js');
      } catch (e) {
        console.warn('[OnlinePresence] Không thể tải Firebase SDK:', e.message);
        return false;
      }
    }
    return !!(window.firebase && window.firebase.database && window.firebase.auth);
  }

  async function init() {
    if (initialized) return;
    initialized = true;

    updateUI(null, false);

    const cfg = G.FIREBASE_CONFIG || G.FIREBASE_CONFIG_READY;
    if (!cfg || !cfg.databaseURL) {
      updateUI(null, false);
      return;
    }

    const hasSdk = await ensureSdk();
    if (!hasSdk) {
      updateUI(null, false);
      return;
    }

    try {
      // Khởi tạo app Firebase riêng cho Presence để không xung đột với Cloud Save / Google Auth chính
      if (window.firebase.apps && window.firebase.apps.some(a => a.name === 'presence')) {
        app = window.firebase.app('presence');
      } else {
        app = window.firebase.initializeApp(cfg, 'presence');
      }

      auth = app.auth();
      rtdb = app.database();

      // Thiết lập persistence LOCAL
      try {
        await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
      } catch (e) {}

      // Lấy UID hoặc đăng nhập ẩn danh an toàn
      let user = auth.currentUser;
      if (!user) {
        // Kiểm tra xem G.DB có UID của Google đăng nhập không
        const mainUid = G.DB && G.DB.fb && G.DB.fb.uid;
        if (!mainUid) {
          try {
            const cred = await auth.signInAnonymously();
            user = cred.user;
          } catch (authErr) {
            console.info('[OnlinePresence] Anonymous Auth chưa kích hoạt trong Firebase Console:', authErr.code || authErr.message);
            updateUI(null, false);
            return;
          }
        }
      }

      currentUid = (G.DB && G.DB.fb && G.DB.fb.uid) || (user && user.uid) || ('anon_' + Math.random().toString(36).slice(2, 10));
      setupPresence();
    } catch (err) {
      console.warn('[OnlinePresence] Lỗi khởi tạo:', err.message);
      updateUI(null, false);
    }
  }

  function setupPresence() {
    if (!rtdb || !currentUid) return;

    // Tạo ID kết nối riêng cho mỗi tab
    connId = 'tab_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);
    userConnRef = rtdb.ref('/presence/' + currentUid + '/' + connId);

    // Dọn dẹp listener cũ nếu có
    if (connectedRef) connectedRef.off();
    if (presenceRef) presenceRef.off();

    // 1. Lắng nghe trạng thái kết nối .info/connected
    connectedRef = rtdb.ref('.info/connected');
    connectedRef.on('value', snap => {
      if (snap.val() === true) {
        // Đăng ký onDisconnect trước khi ghi dữ liệu
        userConnRef.onDisconnect().remove().then(() => {
          userConnRef.set({ at: window.firebase.database.ServerValue.TIMESTAMP });
          isConnected = true;
          updateUI(onlineCount, true);
        }).catch(err => {
          console.warn('[OnlinePresence] onDisconnect error:', err.message);
        });
      } else {
        isConnected = false;
        updateUI(null, false);
      }
    });

    // 2. Lắng nghe tổng số người online qua danh sách /presence
    presenceRef = rtdb.ref('/presence');
    presenceRef.on('value', snap => {
      const data = snap.val() || {};
      // Đếm số lượng UID duy nhất (mỗi UID là 1 người chơi)
      const uniqueUsers = Object.keys(data).length;
      onlineCount = uniqueUsers;
      if (isConnected) {
        updateUI(uniqueUsers, true);
      }
    }, err => {
      console.warn('[OnlinePresence] Lỗi đọc presence:', err.message);
      updateUI(null, false);
    });

    // 3. Xử lý khi đóng tab (beforeunload) để dọn dẹp ngay lập tức
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (userConnRef) {
          userConnRef.remove();
        }
      });
    }
  }

  function setUid(newUid) {
    if (!newUid || newUid === currentUid) return;
    if (userConnRef) {
      try { userConnRef.remove(); } catch (e) {}
    }
    currentUid = newUid;
    if (rtdb) {
      setupPresence();
    }
  }

  function onLogout() {
    if (userConnRef) {
      try { userConnRef.remove(); } catch (e) {}
    }
    if (auth) {
      auth.signInAnonymously().then(cred => {
        currentUid = cred.user.uid;
        setupPresence();
      }).catch(() => {
        currentUid = 'anon_' + Math.random().toString(36).slice(2, 10);
        setupPresence();
      });
    }
  }

  return {
    init,
    setUid,
    onLogout,
    updateUI,
    get isConnected() { return isConnected; },
    get count() { return onlineCount; }
  };
})();
