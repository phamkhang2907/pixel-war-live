# PIXEL WAR — RED VS BLUE

Node.js 20+, Phaser 3, Socket.IO. Bản hiện tại tiếp tục repo/branch `feature/pixel-war-live`, không tạo repo mới. Viewport livestream **540×960 (9:16)** nhìn vào chiến trường side-scrolling rộng **1800×960**. Hai thành ở x=100 và x=1700; kéo ngang, cuộn chuột hoặc dùng Red castle / Follow battle / Blue castle để xem.

## Chạy và chơi Demo

Tại root repo:

```bash
npm run setup
npm run build
npm test
npm start
```

Mở http://localhost:3000. Terminal in **Admin token**; chọn **Stream setup**, nhập token và **Unlock controls**. Có thể đặt `ADMIN_TOKEN` cố định qua biến môi trường. Token nằm trong sessionStorage của tab, không có trong URL overlay. `npm start` tự build trước khi chạy.

1. Chọn Team Red hoặc Team Blue, chọn 1/5/10 quân mỗi lần và bấm `+` cạnh một trong **sáu** loại quân. Đây là direct spawn, không phụ thuộc mapping quà.
2. **Simulate a gift**: tên người tặng, coin **mỗi quà**, số lần lặp; **Send demo gift** dùng mapping Admin hiện tại.
3. **Like Energy**: các nút +100/+300/+500/+1000/+3000/+5000 tim tính cho phe đang chọn. Bảng mốc thưởng trong panel và HUD hiển thị năng lượng, mốc tiếp theo, Fury cooldown, Haste.
4. **Auto Battle** tự gửi quà cho hai phe. **Stress test** chọn 100/200/300 quân hỗn hợp. Tổng quân đang sống + corpse chưa xóa không vượt 300; khi đầy, các lần spawn dư bị bỏ qua, không xếp hàng. Coin/like vẫn được ghi nhận, mốc vẫn được đánh dấu nhận.
5. **Pause / Resume**, **Reset Battle**, âm thanh bật theo thao tác người dùng, tốc độ Demo 1×/2×/4×/8×. Quân chết phát death trước khi xóa; client giữ animation khi server chạy nhanh.
6. Khi một thành còn 0 HP, game báo chiến thắng và dừng chiến đấu. Reset mở vòng mới, xóa năng lượng, cooldown, boost, ranking; phe đã chọn của người xem vẫn giữ.

OBS Browser Source: http://localhost:3000/?overlay=1, kích thước 540×960 hoặc 1080×1920. Overlay có HP/điểm hai phe, đồng hồ, số quân, năng lượng và top 3 đóng góp. Dashboard có leaderboard top 5 và feed chi tiết.

## Sáu lớp quân

| ID tương thích | Loại | HP | Damage | Cơ chế |
|---|---|---:|---:|---|
| sword | Swordsman | 100 | 15 | Cận chiến; speed 65, cooldown 0.85s |
| archer | Archer | 65 | 20 | Arrow thật; range 280, cooldown 1.3s; đánh được trên không |
| cavalry | Cavalry | 180 | 35 | Speed 110; charge 1.65× tốc độ, đòn va chạm 1.8× sát thương; nạp lại 6s |
| mage | Flying Mage | 100 | 50 | Bay và lơ lửng; fireball range 230, splash 85; đánh được trên không |
| guardian | Giant Guardian | 900 | 35 | Sprite 2.5×; khiên giảm 45% sát thương vật lý phía trước; stomp 35 AoE, radius 135, đẩy 48px, cooldown 6s |
| boss | War Titan | 2500 | 120 | Sprite 3.4×; ưu tiên thành, chỉ đánh quân chắn đường đã vào melee; stomp AoE radius 175 mỗi 5s; dưới 40% HP nổi giận, damage +25%, tốc độ đánh +20% |

Ground melee và stomp không đánh được pháp sư bay. Chỉ Archer / Mage có anti-air; kỹ năng đội Fury và Arrow rain có thể đánh trên không. Arrow/fireball là thực thể server có thời gian bay, theo mục tiêu; sát thương xảy ra khi chạm, không phải lúc phát animation. Pháp sư gây sát thương splash thật. Va chạm dùng hình tròn mềm theo bán kính và tầng cao độ; quân bay không bị bộ binh chặn. Đây là va chạm gameplay, nhân vật hiển thị bằng sprite PNG.

