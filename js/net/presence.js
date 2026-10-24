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
  let onlineUids = new Set();
  const presenceListeners = new Set();

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

  let generation = 0;
  let subscriptions = [];
  let initPromise = null;

  function detach() {
    generation++;
    for (const [ref, fn] of subscriptions) ref.off('value', fn);
    subscriptions = [];
    const old = userConnRef;
    userConnRef = null;
    const cleanup = old ? old.remove().then(() => old.onDisconnect().cancel()).catch(() => {}) : Promise.resolve();
    const guestDb = app && rtdb;
    let timeout;
    const done = Promise.race([cleanup, new Promise(resolve => { timeout = setTimeout(resolve, 2000); })]).finally(() => clearTimeout(timeout));
    if (guestDb) done.then(() => guestDb.goOffline()); // Only the separate guest app.
    isConnected = false; onlineCount = null; onlineUids = new Set();
    updateUI(null, false);
    presenceListeners.forEach(fn => { try { fn(onlineUids); } catch (_) {} });
    return done;
  }

  async function init() {
    if (initPromise) return initPromise;
    if (initialized) return;
    initialized = true;
    const cfg = G.FIREBASE_CONFIG; // Respect the host allowlist and disabled cloud mode.
    if (!cfg || !cfg.databaseURL) return;
    initPromise = (async () => {
      if (!await ensureSdk()) { initialized = false; return; }
      try {
        const fb = G.DB && G.DB.fb;
        if (fb && fb.rtdb && fb.auth && fb.auth.currentUser && fb.auth.currentUser.uid === fb.uid) {
          app = null; auth = fb.auth; rtdb = fb.rtdb; currentUid = fb.uid;
        } else {
          const existing = window.firebase.apps && window.firebase.apps.some(a => a.name === 'presence');
          app = existing ? window.firebase.app('presence') : window.firebase.initializeApp(cfg, 'presence');
          auth = app.auth(); rtdb = app.database();
          if (cfg.emulator && !existing) {
            auth.useEmulator('http://127.0.0.1:9099');
            rtdb.useEmulator('127.0.0.1', 9000);
          }
          await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
          const user = auth.currentUser || (await auth.signInAnonymously()).user;
          currentUid = user.uid;
        }
        rtdb.goOnline();
        setupPresence();
      } catch (e) {
        initialized = false;
        console.warn('[OnlinePresence] init:', e.code || e.message);
        updateUI(null, false);
      }
    })();
    try { await initPromise; } finally { initPromise = null; }
  }

  function setupPresence() {
    if (!rtdb || !currentUid || !auth.currentUser || auth.currentUser.uid !== currentUid) return;
    const epoch = generation;
    connId = 'tab_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);
    const mine = userConnRef = rtdb.ref('/presence/' + currentUid + '/' + connId);
    function listen(ref, fn, error) { subscriptions.push([ref, fn]); ref.on('value', fn, error); }
    listen(rtdb.ref('.info/connected'), snap => {
      if (snap.val() !== true) { isConnected = false; updateUI(null, false); return; }
      mine.onDisconnect().remove().then(async () => {
        if (epoch !== generation) return;
        await mine.set({ at: window.firebase.database.ServerValue.TIMESTAMP });
        if (epoch !== generation) return;
        isConnected = true;
        updateUI(onlineCount, true);
        presenceListeners.forEach(fn => { try { fn(onlineUids); } catch (_) {} });
      }).catch(e => { if (epoch === generation) { isConnected = false; updateUI(null, false); } console.warn('[OnlinePresence] write:', e.code || e.message); });
    });
    listen(rtdb.ref('/presence'), snap => {
      onlineUids = new Set(Object.keys(snap.val() || {}));
      onlineCount = onlineUids.size;
      if (isConnected) updateUI(onlineCount, true);
      presenceListeners.forEach(fn => { try { fn(onlineUids); } catch (_) {} });
    }, () => { onlineUids = new Set(); onlineCount = null; updateUI(null, false); });
  }

  async function setUid(newUid) {
    if (initPromise) await initPromise;
    const fb = G.DB && G.DB.fb;
    if (!newUid || !fb || !fb.auth || !fb.auth.currentUser || fb.auth.currentUser.uid !== newUid) return;
    if (currentUid === newUid && rtdb === fb.rtdb && initialized) return;
    await detach(); initialized = false;
    await init();
  }

  async function onLogout() {
    if (initPromise) await initPromise;
    detach(); initialized = false;
    await init();
  }

  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('beforeunload', () => {
    if (userConnRef) userConnRef.remove().catch(() => {});
  });

  return {
    init,
    usesDatabase(db) { return initialized && !app && rtdb === db; },
    setUid,
    onLogout,
    async beforeLogout() { if (initPromise) await initPromise; await detach(); initialized = false; },
    updateUI,
    isOnline(u) { return !!(u && onlineUids.has(u)); },
    onPresenceChange(fn) { presenceListeners.add(fn); return () => presenceListeners.delete(fn); },
    get isConnected() { return isConnected; },
    get count() { return onlineCount; }
  };
})();
