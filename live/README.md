# PIXEL WAR — RED VS BLUE

Game TikTok LIVE tương tác, Node.js 20+, Phaser 3, Socket.IO. Chiến trường 540 × 960 (9:16), hai lâu đài, 5 loại quân. Mặc định **Demo Mode**, không kết nối TikTok khi khởi động.

## Chạy ngay

Tại thư mục gốc repository:

```bash
npm run setup
npm start
```

Mở **http://localhost:3000**. Terminal in `Admin token: ...`. Chọn **Stream setup**, nhập token, bấm **Unlock controls**. `npm start` tự chạy build trước: bundle Phaser + Socket.IO vào `dist/public/app.js`, không cần CDN cho game. `npm run build` chạy riêng bước build.

Token chỉ lưu trong sessionStorage của tab; không gửi token lên overlay. Bạn cũng có thể đặt `ADMIN_TOKEN` trong môi trường trước khi chạy.

1. Chọn Team Red / Team Blue rồi bấm `+` cạnh một loại lính để triệu hồi trực tiếp (không phụ thuộc mapping quà).
2. Trong **Simulate a gift**, nhập tên người tặng, coin/quà và số lần lặp; **Send demo gift** chạy đúng mapping quà đang lưu.
3. **Demo speed** có 1× / 2× / 4× / 8× để thử một trận hoàn chỉnh nhanh hơn.
2. Bật/tắt Auto reinforcements; Pause, Reset và Stress test +200 quân.
3. Mở `http://localhost:3000/?overlay=1` để xem riêng khung phát 9:16. Trong OBS dùng Browser Source 540 × 960 (hoặc 1080 × 1920).
4. Chạy Demo Mode trước, sau đó mới nhập username TikTok và Connect.

## GitHub Codespaces và Safari iPad

Branch triển khai: `feature/pixel-war-live`. Cấu hình `.devcontainer/devcontainer.json` cài dependencies và forward cổng 3000.

- Mở branch trong Codespaces; chạy `npm start` ở terminal.
- Tab **Ports** → Add port **3000** (nếu chưa có) → Open in Browser.
- URL sẽ có dạng `https://<codespace-name>-3000.app.github.dev`.
- Mở chính URL HTTPS đó trên Safari iPad; đăng nhập GitHub nếu port private. Chỉ đổi port Public khi bạn muốn chia sẻ overlay. API điều khiển vẫn cần admin token.
- Không mở localhost của iPad: localhost thuộc về chính iPad, không phải Codespace.
- WebSocket Socket.IO tự reconnect, có HTTP polling dự phòng. Canvas co giãn theo màn hình. Fullscreen trên Safari không hỗ trợ sẽ mở tab overlay. Âm thanh chỉ bật sau thao tác chạm.

## TikTok thật

Người xem bình luận chính xác **1** hoặc **2** để chọn/đổi phe. Quà sau đó được tính cho phe đã chọn. Người chưa chọn phe không triệu hồi quân. Giá trị = diamondCount × repeatCount; quà chuỗi chỉ xử lý khi repeatEnd, chống lặp theo msgId. Giá trị chưa biết bị bỏ qua.

Mapping mặc định (ngưỡng tổng coin): 1 → 1 kiếm; 5 → 2 cung; 20 → 2 kỵ; 50 → 3 pháp sư; 100 → 1 boss. Admin → Gift rules chỉnh ngưỡng/loại/số lượng; Save lưu vào `live/data/rules.json`, tự nạp lại khi khởi động. Khối lượng vượt giới hạn 300 quân được bỏ qua, không tạo hàng đợi vô hạn. Bảng xếp hạng tính tổng coin, kể cả khi sân đã đầy.

Connector native v2.5 dùng `user`, `giftDetails`, `common`. Có thể cần Euler signing API key qua `EULER_API_KEY` tùy tình trạng TikTok/khu vực. Không dùng cookie hay tài khoản của người xem. Kết nối thất bại hiện thông báo và trở về Demo. Kết nối thành công tắt auto demo và trả tốc độ về 1×. Disconnect quay lại Demo; chọn Demo mode để thử tiếp. TikTok không cung cấp bảo đảm API không chính thức này luôn hoạt động.

**Chưa kiểm thử TikTok thật**: môi trường triển khai không có tài khoản đang LIVE hoặc khóa signing. Đã kiểm thử payload native giả lập, chọn phe, quà chuỗi, chống trùng và mapping.