Guardian có khiên vật lý theo hướng; phép, stomp và Fury xuyên giảm sát thương khiên. Khi Guardian/Titan đánh đơn mục tiêu trong lúc stomp sẵn sàng, đòn thường và phần AoE đều có tác dụng. Các con số bonus/skill này là cấu hình cân bằng trong `src/characters.js` và `src/game.js`.

## Artwork và animation

Bộ art mới tự tạo, không dùng Tiny Swords hoặc bundle của island-defense-demo. Có **12 PNG 512×512** (6 lớp × 2 phe). Frame **64×64**, 8 cột × 8 hàng:

| Hàng | Animation | Frame indices |
|---:|---|---|
| 0 | idle | 0–7 |
| 1 | run | 8–15 |
| 2 | attack | 16–23 |
| 3 | hurt | 24–31 |
| 4 | death | 32–39 |
| 5 | fly | 40–47 |
| 6 | stomp | 48–55 |
| 7 | rage | 56–63 |

Death 10 FPS, repeat=0; stomp/rage 12 FPS, repeat=0; các state khác 12 FPS, loop. Chỉ lớp phù hợp dùng fly/stomp/rage. `public/assets/sprites.json` khai báo metadata, `src/characters.js` là cấu hình dùng chung server/client. Horse có gait, Mage có cánh/staff, Guardian có khiên lớn, Titan có sừng/giáp/axe. Animation thay đổi silhouette, chân, vũ khí và phản ứng trúng đòn; không dùng emoji/hình khối làm lính.

Background sky / mountain / forest là PNG riêng với parallax; terrain raster/graphics tĩnh, bụi, tia lửa, projectile, meteor/ice và damage text có giới hạn số lượng. `npm run assets` tái tạo art bằng Python + Pillow; `npm run assets:check` xác nhận cả 96 hàng animation không phải frame tĩnh lặp. Hai thành nguyên bản của game standalone vẫn được giữ.

## Gift mặc định / Admin

| Coin mỗi quà | Triệu hồi |
|---:|---|
| Rose / 1 | 1 Swordsman |
| 10 | 1 Archer |
| 50 | 1 Cavalry |
| 100 | 1 Flying Mage |
| 200 | 1 Giant Guardian |
| 1000 | 1 War Titan |

Mapping dùng ngưỡng coin **mỗi quà**, chọn ngưỡng cao nhất ≤ giá trị quà. Streak 3 quà 50 xu = 3 Cavalry và 150 coin đóng góp, không tự nâng thành loại quân khác. Repeat tối đa 100 cho một event. Chỉ tính khi streak kết thúc; chống trùng bằng msgId. Quà chưa biết giá trị bỏ qua.

Admin sửa ngưỡng/loại/số lượng trong Stream settings; Save ghi `live/data/rules.json` và nạp lại sau restart. Không tự ghi đè mapping cũ; nút **Restore default gift rules** lưu lại sáu mốc trên. Dùng `DATA_DIR` để chọn thư mục lưu khác. Score team là tổng coin; leaderboard xếp theo coin×10 + likes/100 và hiển thị riêng coin/like để đọc được đóng góp.

## Like Energy và Fury

**Tích lũy theo phe, không tiêu hao**. Mỗi mốc nhận **một lần mỗi trận**; một batch vượt nhiều mốc sẽ nhận từng mốc một lần. Snapshot không kích hoạt thưởng. Đổi phe chỉ ảnh hưởng các event sau; đóng góp trước đó không chuyển phe.

| Tổng tim phe | Phần thưởng |
|---:|---|
| 100 | 3 Swordsman |
| 300 | 2 Archer |
| 500 | Hồi 100 HP thành, không vượt 10000 |
| 1000 | 1 Guardian |
| 3000 | 24 projectile mưa tên, 20 damage / mũi, splash 55 |
| 5000 | Attack speed +20% trong 15 giây mô phỏng, không cộng dồn |

**Fury là cơ chế riêng:** 500 tim trong cửa sổ trượt 10 giây **thời gian thực**. Mỗi phe có cooldown thực 60 giây. Sau khi nổ Fury, cửa sổ được xóa; batch/like trong cooldown vẫn tính năng lượng nhưng không nổ thêm Fury. Sau cooldown cần đủ tim mới trong 10 giây gần nhất. Red Fury = meteor shower; Blue Fury = ice storm; cả hai gây **60 HP lên mỗi quân địch đang sống, kể cả quân bay, và 120 HP lên thành địch**. Không áp slow riêng cho Blue để giữ ngang sức.

