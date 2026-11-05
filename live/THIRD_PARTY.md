# License audit — 2026-11-05

## Repository tham khảo

`quangrau/island-defense-demo` được clone từ GitHub; tại thời điểm kiểm tra không có LICENSE ở root. README dẫn Tiny Swords by Pixel Frog nhưng không đủ để cấp phép cho toàn bộ bundle mã nguồn. **Không sao chép, import hoặc sửa bundle JS/artwork vào game mới.** Bản tham khảo tại workspace gốc được giữ nguyên; repo standalone này chỉ có mã mới ở `live/`. Quyền các file gốc thuộc chủ sở hữu tương ứng; giấy phép của phần mới không áp dụng cho chúng.

## Artwork mới

`live/tools/sprites.py`, PNG trong `live/public/assets/`, terrain code trong arena.js là artwork nguyên bản được tạo cho dự án này. 12 sprite sheets raster 512×512, frame 64×64, 8 frame × 8 trạng thái; idle thở, run chân/bob, attack vũ khí, hurt recoil, death xoay/fade. Không lấy hình từ Tiny Swords hay nguồn chưa rõ phép. Cho phép sử dụng/sửa/phân phối artwork mới theo MIT trong `live/LICENSE`.

## Dependencies

- Phaser 3.90: MIT — https://github.com/phaserjs/phaser
- Socket.IO / socket.io-client: MIT — https://github.com/socketio/socket.io
- Express: MIT — https://github.com/expressjs/express
- TikTok-Live-Connector **2.5.0**: **AGPL-3.0 kèm Additional Permissions & Exceptions**, không phải MIT. Bản license đúng package đã cài lưu tại `licenses/TikTok-Live-Connector.txt`. Section 18 nêu ví dụ TikTok LIVE games được tích hợp theo ngoại lệ; section 19 giới hạn SaaS relay / API / managed hosting cho bên thứ ba. Đọc đầy đủ trước khi cung cấp dịch vụ hosted. Không sửa library hoặc protobuf. Mã app mới cung cấp đầy đủ trong branch này.
- Playwright (dev): Apache-2.0.
- Font hiện dùng system font fallback; không tải font từ dịch vụ bên ngoài.
- esbuild (dev/build): MIT.

License của từng dependency và dependencies chuyển tiếp có trong node_modules khi `npm ci`; lockfile ghi phiên bản. MIT của mã mới không thay thế license dependency, reference repo, hoặc điều khoản TikTok/signing service.

Bản phát hành standalone chỉ bao gồm mã/artwork mới và thông báo license dependency. Không đưa bundle hoặc artwork của repository tham khảo vào repository mới.
