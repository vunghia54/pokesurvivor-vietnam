/* ============ firebase-config.js — cấu hình Firebase & chế độ lưu trữ ============
 * BẢO MẬT PHÁT HÀNH CÔNG KHAI (GitHub Pages):
 * Khi đặt là null, trò chơi hoạt động ở chế độ CỤC BỘ (Local Storage Mode):
 * - Toàn bộ dữ liệu tài khoản, tiến trình chơi, gacha, Pokémon lưu trữ 100% trong localStorage.
 * - Không kích hoạt backend online công khai khi Security Rules chưa được kiểm thử và triển khai an toàn.
 * - Đảm bảo độ trễ = 0, hoạt động hoàn hảo mọi lúc mọi nơi kể cả khi không có mạng.
 */
G.FIREBASE_CONFIG = null;

/* Cấu hình Firebase Project đã kết nối của PokéSurvivor Việt Nam
 * (Sử dụng khi triển khai Security Rules bằng Firebase CLI):
 */
G.FIREBASE_CONFIG_READY = {
  apiKey: "AIzaSyDaC78u6QPXi1q-PNnClypYMRZM6IrsEYg",
  authDomain: "plucky-courier-365002.firebaseapp.com",
  databaseURL: "https://plucky-courier-365002-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "plucky-courier-365002",
  storageBucket: "plucky-courier-365002.firebasestorage.app",
  messagingSenderId: "409056798432",
  appId: "1:409056798432:web:7a10948975b69b4d3f5285",
  measurementId: "G-HG8R2HRPKL"
};
