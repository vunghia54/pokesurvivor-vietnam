/* ============ firebase-config.js — kết nối Firebase hoặc chạy cục bộ ============
 * Khi đặt là null, trò chơi hoạt động ở chế độ CỤC BỘ (Local mode):
 * - Toàn bộ dữ liệu tài khoản và tiến trình chơi được lưu trong localStorage của trình duyệt.
 * - Không gửi dữ liệu lên máy chủ Firebase production của tác giả gốc.
 * - Đảm bảo an toàn, riêng tư và độc lập khi triển khai trên GitHub Pages.
 *
 * Nếu bạn muốn tạo backend Cloud Save & Bảng xếp hạng online riêng trong tương lai,
 * hãy tạo dự án Firebase mới và điền thông tin SDK cấu hình vào đây.
 */
G.FIREBASE_CONFIG = null;

/* Cấu hình mẫu khi bạn tạo Firebase Project riêng:
G.FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'du-an-cua-ban.firebaseapp.com',
  projectId: 'du-an-cua-ban',
  storageBucket: 'du-an-cua-ban.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123'
};
*/
