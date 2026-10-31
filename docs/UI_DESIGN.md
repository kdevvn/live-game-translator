# Quyết định giao diện

## Giao diện desktop hiện tại - 29/10/2026

- Brief mới thay hướng framed-sheet bằng true-black-flat, seed 1801512945. React/CSS và IBM Plex Sans được giữ; nền tối trung tính thống nhất, control gọn, inspector theo snapshot phiên và command palette Ctrl+K.
- Sidebar 210 px, titlebar 38 px với nút native Windows, gutter 16 px; bỏ sheet inset/topbar phụ. Preview giữ tỷ lệ nguồn, hội thoại là hai cột, chi tiết OCR/caption/glossary nằm trong inspector. Nút chạy và nút Lưu hiện ngay trước vùng công việc.
- Dark là mặc định mới, không ghi đè cấu hình đã lưu. Mỗi thời điểm toàn ứng dụng dùng một theme từ main; khả năng sáng/tối và vi/en có sẵn được giữ.
- Audit, checklist đủ mục Section 14, lý do điều chỉnh sheet và kết quả kiểm tra được ghi tại [UI_AUDIT.md](UI_AUDIT.md). Các mục có ngày cũ bên dưới là lịch sử quyết định.

## Preview theo khung và tỷ lệ cửa sổ - 28/10/2026

- Giữ hướng framed-sheet và toàn bộ bố cục/token hiện có; áp dụng Taste Skill nhánh app screen, không redraw. Preview trả lời “Đang đọc phần nào của cửa sổ?” nên vùng chọn bám toàn bộ hình, không thêm letterbox hoặc ép tỷ lệ video con.
- CSS ghi rõ height: auto và object-fit: contain. Encoder khớp chiều rộng pixel vật lý theo DPI, không tăng giới hạn Full HD/60 fps; source 16:9 và 16:10 được kiểm tra bằng Electron, gồm cả tỷ lệ video và khung DOM, source resize/app resize và kết nối lại.
- Taste lint/inspect màn hình Dịch trên renderer build với bridge thử đạt 0 FAIL/0 WARN; đã xem đủ sáu ảnh fold/page ở 1440/768/390 px trong `.taste-skill/inspect/preview-fit/`. Đã xem bốn ảnh preview video thật trên Electron ở vi/en × sáng/tối và ảnh nguồn 16:10; vùng chọn bám khung, tỷ lệ đúng. Chữ nhỏ của cửa sổ lớn vẫn nhỏ khi thu vào preview; không dùng ảnh nguồn thử để khẳng định chất lượng video YouTube thực tế.

## Thời gian tự ẩn và video preview - 28/10/2026

- Giữ framed-sheet, seed 772522578, IBM Plex Sans và token hiện có; không redraw. Câu hỏi bổ sung tại Cài đặt: “Phụ đề ở lại bao lâu?”. Ô nhập giây nằm cùng nhóm cỡ chữ/độ đậm nền, mặc định 5, cho 1-60, có mô tả khi câu mới hiện lại. Preview video giữ vùng chọn và tỷ lệ nguồn; không thêm số liệu FPS chưa đo vào giao diện.
- Áp dụng quy trình app screen của Taste Skill. Đã kiểm tra/lưu giá trị 8 giây trên production renderer qua bridge thử, chụp và xem tám ảnh vi/en × sáng/tối × 1440/390 px trong `.taste-skill/screens/overlay-duration/`; không tràn ngang, nhãn/dấu tiếng Việt đầy đủ. Script: `node scripts/check-overlay-ui.mjs` sau khi chạy preview server.
- Taste lint: 0 FAIL/0 WARN. Inspect Cài đặt: 1 FAIL contrast cho preview cũ (công cụ bỏ qua rgba nền tối nên tính nhầm trắng trên trắng), 1 WARN tiny-text do các dòng trợ giúp 12 px có sẵn và hint mới theo cùng quy ước. Đã xem toàn bộ sáu ảnh fold/page trong `.taste-skill/inspect/overlay-duration/`: chữ caption thực nằm trên nền tối; không tắt kiểm tra hoặc coi kết quả công cụ là đạt hoàn toàn.
- Kiểm tra Electron riêng xác nhận video Full HD, resize, kết nối lại sau chuyển màn hình và overlay rỗng/hết hạn. Screenshot browser chỉ chứng minh bố cục, không chứng minh tốc độ 60 fps.

## Model thực tế của từng lời thoại - 28/10/2026

