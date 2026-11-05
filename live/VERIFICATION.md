# Verification — 2026-11-05

Story: admin chọn phe, triệu hồi hoặc giả lập quà → token-protected REST → Battle authoritative → Socket.IO → Phaser sprites/HP/feed/ranking → một phe phá thành và màn hình chiến thắng.

| Kiểm tra thực tế | Kết quả |
|---|---|
| `npm run build` | Pass; kiểm tra Node syntax, 10 sheet PNG và bundle client Safari 15+; không cần CDN |
| `npm test` | 12 tests: 6 battle, 2 native event adapter, 4 connection lifecycle |
| Sprite animation assets | Cả 50 hàng (10 sheets × 5 trạng thái) có nhiều frame khác nhau |
| Chromium E2E | Pass: click triệu hồi Đỏ/Xanh, gift sender, ranking, di chuyển, attack/hurt/death |
| WebKit E2E (Linux headless) | Pass cùng luồng Chromium |
| Phá thành trên server timer thật | Pass ở Demo 8×; 50 Boss Đỏ phá HP thành Xanh về 0, UI hiển thị RED KINGDOM WINS |
| Stress browser | Cap 300 quân, render không gây pageerror |
| Pause | Thời gian mô phỏng dừng, resume tiếp tục |
| Mapping quà | Mapping thay đổi có tác dụng; direct troop spawn vẫn chọn đúng loại |
| API không token | HTTP 401 |
| Viewports | 1440×1200; 820×1180; 390×844 không overflow ngang |
| Overlay | Tỷ lệ canvas 9:16 |
| TikTok failures | Factory rejection, timeout, lỗi teardown, sự kiện cũ, payload lỗi, cancel trong lúc connect không dừng game |
| Tài nguyên tham khảo | Không tái sử dụng bundle/artwork, repo tham khảo giữ nguyên file gốc |

Benchmark riêng mô phỏng 300 quân / 600 tick khoảng 0.5–1.2 giây tùy tải máy. Đây không phải đo FPS iPad. Test browser tự chạy server riêng và xóa dữ liệu tạm, không cần LIVE hoặc credential TikTok. Ảnh kiểm tra ở `live/artifacts/` (không commit).

Chưa kiểm tra Safari trên iPad vật lý hoặc TikTok thật. WebKit headless không thay thế thiết bị thật. GitHub Actions có workflow nhưng chỉ có thể báo kết quả sau khi push và workflow chạy trên GitHub. Push đang chờ repository người dùng cung cấp: quyền tạo repository mới đã bị GitHub từ chối (`Resource not accessible by integration`). Không có URL public preview từ môi trường; dùng Codespaces forward cổng 3000 theo README.
