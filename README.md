# PIXEL WAR — RED VS BLUE

Game livestream tương tác độc lập, Node.js 20+, Phaser 3 và Socket.IO. Hai phe chiến đấu tự động trên canvas 9:16; 6 lớp quân dùng sprite sheets pixel art gốc với idle/run/attack/hurt/death. Demo chơi được ngay, không cần TikTok LIVE.

```bash
npm run setup
npm run build
npm test
npm start
```

Mở http://localhost:3000, chọn **Stream setup**, nhập admin token được in trong terminal. Chọn Team Red / Blue, bấm + để triệu hồi từng loại; **Simulate a gift** chạy mapping quà có thể chỉnh. **Demo speed 8×** giúp xem nhanh trận phá thành. Overlay: `/?overlay=1`.

## GitHub Codespaces / iPad Safari

Chọn branch `feature/pixel-war-live` → **Code → Codespaces → Create codespace on feature/pixel-war-live**. Devcontainer tự cài dependencies và cấu hình port 3000. Chạy `npm start`, mở **Ports → 3000 → Open in Browser**. Trên iPad mở URL HTTPS `https://<codespace-name>-3000.app.github.dev`; đăng nhập GitHub nếu port private. Không dùng localhost của iPad để truy cập Codespace. Canvas OBS 540×960 hoặc 1080×1920.

[Hướng dẫn chi tiết, Admin và TikTok](live/README.md) · [Giấy phép/artwork audit](live/THIRD_PARTY.md) · [Kết quả kiểm thử](live/VERIFICATION.md).

Mã mới được viết độc lập sau khi kiểm tra island-defense-demo không có LICENSE ở root. Repository này không chứa bundle/artwork của game tham khảo. MIT chỉ áp dụng mã/artwork mới; connector có license AGPL-3.0 kèm ngoại lệ, xem tài liệu trước khi cung cấp dịch vụ hosted.

Bản cập nhật character/combat: sáu lớp quân, air/anti-air, charge, shield/stomp/rage, projectile thực, năng lượng Like và Fury. Chi tiết luật/cấu hình, bảng stats, frame metadata và giới hạn: [live/README.md](live/README.md).

Vòng đấu tự động và BXH: mặc định 300s (30 chuẩn bị / 240 combat / 30 Final), kết quả Top 10 trong 15s, đếm 5s rồi tự chơi tiếp. Điểm chiến công gắn user ID, BXH trận/LIVE/mùa và lịch sử lưu bền vững. [Luật điểm, Admin và lưu trữ](live/ROUNDS.md).
