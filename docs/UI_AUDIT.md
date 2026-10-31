# Audit giao diện desktop, 29/10/2026

## Quyết định thiết kế

Nguồn quy tắc thiết kế: Taste Skill v2.1.5 đang cài, nhánh app screen. Style `true-black-flat`, seed `1801512945`, lưu tại `.taste-skill/direction.json`. Chọn hướng này vì phiên chơi dài cần bề mặt trung tính và chữ rõ; không redraw. Giữ React, CSS và IBM Plex Sans có sẵn, gồm subset tiếng Việt.

Ba dial theo brief: Design Variance 4/10, Motion Intensity 2/10, Visual Density 9/10. Đây là giá trị định hướng của brief, không phải thông số do bộ draw sinh ra.

Dark là mặc định cho cài đặt mới. Mỗi thời điểm, toàn bộ shell, workspace và overlay dùng cùng theme từ main. Giữ lựa chọn sáng/tối có sẵn và cấu hình đã lưu theo yêu cầu tương thích của project.

Điều chỉnh hình học theo brief dense desktop: titlebar 38 px có nút Windows native; sidebar 210 px; inspector 300 px; gutter 16 px; control 32 px; chữ nội dung 13 px, phụ đề hiện tại 16 px, metadata 11/12 px. Các panel phẳng phân biệt bằng độ sáng. Accent cũ chỉ dùng cho vùng OCR và focus. Không giữ radius 20 px/control pill của sheet vì brief yêu cầu công cụ desktop chặt, gọn.

## Dữ liệu và công việc

1. Nguồn capture là cửa sổ thật, tên và thumbnail do main cung cấp.
2. Vùng OCR dùng tọa độ chuẩn hóa và được kiểm tra sau khi nguồn đổi kích thước.
3. Một phiên thuộc một hồ sơ game; nguồn dữ liệu duy nhất là snapshot của main.
4. Text OCR, caption đang hiệu lực và lịch sử dịch có trạng thái riêng.
5. Hội thoại giữ người nói, người nghe, model, thời gian, token và chi phí đã báo.
6. Thuật ngữ và nhân vật lấy từ hồ sơ của phiên hiện tại, không sao chép sang state khác.
7. Người dùng thường xuyên bắt đầu, tạm dừng, dịch ngay và chỉnh vị trí overlay.
8. Command palette mở bằng Ctrl+K, tìm lệnh, chọn bằng phím mũi tên và Enter.
9. Khi chưa có key/model, OCR vẫn có thể chạy và UI nêu bước thiết lập cần thiết.
10. Dữ liệu thiếu hiện dấu gạch ngang thường hoặc câu mô tả; số 0 được giữ là 0.

Màn hình Dịch trả lời: đang đọc chữ gì, phụ đề hiện tại là gì? Preview và cặp nguồn/bản dịch là thành phần riêng của sản phẩm. Hồ sơ trả lời: cần giữ tên gọi và xưng hô nào? Cài đặt trả lời: dùng model nào, phím tắt nào và đọc phụ đề thế nào?

## Em-dash audit

- [x] **Pass**: Không có U+2014 hoặc U+2013 trong source, test, script, README, AGENTS, docs và direction JSON; các ký tự cũ được đổi thành U+002D.
- [x] **Pass**: Nhãn và thông báo Việt/Anh dùng cùng bộ key; nội dung giao diện không thêm chuỗi dấu gạch dài.

Phạm vi quét không gồm dependency, binary, ảnh chụp hoặc báo cáo máy sinh chứa nguyên văn quy tắc của công cụ bên ngoài.

## Pre-Flight Check, đối chiếu Section 14

Bản skill đang cài không có mục tên “Pre-Flight Check”. Section 14 trong `references/app-screens.md` là “Tells of generated dashboards”. Checklist dưới đây đối chiếu đủ 24 dòng của mục đó, không gán cho skill một checklist khác.