Fury dùng đồng hồ thực, không nhanh hơn khi Demo 8×. Di chuyển, cooldown quân và buff 15s dùng thời gian mô phỏng; Demo 8× cố ý làm chúng nhanh 8 lần. LIVE tự về 1×. Khi pause, event gift/like vẫn được tiếp nhận (gồm thưởng/Fury); vòng di chuyển/đòn đánh/projectile dừng.

## TikTok connector độc lập

Bình luận chính xác **1** = Đỏ, **2** = Xanh. Gift/like chỉ tính nếu người đó đã chọn phe. Adapter native v2.5 dùng `user`, `giftDetails`, `common`, `likeCount` (số tăng của event, không dùng totalLikeCount). Event like có msgId được chống lặp trong bộ nhớ 5000 IDs; nếu nền tảng gửi event thiếu ID thì không bảo đảm exactly-once. Không khôi phục state qua restart.

`src/tiktok-connection.js` tách lifecycle khỏi simulation: timeout 12s, guard kết nối cũ, bắt lỗi payload và disconnect. Kết nối lỗi quay lại Demo, quân vẫn đánh. TikTok thật có thể yêu cầu `EULER_API_KEY`; chưa thử tài khoản LIVE thật trong môi trường này. Không cần key để chơi Demo.

## Codespaces và Safari iPad

Giữ branch `feature/pixel-war-live`. Devcontainer tự cài npm dependencies và khai báo forward port 3000. Chạy `npm start`, tab **Ports → 3000 → Open in Browser**. Mở cùng URL `https://<codespace-name>-3000.app.github.dev` trên Safari iPad; đăng nhập GitHub nếu port private. Không mở localhost của iPad. Overlay không cần token; thao tác Admin cần token.

Client bundle target Safari 15+, Phaser AUTO có Canvas fallback, touch kéo camera và nút chuyển vùng, WebSocket/polling Socket.IO tự reconnect. Âm thanh cần chạm bật. WebKit headless đã kiểm tra; chưa kiểm tra iPad vật lý. Không cam kết 60 FPS thiết bị thật.

## Build / test

```bash
npm run build
npm test
cd live
npm run assets:check                # Python + Pillow
npm run test:browser                # server test riêng 3100, data/token tạm
BROWSER=webkit TEST_PORT=3102 npm run test:browser
```

Cài browser test nếu cần: `npx playwright install --with-deps chromium webkit`. `CHROMIUM_PATH` chọn executable, `PLAYWRIGHT_BROWSERS_PATH` chọn nơi cài. Test bao gồm trận qua server timer thật, 300 quân, camera ngang, gift, like, ranking, pause, overlay, viewport desktop/iPad/mobile, API token, JavaScript errors. Xem `VERIFICATION.md` cho kết quả thực tế.

`npm run dev` watch backend sau build ban đầu; khi sửa client cần chạy lại `npm run build` và refresh. Biến PORT mặc định 3000; DATA_DIR, ADMIN_TOKEN, EULER_API_KEY là env server. `.env.example` không tự nạp: dùng shell hoặc `node --env-file=.env src/server.js` từ live/ với Node 20.6+.

## Giới hạn hiện tại

Single process / single room, state ở RAM trừ mapping quà. Server 20 Hz, spatial hash 160px và va chạm mềm; không có rigid-body/obstacle pathfinding. Hard cap 300 unit kể cả corpse; cap 600 projectile và 140 effect event. Client ẩn nhãn tên trên 90 quân, giới hạn particle/damage text, parallax/scenery dựng một lần, chỉ gửi các field unit cần render. Chưa có auth nhiều quản trị viên, lưu trận, reconnect event replay, nhiều phòng hoặc load test hàng nghìn người xem. Không tạo hoặc đẩy repository mới trong lần cập nhật này; repo hiện tại chưa cấu hình remote được cấp quyền.

License mã/art mới MIT trong `LICENSE`; dependency connector có AGPL-3.0 kèm ngoại lệ. Xem `THIRD_PARTY.md`.