- Giữ Taste app screen framed-sheet seed 772522578. Thêm dòng Model trên thời gian/token/chi phí, cùng typography và màu metadata hiện có. ID dài cho phép wrap; thiếu model hiển thị chưa có dữ liệu, không lấy router đang chọn để thay thế.
- Đã xem bốn screenshot vi/en × sáng/tối qua preview build, model `preview/actual-subtitle-model:free` chỉ là fixture QA. Kiểm tra thao tác và không tràn ngang ở 390 px đạt. Taste lint/inspect hội thoại đạt 0 FAIL/0 WARN; đã xem đủ sáu ảnh fold/page 1440/768/390 tại `.taste-skill/inspect/model/`.
- Nhận xét: metadata phân cấp dưới bản dịch, mép thẳng hàng, tên model đọc được trong hai theme và không che nút sửa. Không thêm biểu đồ hoặc control. Kiểm tra renderer được bổ sung bằng bốn E2E Electron build; không thay thế kiểm chứng API bằng key thật.

## Chi phí từng lời thoại - 28/10/2026

- Giữ hướng Taste app screen framed-sheet seed 772522578; thêm dòng Chi phí dưới token, dùng typography/màu metadata hiện có. Không thêm control, màu theme hoặc dashboard.
- Câu hỏi là “Lần dịch này tốn bao nhiêu USD?”. Intl dùng locale giao diện; 0 khác dữ liệu thiếu, số dương quá nhỏ hiện < giới hạn hiển thị. Fixture visual 0.00001234 USD chỉ là số mẫu, không phải request trả phí thực tế.
- Đã kiểm tra giá tiền định dạng đúng và xem bốn ảnh hội thoại vi/en × light/dark qua preview build. Không tràn ngang ở 390 px; dòng phí đọc được, không lấn nút sửa. Taste lint/inspect hội thoại đạt 0 FAIL/0 WARN; đã xem đủ sáu ảnh fold/page 1440/768/390 tại `.taste-skill/inspect/cost/`. Không thay CSS hoặc bố cục cài đặt.

## Ngưỡng lọc trùng và token - 28/10/2026

- Áp dụng Taste Skill app screen, giữ framed-sheet seed 772522578, IBM Plex Sans và token sáng/tối. Không redraw. Cài đặt trả lời “Cần bỏ qua câu giống nhau ở mức nào?”; dòng metadata hội thoại trả lời “Lần này đã dùng bao nhiêu token?”. Không thêm KPI/chart hoặc màu trang trí.
- Ngưỡng là input số 0-100, mặc định 80; hint giải thích tắt lọc, thao tác thủ công, rủi ro bỏ sót và nguyên hoa thường gửi AI. Token ở dòng phụ dưới OCR/API, cùng font số hiện có; thiếu dữ liệu hiện dấu -, 0 chỉ dùng cho số 0 thật hoặc cache cục bộ đã gắn nhãn.
- Đã kiểm tra thao tác và xem tám ảnh hai vùng mới ở vi/en × sáng/tối trên production renderer qua preview bridge; số 420/36 và câu mẫu chỉ là fixture. Script tái chạy `node scripts/check-usage-ui.mjs` sau mở preview server. Kiểm tra thêm không tràn ngang ở 390 px cho cả hai màn hình/bốn tổ hợp.
- Taste lint đạt 0 FAIL/0 WARN. Inspect hội thoại đạt 0 FAIL/0 WARN; settings báo 1 FAIL contrast và 1 WARN tiny-text. Đã xem đủ 12 ảnh fold/page ở 1440/768/390 của hai report: contrast vẫn là false positive đã biết của chữ trắng trên preview nền rgba tối, công cụ đọc nhầm nền trắng. Tiny-text do phần trợ giúp dài dùng cỡ 12 px như các hint hiện có, không phải giá trị chính; giữ theo hệ chữ hiện tại, có line-height 1,6 và không cắt chữ. Không tắt rule inspector hoặc tuyên bố settings đạt 0 lỗi đo.
- Nhận xét: mép control và nhóm metadata thẳng hàng; số token dễ phân biệt với thời gian ms, sáng/tối đọc được, màn hình hẹp xếp dọc. Phạm vi visual QA là renderer; E2E riêng kiểm tra cấu hình qua Electron thật.

## Hướng thiết kế

Áp dụng skill **Taste Skill: Design Taste Frontend**, quy trình app screen. Style `framed-sheet`, seed `772522578`, thông tin gốc tại `.taste-skill/direction.json`. Không redraw.