- [x] **Pass**: Sidebar cùng nền trung tính với canvas; lựa chọn không có vạch accent hoặc nền màu thương hiệu.
- [x] **Pass**: Tiêu đề là tên màn hình 20 px; không có lời chào hay emoji.
- [x] **Pass**: Không có hàng KPI hoặc icon đặt trong ô màu; thông tin đến từ phiên thực.
- [x] **Pass**: Không có delta phần trăm hoặc so sánh tăng trưởng bịa đặt.
- [x] **Pass**: Không có sparkline trên KPI.
- [x] **Pass**: Không có con số KPI cỡ lớn hoặc mang màu thương hiệu.
- [x] **Pass**: Không có biểu đồ area gradient hoặc spline trang trí.
- [x] **Pass**: Không có rainbow palette; màu chỉ phục vụ vùng OCR, focus và trạng thái.
- [x] **Pass**: Không có chart grid, trục hoặc legend không phục vụ công việc dịch.
- [x] **Pass**: Không có donut hoặc tổng số trong vòng tròn.
- [x] **Pass**: Panel phẳng dùng bước sáng; không ghép border với shadow lớn.
- [x] **Pass**: Hội thoại là cặp cột nguồn/bản dịch có rule nhẹ; không zebra hay header viết hoa giãn chữ.
- [x] **Pass**: Metadata thời gian/token/chi phí dùng tabular numerals, không tạo cột số rời rạc cần căn lại.
- [x] **Pass**: Trạng thái có chữ và dấu chỉ báo nhỏ; không dùng chip bão hòa với chữ trắng.
- [x] **Pass**: Primary đảo sáng/tối; nav và nút phụ dùng màu trung tính.
- [x] **Pass**: Titlebar có tên app, nguồn hiện tại, bảng lệnh và vùng dành cho nút cửa sổ native.
- [x] **Pass**: Không thêm Export/Share/date picker; chỉ có thao tác nghiệp vụ thật.
- [x] **Pass**: Production renderer lấy snapshot thật; mẫu QA nằm riêng trong script, không có số liệu quảng cáo.
- [x] **Pass**: Không pagination dưới danh sách ngắn; lịch sử có giới hạn hiện tại và mở thêm khi cần.
- [x] **Pass**: Grid theo capture, hội thoại và inspector; không dùng lưới bốn card bằng nhau.
- [x] **Pass**: Dark dùng nền đen/xám trung tính, không neon, glow hoặc glass.
- [x] **Pass**: Dấu ngoặc vùng OCR, preview theo tỷ lệ nguồn và cặp lời thoại tạo bản sắc Translate Game; font IBM Plex Sans được tải cục bộ.
- [x] **Pass**: Icon outline đơn sắc cùng phong cách, không tô màu theo từng mục.
- [x] **Pass**: Trạng thái rỗng giữ khung công việc và bước tiếp theo; không thêm minh họa vào chart giả.

## Layout-Zone Repetition audit

| Vùng hoặc màn hình | Cấu trúc                                                                     | Kết quả |
| ------------------ | ---------------------------------------------------------------------------- | ------- |
| Titlebar           | Một hàng ngang: tên app, nguồn, bảng lệnh, nút Windows native                | Pass    |
| Sidebar            | Logo, ba đích điều hướng, thông tin phiên, phím tắt ở cuối                   | Pass    |
| Thanh phiên        | Hồ sơ, phiên mới, chọn phiên cũ trong một hàng control                       | Pass    |
| Capture workspace  | Chọn nguồn, nút chạy/dừng, canvas preview giữ tỷ lệ, tọa độ mở rộng          | Pass    |
| Hội thoại          | Danh sách cặp nguồn/bản dịch, metadata và thao tác sửa/thử lại theo dòng     | Pass    |
| Inspector          | Cột 300 px: OCR, caption, dịch/overlay, tóm tắt, glossary dạng cặp, nhân vật | Pass    |
| Hồ sơ game         | Document chỉnh sửa với các nhóm nhân vật, quan hệ có hướng và thuật ngữ      | Pass    |
| Cài đặt            | Cột mô tả cạnh nhóm control, preview phụ đề cạnh thông số đọc                | Pass    |
| Command palette    | Dialog nổi: ô tìm, danh sách lệnh, trạng thái chọn, gợi ý phím ở chân        | Pass    |
| Statusbar          | Hàng thấp cố định: OCR cục bộ, model, hướng dịch                             | Pass    |

Các nhóm hồ sơ lặp hàng vì chúng là dữ liệu đồng cấp. Không lặp cùng một bố cục card cho mọi vùng. Ở chiều rộng hẹp, sidebar thành hàng điều hướng và inspector xuống sau hội thoại; không tràn ngang. Kích thước tối thiểu Electron hiện tại vẫn là 780 × 600; các ảnh 390 px là kiểm tra độ bền renderer, không phải cam kết ứng dụng mobile.

## Window & Shell discipline audit

