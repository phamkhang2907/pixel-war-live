# Character & combat verification — 2026-11-05

Repository `/workspace/pixel-war-release`, branch `feature/pixel-war-live`; tiếp tục lịch sử hiện tại, không tạo repository hoặc branch mới.

| Kiểm tra chạy thực tế | Kết quả |
|---|---|
| `npm run build` | PASS: Node syntax, metadata/dimensions 12 sheets, bundle Phaser + Socket.IO, Safari 15+ target |
| `npm test` | **26/26 PASS**: 13 combat/gift, 6 energy/Fury, 3 native adapter, 4 connection lifecycle |
| `npm run assets:check --prefix live` | PASS: 12 raster PNG 512×512, frame 64×64; 96 hàng animation đều có nhiều frame khác nhau |
| Stats / default gifts | Đủ 6 lớp và đúng HP/damage; ngưỡng 1/10/50/100/200/1000, streak nhân số quân |
| Projectile thật | Arrow trì hoãn damage đến va chạm; fireball gây splash; anti-air được kiểm tra |
| Melee / skills | Hurt/death, corpse lifespan; charge; shield hướng trước; stomp/knockback; Titan castle priority và rage |
| Like milestones | Tích lũy, từng mốc đúng một lần; team riêng; heal cap; Guardian; rain; haste 15s |
| Fury | Rolling window 10s chính xác ở ranh giới phần lẻ giây; cooldown 60s; hai phe cùng damage; reset |
| Chromium browser E2E | PASS: UI → admin API → Battle → Socket.IO → renderer/feed/ranking |
| WebKit browser E2E | PASS cùng luồng Chromium, Linux headless |
| Trận siege thực tế | Server timer chạy Demo 8×; 50 Titan Đỏ phá thành Xanh về **0 HP**, UI hiển thị RED KINGDOM WINS |
| Camera side scrolling | Nút Red/Blue làm camera viewport dịch >20% minimap; đã sửa interpolation phụ thuộc FPS |
| Like UI | Nút +500 và +500 ghi energy/claimed/Guardian; Fury xuất hiện; không lặp 100/300/500 |
| Stress test | Hard cap **300 quân**, renderer không phát pageerror |
| Layout / overlay | 1440×1200, 820×1180, 390×844; không overflow ngang; canvas overlay 9:16 |
| Pause / token / mapping | Pause dừng thời gian, API thiếu token trả 401, mapping tùy chỉnh hoạt động, direct spawn độc lập |
| TikTok lifecycle failures | Factory rejection, timeout, malformed payload, lỗi teardown, cancel/stale connection không dừng simulation |

Benchmark CPU trên máy này: **300 quân hỗn hợp / 600 tick ≈ 1.3–2.8 giây**, tùy tải Chromium/WebKit chạy đồng thời. Đây là CPU simulation, không phải FPS iPad hay cam kết tải mạng nhiều người xem.

Browser test tự tạo server riêng 3100/3102, token tạm, DATA_DIR tạm được dọn khi kết thúc. Test có dùng `speed=1` để quan sát hurt/death đủ thời gian trước khi tăng 8× cho siege. Không thêm endpoint test để sửa HP hoặc ép chiến thắng. Ảnh thực tế trong `live/artifacts/` (gitignored).

Các lỗi đã phát hiện và sửa: camera lerp theo frame làm WebKit chậm pan; snapshot mô phỏng nhanh có thể bỏ qua state hurt trong test (kiểm tra combat tại 1×); cửa sổ Like cũ gom 100ms làm sai ranh giới 10s (đã giữ timestamp chính xác).

Chưa kiểm tra: Safari iPad vật lý, TikTok LIVE/signing service thật, load nhiều người xem qua Internet, GitHub Actions trên remote. WebKit ở Linux đã được chạy với các shared libraries tải riêng vào thư mục browser tại /tmp; không thay đổi dependencies runtime của game. Remote GitHub hiện chưa được cấu hình/cấp quyền, không có push/deploy mới. Preview local ở port 3000; xem hướng dẫn Codespaces trong README.
