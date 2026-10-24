# Việt hóa PokéSurvivor — 24/10/2026

## Trạng thái

Đã triển khai trực tiếp trên mã nguồn vanilla HTML/CSS/JavaScript và cơ chế i18n có sẵn. Bản nguồn dùng `dev.html`. Bản phát hành `index.html` / `js/app.min.js` chưa được build lại thành công vì môi trường không kết nối được npm registry; không sửa tay mã minified.

- Tiếng Việt có mã `vi-VN`, xuất hiện dưới tên “Tiếng Việt”.
- Thứ tự chọn ngôn ngữ: lựa chọn đã lưu trong `ps.lang`, đường dẫn `/en/` nếu có, sau cùng tiếng Việt cho người chơi mới. Không ghi đè lựa chọn cũ và không thay đổi khóa lưu tiến trình.
- Từ điển có 1.843 chuỗi thông thường, 296 tên tính cách/đặc tính theo ngữ cảnh và 1 tên chiêu phân biệt với tên hệ. Phủ đủ 1.629 khóa trong danh sách kiểm thử tiếng Anh hiện tại và toàn bộ lịch sử cập nhật trong game.
- Bao gồm menu, chọn Pokémon, bộ sưu tập, chiêu và mô tả, gacha, vật phẩm, cửa hàng Kecleon, nhiệm vụ, thành tựu, chiến đấu, cài đặt, bạn bè, xếp hạng, thông báo lỗi, lưu game và bài kiểm tra tính cách.
- Tên Pokémon giữ theo dữ liệu gốc; riêng Código Cero dùng tên hiển thị Type: Null đã có trong bản tiếng Anh. Không đổi Pokédex ID.
- Font giao diện và Canvas tiếng Việt dùng Arial cùng font hệ thống dự phòng để hiển thị dấu. Các nút có thể xuống dòng; menu, chỉ số ở màn hình thấp và thông báo Canvas được giới hạn chiều rộng.

## File nguồn được sửa hoặc thêm

| File | Nội dung |
| --- | --- |
| `js/data/lang-vi.js` | Từ điển tiếng Việt mới, tên theo ngữ cảnh, thông báo HTML đầy đủ và lịch sử cập nhật |
| `js/core/locales.js` | Đăng ký `vi-VN`, nhận diện `vi`/`vi_VN`, đặt mặc định cho người mới |
| `js/boot.js` | Nội dung tải ban đầu bằng tiếng Việt |
| `js/noframe.js` | Thông báo tiếng Việt khi game bị nhúng trong trang khác |
| `js/core/i18n.js` | Font Canvas tiếng Việt dùng chung cho vẽ và đo chữ |
| `js/systems/mons.js` | Chỉ thêm nhánh dịch tên hiển thị tính cách/đặc tính; không đổi cơ chế |
| `js/ui/hud.js` | Giới hạn bề rộng chữ tiếng Việt trên Canvas; không đổi vùng tương tác |
| `css/style.css` | Font, xuống dòng và kích thước hiển thị cho tiếng Việt |
| `tools/build_langs.js` | Sinh gói ngôn ngữ `js/lang/vi-VN.js` |
| `js/data/changelog.js` | Ghi nhận bản Việt hóa ngày 24/10/2026 |
| `js/data/lang-updates.js` | Dịch ghi chú mới cho các ngôn ngữ cũ |
| `tests/i18n.test.cjs` | Kiểm thử tiếng Việt, locale, tên, nội dung, DOM, Canvas và bảo toàn dữ liệu |
| `docs/LOCALIZATION.md` | Cập nhật kiến trúc và phạm vi kiểm thử tiếng Việt |
| `docs/VIETNAMESE.md` | Báo cáo này |
| `.gitignore` | Không đưa ZIP sao lưu vào commit trong tương lai |

File sinh tự động: `js/lang/vi-VN.js` và các gói ngôn ngữ cũ (bổ sung ghi chú mới). Bước xuất dữ liệu và sinh trang SEO cũng đã được chạy bằng công cụ gốc. Các file tạm phục vụ dịch/kiểm tra nằm trong `tools/cache/`, không cần để chạy game.