- [x] **Pass**: Titlebar tùy biến dùng `titleBarStyle: hidden` và Windows Controls Overlay; Electron E2E xác nhận vùng titlebar native hiện diện.
- [x] **Pass**: Vùng trống titlebar kéo được; nút bảng lệnh có `no-drag`, vùng bên phải dành riêng cho nút native.
- [x] **Pass**: Main frame cuộn độc lập, shell và thanh trạng thái giữ ổn định; preview không bị ép tỷ lệ.
- [x] **Pass**: Mật độ dùng chữ 13 px/control 32 px/gutter 16 px; không còn lớp sheet inset và topbar phụ của bố cục trước.
- [x] **Pass**: Ctrl+K, phím mũi tên, Enter và Escape hoạt động; dialog giữ focus bên trong và trả focus về nút mở.
- [x] **Pass**: Lệnh dịch/pause bị khóa khi chưa sẵn sàng; lệnh gọi bridge typed hiện có, không thêm Node API vào renderer.
- [x] **Pass**: Bắt đầu/tạm dừng/dừng nằm trước preview; nút Lưu của Hồ sơ/Cài đặt nằm ở đầu màn hình.
- [x] **Pass**: Theme/locale dùng snapshot chung cho main và overlay, đổi giao diện không tự bật capture.
- [x] **Pass**: Không thêm animation xuất hiện; reduced-motion tắt dịch chuyển khi nhấn nút.

## Bằng chứng kiểm tra

| Kiểm tra                          | Kết quả                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| TDD shell/bảng lệnh               | 4 test bảng lệnh và 1 test cuộn khi điều hướng thất bại trước triển khai, sau đó cả 5 qua   |
| Unit/component                    | 123 test, 19 file qua                                                                       |
| TypeScript, ESLint, Prettier      | Qua                                                                                         |
| Build source                      | Qua; không đóng gói exe                                                                     |
| Electron build E2E                | 5/5 qua: titlebar, focus/bảng lệnh, settings/restart, OCR/preview/overlay, IPC              |
| Electron source E2E               | 1/1 qua: Vite cold cache, OCR offline, stop/restart, không reload ngoài ý muốn              |
| Renderer tương tác                | 36 tổ hợp: 3 màn hình × 3 chiều rộng × vi/en × light/dark, không tràn ngang hoặc page error |
| Taste source lint                 | 0 FAIL, 0 WARN                                                                              |
| Taste probes/rules qua Playwright | 18 tổ hợp: 3 màn hình × 3 chiều rộng × light/dark, 0 FAIL, 0 WARN                           |
| Kiểm tra ảnh                      | Đã xem 18 ảnh inspector ở 1440/768/390, bảng lệnh, phần cuối Cài đặt và preview có dữ liệu  |

`inspect.mjs` gốc đã được thử với Chrome và Edge nhưng đều timeout `Page.enable`. `scripts/inspect-desktop-ui.mjs` dùng nguyên probe, layout và rule của bản skill được truyền vào, thay transport bằng Playwright; không tắt rule để có kết quả đạt. Báo cáo chi tiết và ảnh lưu tại `.taste-skill/after/inspection/`; ma trận vi/en và tương tác tại `.taste-skill/after/screens/`. Các thư mục này được gitignore vì là đầu ra kiểm tra.

Electron trong sandbox công cụ bị Windows chặn đọc runtime. E2E chạy lại ngoài sandbox đã qua, không tắt sandbox bảo mật của Electron. Không gọi OpenRouter trả phí. Build vẫn có cảnh báo externalize `fs/path/crypto` từ OpenCV có sẵn; kiểm tra OCR offline đã qua.

Mẫu visual QA: hồ sơ “Lời tiên tri”, nguồn “Gameplay fixture”, nhân vật Atreus, thuật ngữ Odin, câu gốc/bản dịch đi cùng ảnh fixture `atreus-scene.png`, model `preview/subtitle-model`, OCR 37 ms và API 420 ms. Đây là dữ liệu mẫu chỉ trong script kiểm tra, không phải phép đo hiệu năng hoặc nội dung được chèn vào ứng dụng.

Chưa kiểm tra thủ công nhiều màn hình và nhiều mức Windows scaling trong lượt này. E2E đã kiểm tra tỷ lệ nguồn, resize và kích thước preview tại DPI hiện tại; kết quả đó không thay thế ma trận phần cứng.

## Tái chạy

Sau `npm run build`, mở preview bằng `node scripts/preview-ui.mjs`. Chạy `node scripts/check-desktop-ui.mjs` và `node scripts/inspect-desktop-ui.mjs <thư-mục-Taste-Skill-đang-cài>`. Script inspector chỉ thay transport, đọc quy tắc từ skill hiện có, không sao chép một bản quy tắc riêng vào project.