- Người dùng mở ứng dụng trong các phiên chơi dài; công việc thường xuyên là chọn nguồn, nhìn câu gốc/bản dịch và sửa xưng hô khi cần.
- Các đối tượng thật là cửa sổ nguồn, vùng chữ, lời thoại, hồ sơ game, nhân vật, quan hệ và thuật ngữ. Không tạo số liệu tăng trưởng hoặc dashboard trang trí.
- Màn hình Dịch trả lời: “Đang nhận chữ gì, bản dịch là gì?” Preview vùng chữ ở cạnh nội dung nhận dạng; hội thoại thành hai cột tiếng Anh/tiếng Việt.
- Màn hình Hồ sơ trả lời: “Cần giữ tên gọi và quan hệ nào?” Quan hệ có hướng là thành phần riêng của sản phẩm.
- Màn hình Cài đặt trả lời: “Dùng model nào và đọc bản dịch như thế nào?” Có preview phụ đề bên cạnh cấu hình cỡ chữ/nền.

Chọn sắc xanh xám rất nhẹ cho khung, chữ và mặt phẳng trung tính; accent teal từ style dùng ở dấu nhận diện và vùng chọn. Font IBM Plex Sans được đóng gói cục bộ, gồm bộ ký tự Vietnamese. Hai theme dùng cùng bố cục; dark là sắc trung tính theo yêu cầu người dùng, chuyển độ sáng bề mặt thay vì thêm hiệu ứng. Đây là cách mở rộng style sáng sang theme tối, không chọn hai bộ component độc lập.

Logo là hai dấu ngoặc giữ các dòng phụ đề, vẽ bằng SVG trong giao diện và bằng canvas cho icon bộ cài. Không dùng ảnh stock, ảnh remote hoặc hình minh họa giả làm gameplay. Nguồn thử “The Northern Gate” là fixture tổng hợp, không phải game hoặc bản dịch đã được nhà phát hành xác nhận.

## Kiểm tra hình ảnh

- Chạy Taste lint và inspect ở chế độ app trên renderer production qua preview bridge riêng, không thay IPC production bằng mock.
- Bốn tổ hợp `vi/en × light/dark` ở 1440, 768 và 390 px đều được đo; các report nằm trong `.taste-skill/inspect/` cục bộ.
- Hồ sơ/Cài đặt được chụp thêm ở 1440 và 390 px qua `scripts/check-ui.mjs`. Test browser hẹp kiểm tra bố cục co giãn; không mở rộng phạm vi sang mobile.
- E2E riêng kiểm tra Electron thật, theme/locale đồng bộ và capture/OCR offline. Kết quả browser không được dùng thay kết quả capture Windows.

## Nhận xét sau vòng đầu

- Thứ tự thao tác và nhãn rõ, font tiếng Việt không mất dấu, control có tên truy cập tách khỏi hint.
- Ban đầu preview rỗng quá cao, đẩy hội thoại xuống dưới màn hình; đã giảm khoảng trống để phần hội thoại xuất hiện sớm hơn.
- Theme tối giữ được phân cấp chữ/bề mặt mà không dùng màu navy hoặc glow.
- Không có số liệu giả để kiểm tra tổng; số lời thoại hiển thị lấy trực tiếp từ danh sách trong snapshot.
- Màn hình nhỏ xếp khối nguồn/OCR theo chiều dọc; phần điều khiển vẫn đọc được và không tràn ngang. Bản Windows vẫn có kích thước cửa sổ tối thiểu riêng.

Đánh giá nội bộ, không phải điểm từ người dùng: câu hỏi chính 8/10, lưới và căn chỉnh 8/10, phân cấp màu/chữ 8/10, trạng thái dữ liệu 8/10. Hạn chế còn lại: cần xem hội thoại thật ở mật độ cao và chạy thử lâu trên cấu hình máy khác; không suy ra chất lượng dịch AI từ ảnh UI.

## Overlay OCR khi chưa cấu hình dịch - 28/10/2026

Cập nhật theo yêu cầu mới: overlay không hiển thị câu hướng dẫn thay cho caption trống, kể cả khi đang chỉnh vị trí. Thanh kéo/khóa vẫn có trong chế độ chỉnh; vùng chữ của màn hình chính giữ hướng dẫn riêng.