## Kiểm thử đã thực hiện

| Kiểm tra | Kết quả |
| --- | --- |
| Kiểm thử gốc trước khi sửa | 39/39 đạt |
| `node --test tests/i18n.test.cjs tests/net.test.cjs` sau khi sửa | 46/46 đạt |
| `node tools/build_langs.js --faltan` | Không thiếu khóa ở tiếng Việt và các ngôn ngữ cũ |
| Kiểm tra cú pháp JavaScript bằng `vm.Script` | 98 file đạt, không kiểm tra lại bundle minified cũ |
| `node tools/export_data.js` | Thành công: 966 Pokémon, 103 chiêu, 11 vật phẩm mang theo, 130 thành tựu, 18 đấu trường |
| `python tools/make_seo_pages.py` | Thành công |
| `node tools/build.js` | Chưa thành công: `ENOTFOUND registry.npmjs.org` khi tải `terser@5` |
| Trình duyệt PC/điện thoại | Chưa xác minh trực quan: trình duyệt kiểm thử không truy cập được máy chủ cục bộ |

Kiểm thử bao gồm lựa chọn ngôn ngữ mới/cũ, alias, lưu trữ bị chặn, biến trong câu, font đo/vẽ Canvas, DOM và thuộc tính trợ năng, tên người chơi không bị dịch, tên tính cách/đặc tính không sửa dữ liệu gốc, 966 Pokémon, bài kiểm tra tính cách, lịch sử cập nhật và các kiểm thử mạng/co-op có sẵn. Đây không phải kiểm thử chơi trực tiếp qua Firebase hoặc kết nối nhiều người thật.

## Chạy bản nguồn và build

Mở `dev.html` trong trình duyệt để dùng toàn bộ mã nguồn mới. Có thể chạy qua máy chủ tĩnh trong thư mục project. Ví dụ:

```powershell
python -m http.server 8765 --bind 127.0.0.2
```

Sau đó mở `http://127.0.0.2:8765/dev.html`. Địa chỉ này dùng chế độ lưu cục bộ có sẵn của repository. Không xóa dữ liệu trình duyệt và không chuyển nguồn gốc trang nếu muốn tiếp tục một bản lưu cục bộ cũ: `file://`, địa chỉ IP, tên miền và cổng khác nhau có vùng lưu riêng.

Khi môi trường có thể tải các gói npm, chạy đúng quy trình repository:

```powershell
node --test tests/i18n.test.cjs tests/net.test.cjs
node tools/build.js
node tools/export_data.js
python tools/make_seo_pages.py
```

Không dùng `--expose` để phát hành. Chỉ sau build thành công, `index.html`, bundle bảo vệ và `version.json` mới chứa toàn bộ thay đổi nguồn mới nhất.

## Sao lưu và phần còn cần xác minh

Bản ZIP gốc tải về được giữ tại `backups/pokesurvivor-before-vi.zip`. Đã đối chiếu từng byte của 13.669 file trong ZIP với workspace: toàn bộ ảnh/sprite, dữ liệu Pokémon/chiêu, logic chiến đấu, AI, gacha, lưu game và mạng giữ nguyên. Trong `mons.js` chỉ thêm nhánh lấy tên hiển thị tiếng Việt. Báo cáo đối chiếu nằm tại `tools/cache/vi-change-list.json`.

Chưa thể xác nhận giao diện không tràn chữ trên thiết bị thực. Cần mở bản nguồn hoặc bản build cuối để kiểm tra màn hình PC, điện thoại ngang 667×375 và 844×390, chuyển ngôn ngữ, chọn Pokémon, gacha, cửa hàng, nâng cấp, màn hình chiến đấu và kết thúc trận. Không coi các unit test là bằng chứng thay cho bước này.

Các trang hướng dẫn/Pokédex/pháp lý bên ngoài giao diện chơi vẫn là các trang Tây Ban Nha/Anh do generator gốc tạo; bản Việt hóa này không tạo thêm một bộ trang SEO tiếng Việt. Các chuỗi phát sinh trong tương lai ngoài từ điển vẫn dùng cơ chế dự phòng gốc.