## Kiến trúc và hiệu năng

- `src/game.js`: mô phỏng authoritative 20 Hz; spatial hash 120 px để tìm địch gần; lực tách cục bộ; cooldown, sát thương, splash pháp sư, phá thành, vòng đấu kết thúc khi HP thành = 0. Reset bắt đầu vòng mới.
- `src/server.js`: Express static + admin REST token + Socket.IO snapshot 20 Hz. Tất cả người xem thấy cùng một trận. Không nhận lệnh spawn qua Socket.IO công khai.
- `src/tiktok.js`: normalize native events và chống trùng. `src/tiktok-connection.js`: quản lý connect/disconnect/timeout 12 giây, bỏ sự kiện từ kết nối cũ, bắt lỗi factory/teardown/payload. Server không chờ TikTok trong vòng mô phỏng. Lỗi kết nối chuyển về Demo; quân đang chiến đấu tiếp tục.
- `tools/build.mjs`: kiểm tra cú pháp Node, kích thước sheet và bundle client với target Safari 15+.
- `public/app.js`: Phaser sprites và animation idle/run/attack/hurt/death, nội suy vị trí, một Graphics dùng chung cho HP, giới hạn tần suất damage text. Ẩn nhãn trên 125 quân để giảm draw calls; tên người tặng vẫn có trong feed/bảng xếp hạng.
- `tools/sprites.py`: artwork pixel gốc có thể tái tạo bằng Python + Pillow. 10 sheets (32×40/frame, 6 frame × 5 trạng thái), 2 lâu đài. Không dùng hình khối làm nhân vật; mỗi loại có sprite và vũ khí riêng.
- Dữ liệu round/ranking/team ở RAM; mapping quà lưu đĩa. Single process; chưa có nhiều phòng, tài khoản người dùng hoặc cơ sở dữ liệu.

Mục tiêu 100–300 quân. Có đạn sprite riêng cho cung thủ/pháp sư; ảnh nhân vật mới được kiểm tra đủ 50 hàng animation có các frame khác nhau. Benchmark đo riêng CPU mô phỏng, không khẳng định FPS Safari vật lý; cần thử trên iPad thực của bạn trước buổi LIVE. Quân di chuyển tự động trên bản đồ mở; sông là trang trí, không có pathfinding chướng ngại vật.

## Scripts / kiểm thử

```bash
npm test                         # ở repo root: logic trận đấu + native TikTok adapter
npm run dev                      # watch server
cd live
npm run test:browser              # Chromium tại /usr/bin/chromium, server chạy sẵn
npm run assets                   # cần Python 3 + Pillow
```

Browser check tự khởi động server riêng ở cổng 3100 (đổi qua TEST_PORT), token test chỉ tồn tại trong tiến trình đó, dữ liệu mapping lưu thư mục tạm rồi xóa. Không đụng trận đang chạy ở cổng 3000. Test chạy trận qua timer server thật với tốc độ Demo 8×: di chuyển, gây sát thương, hurt/death, phá thành về 0 HP và xác nhận UI chiến thắng; đồng thời kiểm tra mapping, 300 quân, pause và API thiếu token.

```bash
# Nếu máy chưa có Chromium:
npx playwright install --with-deps chromium
npm run test:browser
# WebKit (trên máy hỗ trợ cài dependencies):
npx playwright install --with-deps webkit
BROWSER=webkit TEST_PORT=3101 npm run test:browser
```

Đã kiểm thử Chromium và WebKit headless trên Linux ở viewport 1440×1200, 820×1180, 390×844. WebKit không thay thế kiểm tra iPad vật lý. Xem `VERIFICATION.md`.

Server bind `0.0.0.0`, port mặc định 3000, thay bằng `PORT`. `.env.example` chỉ là mẫu; export biến từ shell hoặc dùng `node --env-file=.env src/server.js` ở thư mục live với Node 20.6+.

## Giấy phép / game cũ

Xem [THIRD_PARTY.md](THIRD_PARTY.md). Các file gốc `index.html`, `assets/`, `README.md`, `demo.gif`, `favicon.svg` không bị sửa. Bản mới chỉ phục vụ `live/public`; không phục vụ assets cũ. Để xem game cũ: `python3 -m http.server 8080` ở root và forward thêm cổng 8080.