- Giữ style framed-sheet, seed 772522578; không redraw, không đổi font/palette/CSS. Caption là chữ OCR thật từ nguồn thử khi chưa có key hoặc model. Trạng thái rỗng nêu rõ chữ nhận dạng sẽ xuất hiện tại đây, Việt/Anh đều có key tương ứng.
- Câu hỏi của overlay: “Chữ vừa nhận dạng là gì và có thể đặt phụ đề ở đâu?” Caption là nội dung lớn nhất; trợ giúp kéo và nút khóa nhỏ hơn, không che chữ. Nguồn thử là hội thoại tổng hợp, không phải bản dịch AI.
- Đã xem bốn screenshot overlay trên Electron thật ở vi/en × light/dark: chữ OCR rõ, nút khóa và trợ giúp vừa chiều ngang, không cắt nội dung thử. Hai theme giữ caption trắng trên nền phụ đề tối để đọc được trên cảnh game.
- Taste lint và inspect màn hình Dịch bản build (preview bridge, vi/light, 1440/768/390) đạt 0 FAIL/0 WARN; đã xem đủ sáu ảnh fold/page, bố cục giữ nguyên. Overlay kiểm tra trực tiếp trên Electron, không thêm tiêu đề trang vào cửa sổ phụ đề để làm vừa quy tắc inspector.

## Dropdown model có tìm kiếm - 28/10/2026

- Giữ framed-sheet, seed 772522578, IBM Plex Sans và token sáng/tối hiện có; không redraw. Câu hỏi của control: “Tìm và chọn model dịch nào, ưu tiên model miễn phí?”. Tên model là dòng chính, ID là dòng phụ, nhãn miễn phí dùng màu trạng thái và chữ để không phụ thuộc riêng màu.
- Combobox tìm theo tên/ID, giữ model cũ khi Escape/blur, không lưu chuỗi tìm kiếm. Hỗ trợ mũi tên/Enter, click, option đang chọn và không có kết quả. Menu cuộn có giới hạn chiều cao, không đổi bố cục form.
- Đã kiểm tra thao tác và xem 12 screenshot dropdown mở trên production renderer: vi/en × sáng/tối × 1440/768/390 px; không tràn ngang. Script tái chạy: `node scripts/preview-ui.mjs`, sau đó `node scripts/check-model-select.mjs`.
- Alpha, Beta, Zeta và ID `preview/*` chỉ là fixture trong preview bridge khi có query `models=1`; không đi vào ứng dụng production và không phải cam kết giá của model OpenRouter thật.
- Taste lint đạt 0 FAIL/0 WARN. Taste inspect màn hình Cài đặt đo ba kích thước, báo 1 FAIL contrast cho preview phụ đề có sẵn: công cụ tính chữ trắng trên nền trắng, bỏ qua nền `rgba(0,0,0,0.85)`. Đã xem đủ sáu screenshot fold/page: preview thực tế là chữ trắng trên nền tối, không phải lỗi tương phản hiển thị. Giữ kết quả đo nguyên bản, không tắt kiểm tra contrast toàn trang.
- Nhận xét: control và menu cùng mép; tên/ID rõ ở ba chiều rộng, focus và lựa chọn đọc được trong hai theme. Giữ phân cấp cũ, không thêm trang trí. Không có số liệu hoặc biểu đồ cần đối chiếu tổng; chất lượng kiểm tra ở đây chỉ thuộc giao diện.

## Bản dịch xuất hiện dần - 28/10/2026

- Giữ framed-sheet, seed 772522578, typography, token và bố cục hiện có; không redraw. Câu hỏi chính: “Bản dịch đang nhận là gì?”. Dòng pending có thể chứa bản nháp; chỉ khi toàn bộ response hợp lệ mới chuyển sang hoàn tất.
- Đã kiểm tra và xem tám screenshot màn hình chính/overlay ở vi/en × sáng/tối trên production renderer với preview bridge `stream=1`. Câu mẫu chỉ là fixture UI, không phải bằng chứng chất lượng AI. Bản nháp đọc được, không lộ JSON; overlay giữ chữ sáng/nền tối.
- Taste lint và inspect đạt 0 FAIL/0 WARN; đã xem đủ sáu ảnh fold/page ở 1440/768/390 px trong `.taste-skill/inspect/streaming/`. Các mép/cột và phân cấp chữ giữ nguyên; bố cục hẹp xếp dọc, không tràn ngang. Kiểm tra hẹp chỉ xác nhận renderer, không mở rộng sang mobile.
- Giới hạn: snapshot pending vẫn dùng nhãn và số API hiện có; API chỉ có thời gian hoàn tất khi request kết thúc. Metadata thời gian chờ/hiện chữ được đo riêng, chưa thêm dashboard hoặc control mới.
