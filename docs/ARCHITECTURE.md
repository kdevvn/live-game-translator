# Kiến trúc ứng dụng dịch cửa sổ trên Windows

## 1. Mục tiêu và phạm vi

Ứng dụng desktop nhận hình từ cửa sổ người dùng chọn, nhận dạng chữ bằng OCR, dịch qua OpenRouter, LM Studio hoặc Ollama và hiển thị phụ đề nổi. Không phụ thuộc riêng vào PS Remote Play; có thể thử bằng trình phát video, trình duyệt hoặc Notepad trước.

Mục tiêu chính:

- Chọn cửa sổ và vùng chữ cần dịch; hỗ trợ dịch bằng phím tắt và tự động.
- Giữ ngữ cảnh hội thoại, thuật ngữ và cách xưng hô tiếng Việt theo hồ sơ game.
- Giao diện có theme sáng/tối, tiếng Việt và tiếng Anh; mặc định tiếng Việt.
- Chạy cục bộ trên Windows; chỉ nội dung cần dịch và ngữ cảnh liên quan được gửi đến OpenRouter.
- Cấu trúc đơn giản, phát triển theo TDD, DRY và YAGNI.

Bản đầu nhắm Windows 11 x64. Chưa xây backend, tài khoản, đồng bộ cloud, ứng dụng mobile, nhận dạng giọng nói hoặc client Remote Play riêng. Không cam kết capture được nội dung có bảo vệ, cửa sổ thu nhỏ hoặc mọi chế độ toàn màn hình.

## 2. Công nghệ

| Thành phần      | Quyết định                                                                      |
| --------------- | ------------------------------------------------------------------------------- |
| Desktop         | Electron + TypeScript với strict mode                                           |
| Giao diện       | React + CSS, Tailwind CSS và DaisyUI, build bằng electron-vite                  |
| API dịch        | HTTP đến OpenRouter từ main process                                             |
| OCR             | PaddleOCR.js chính thức, PP-OCRv5 mobile det + en mobile rec, ONNX WASM cục bộ  |
| Lưu dữ liệu     | SQLite do main sở hữu, migration có phiên bản                                   |
| API key         | Electron safeStorage; lưu bản mã trong thư mục dữ liệu ứng dụng                 |
| Đa ngôn ngữ     | i18next + react-i18next, tài nguyên cục bộ                                      |
| Test            | Vitest, React Testing Library; Playwright cho luồng tích hợp Electron cần thiết |
| Phong cách code | ESLint + Prettier; quy định trong CODE_RULES.md                                 |

DaisyUI được tích hợp theo yêu cầu; không thêm UI framework, state library hoặc ORM khác khi chưa có yêu cầu cụ thể. Tailwind không bật preflight để giữ CSS hiện có. PaddleOCR thay Tesseract để nhận dạng phụ đề gameplay; model dịch là cấu hình người dùng, không có model trả phí ngầm định.

## 3. Ranh giới tiến trình

Main tạo hai transport OpenRouter cho toàn vòng đời ứng dụng bằng Undici Agent riêng: pool dịch tối đa hai socket và pool nền tối đa bốn socket cho danh sách model, tóm tắt và hồ sơ AI. Hai pool độc lập, HTTP/1.1, pipelining 1, keepAliveTimeout/keepAliveMaxTimeout 60.000 ms; server có thể đóng sớm hơn. Dịch vẫn tuần tự và tái sử dụng kết nối, tác vụ nền được chạy song song mà không chiếm socket dịch. Không thay global dispatcher hoặc dùng fetch.keepalive của trình duyệt để điều khiển TCP. Khi before-quit: hủy tác vụ trước, destroy cả hai pool để giải phóng request đang chờ; cleanup idempotent, không chặn luồng quit để đợi stream.

SSE đọc đến HTTP EOF sau event DONE; không cancel body thành công khi server chưa gửi hết HTTP vì việc đó có thể phá socket. Lỗi/abort vẫn cancel reader; HTTP status lỗi phải giải phóng body trước khi ném lỗi. Timeout bao phủ cả đọc body đến EOF: dịch và tải danh sách model là 20 giây, tóm tắt và hồ sơ là 240 giây; bản nháp tiếp tục được phát khi nhận chữ trước đó. Không nới retry hoặc đổi cache/reasoning vì Keep-Alive.

```text
Renderer giao diện ←→ Preload / IPC ←→ Main
                                         ├── Dịch qua OpenRouter
                                         ├── Ngữ cảnh và SQLite
                                         ├── Settings, API key, phím tắt
                                         └── Điều khiển các cửa sổ

Capture renderer → OCR worker → IPC → Main → Overlay renderer
```

### Main

- Là nơi sở hữu trạng thái phiên dịch, cấu hình và dữ liệu bền vững.
- Liệt kê nguồn capture, cấp đúng nguồn được chọn cho capture renderer và quản lý vòng đời cửa sổ.
- Điều phối OCR text, cache, ngữ cảnh, request dịch và kết quả hiển thị.
- Quản lý timeout, hủy request, phím tắt và cleanup khi dừng/thoát.
- Gửi trạng thái đã lọc đến renderer; không gửi API key xuống giao diện.

### Renderer và preload

- Renderer giao diện: chọn nguồn, xem preview, khoanh vùng, quản lý hồ sơ, lịch sử và cấu hình.
- Capture renderer: một cửa sổ nội bộ phục vụ capture, có thể ẩn; giữ video stream và điều phối OCR worker. Phải kiểm tra việc throttling khi chạy nền để không làm đứng pipeline.
- Overlay renderer: cửa sổ phụ đề riêng, có chế độ click-through và chế độ chỉnh vị trí. Khi dịch không giành focus của cửa sổ nguồn.
- Preload: cung cấp các hàm nghiệp vụ cụ thể bằng contextBridge. Không expose toàn bộ ipcRenderer hoặc hàm gửi channel tùy ý.
- OCR worker: nhận ảnh vùng chữ, trả text và metadata mà engine thực sự hỗ trợ. Không bịa confidence khi engine không cung cấp.

Main không nhận mọi khung hình video qua IPC. Chỉ truyền điều khiển, SDP signaling đã kiểm tra schema/role/generation và kết quả OCR. Preview video đi trực tiếp giữa capture renderer và UI bằng WebRTC nội bộ, không cấu hình STUN/TURN. Capture sở hữu một stream; preview mượn track đó, không mở nguồn thứ hai. Unmount/đổi generation đóng peer, listener và gỡ srcObject; dừng pipeline đóng cả sender lẫn track nguồn. Lỗi preview không dừng OCR và có thông báo để dừng/bắt đầu kết nối lại.

## 4. Cấu trúc thư mục

Đây là sơ đồ đích; chỉ tạo file khi triển khai phần tương ứng. Feature nhỏ bắt đầu bằng một file, khi lớn mới tách thành thư mục.

```text
src/
├── main/
│   ├── index.ts
│   ├── windows.ts
│   ├── ipc.ts
│   ├── database.ts
│   └── features/
│       ├── session.ts          # Vòng đời phiên và điều phối
│       ├── translation.ts      # Ổn định chữ và hàng đợi
│       ├── openRouter.ts       # HTTP, timeout, schema
│       └── context.ts          # Prompt, ngân sách và cache key
├── preload/
│   └── index.ts
├── renderer/
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx
│   ├── features/
│   │   ├── capture/
│   │   │   ├── Capture.tsx
│   │   │   ├── captureRuntime.ts # Stream, crop và vòng đời OCR
│   │   │   ├── ocr.ts            # Hợp đồng, worker client và kết quả chữ
│   │   │   ├── paddle.worker.ts  # PaddleOCR/ONNX chạy ngoài UI thread
│   │   │   └── region.ts         # Tọa độ vùng chọn
│   │   ├── translation/
│   │   │   ├── Translation.tsx
│   │   │   └── Overlay.tsx
│   │   ├── context/
│   │   │   └── Context.tsx
│   │   └── settings/
│   │       └── Settings.tsx
│   ├── components/             # UI thực sự dùng chung
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── vi.json
│   │   └── en.json
│   └── styles/
│       ├── app.css
│       └── themes.css
└── shared/
    ├── types.ts                # Hợp đồng IPC và dữ liệu liên tiến trình
    ├── channels.ts             # Tên channel IPC dùng chung
    └── defaults.ts             # Mặc định dùng chung
docs/
├── ARCHITECTURE.md
└── CODE_RULES.md
```

Test unit/component đặt cạnh file được kiểm tra: `translation.test.ts`, `Capture.test.tsx`. Chỉ tạo `tests/e2e/` khi có luồng tích hợp cần kiểm tra. Không thêm tầng controller/service/repository/use-case chỉ để chuyển tiếp lời gọi. Không tạo barrel export cho mọi thư mục.

## 5. Pipeline dịch

1. Chọn hồ sơ, cửa sổ và vùng chữ trên preview video trực tiếp. Danh sách nguồn chỉ lấy mã/tên cửa sổ, không chụp thumbnail. Khi chọn nguồn, main xác nhận cửa sổ và cấp lệnh `preview` cho capture renderer; chưa tạo phiên dịch, worker OCR hoặc gọi model. Preview giữ tỷ lệ nguồn, giới hạn 1920×1080; không đặt giới hạn FPS cho nguồn hoặc sender, không đổi nhịp OCR. Bật theo dõi cùng nguồn giữ nguyên stream, video và peer preview đã sẵn sàng; generation preview độc lập với generation OCR để không kết nối lại khi bắt đầu phiên; nếu nguồn còn đang mở thì hủy lượt cũ và khởi tạo lại có kiểm soát. Đổi nguồn, bỏ chọn hoặc rời màn hình giải phóng stream preview; mã chủ sở hữu và generation ngăn cleanup/kết quả cũ đóng hoặc ghi đè nguồn mới. Khi đang OCR, rời màn hình chỉ đóng peer xem trước, không dừng phiên. Pause hủy worker OCR và tác vụ dịch, vô hiệu kết quả cũ nhưng giữ stream, video, peer và generation preview; resume tái sử dụng nguồn đó và chỉ tạo worker OCR mới. UI nhận lại quyền sở hữu preview cùng nguồn khi pause mà không mở lại capture. Lưu vùng chữ theo tọa độ chuẩn hóa trong nội dung video, không theo tọa độ desktop. Mỗi hồ sơ giữ vùng chọn riêng, được lưu khi chỉnh hợp lệ và khôi phục khi chọn lại hồ sơ hoặc mở lại ứng dụng.
2. Capture không yêu cầu FPS cố định; preview tối đa 1920×1080. Encoder chỉ thu nhỏ nguồn vượt giới hạn Full HD, co đều hai chiều và không phóng lớn nguồn nhỏ. Không nén xuống theo chiều rộng khung UI hoặc DPI: video giữ tối đa chi tiết nguồn, CSS thực hiện bước thu nhỏ để hiển thị. Khi nguồn đổi kích thước, capture cập nhật tỷ lệ encoder theo videoWidth/videoHeight; resize bố cục UI không đổi độ phân giải truyền. Signaling có validation và generation. Track dùng contentHint = detail để ưu tiên chi tiết chữ, phục hồi hint khi đóng peer. Theo dõi vùng OCR vẫn khoảng mỗi 33 ms và phát hiện thay đổi trước khi gọi OCR. FPS thực tế phụ thuộc nguồn, encoder/decoder và máy; không đồng nghĩa OCR chạy theo FPS video. CSS dùng height: auto/object-fit: contain, không ép cửa sổ thành 16:9. Crop OCR đọc stream gốc, không dùng video preview đã nén.
3. OCR trả text; chuẩn hóa khoảng trắng, bỏ câu dưới bốn code point hoặc không có chữ cái Unicode, rồi lọc trùng và chờ câu ổn định. Bộ lọc áp dụng cả dịch ngay và thử lại: câu bị bỏ chỉ hiện trong vùng OCR, không tạo Dialogue, sequence, cache, ngữ cảnh hoặc bản ghi DB. Caption hợp lệ trước đó tiếp tục theo thời hạn cũ; câu bị bỏ không đổi mốc lọc trùng. Tiếng Nhật/Trung vẫn được chấp nhận. Có phím tắt dịch ngay cho trường hợp cần chủ động.
4. Main tạo một đoạn hội thoại với `sessionId`, `segmentId`, `sequence` và phiên bản ngữ cảnh.
5. Kiểm tra cache, tạo prompt rồi gọi OpenRouter với timeout và AbortController.
6. Nhận SSE và hiển thị dần riêng chuỗi `translation` như bản nháp. Khi response hoàn tất, kiểm tra toàn bộ schema rồi mới lưu kết quả, cache và cập nhật ngữ cảnh theo thứ tự hội thoại.

Các trạng thái cấp phiên: `idle`, `starting`, `running`, `paused`, `error`. Trạng thái đang OCR/dịch thuộc đoạn xử lý; không làm mất trạng thái phiên.

### Hàng đợi và thứ tự

- OCR xử lý một ảnh tại một thời điểm và giữ tối đa một ảnh mới nhất đang chờ. Bỏ frame cũ trước OCR không đồng nghĩa bỏ một câu đã nhận diện.
- Frame đang OCR được chụp riêng; frame mới không ghi đè ảnh đang đọc. Worker rảnh thì xử lý ngay frame mới nhất, không đợi tick tiếp theo. Nhịp capture không phát IPC text cho từng frame; câu tĩnh được xác nhận theo ngưỡng ổn định 150 ms.
- PaddleOCR phát hiện từng dòng, nhận dạng tiếng Anh và giữ mọi dòng đạt điểm tối thiểu 0,6 theo thứ tự trên xuống dưới. Không còn hai lượt Tesseract, mặt nạ chữ trắng hoặc ghép từ theo confidence. Không sửa câu theo từ điển hay dùng AI đoán nội dung.
- Model chỉ tải lúc chuẩn bị dependency, kiểm tra SHA-256 rồi lưu cùng tài nguyên ứng dụng. Worker tái sử dụng model; ONNX WASM chạy CPU một thread, không cần Python/GPU/server. Dừng phiên terminate worker ngay và reject lời gọi đang chờ; timeout OCR/khởi tạo 60 giây là cơ chế phục hồi, không phải SLA.
- Stream không đặt width/height cố định; ưu tiên `resizeMode: none`. Đo kích thước bằng `videoWidth/videoHeight` thực. Truyền pixel crop gốc sang worker; bước detection chỉ thu nhỏ cạnh dài nếu vượt 1600 px, làm tròn kích thước theo yêu cầu model. Bước recognition chuẩn hóa từng dòng theo kích thước tensor của model. Không phóng lớn cả cửa sổ hoặc dùng preview JPEG làm ảnh OCR.
- Request dịch được xử lý tuần tự trong bản đầu để giữ thứ tự ngữ cảnh. Hàng đợi đoạn có giới hạn cấu hình.
- Không enqueue lại cùng câu cuối khi nó còn `pending`; câu A xuất hiện lại sau B vẫn được dịch. Dịch thủ công bỏ chờ ổn định và đánh dấu câu đã gửi để chế độ tự động không gửi trùng.
- Dịch tự động so câu mới với mốc gần nhất đã chấp nhận bằng Levenshtein trên bản chuẩn hóa khoảng trắng/chữ thường, tính theo code point. Độ giống = 1 − số phép sửa/độ dài câu dài hơn; đạt ngưỡng thì không enqueue. Ngưỡng lưu ở settings, mặc định 80%, 0 tắt, 100 chỉ bỏ câu giống sau chuẩn hóa. Không sửa hoa thường/dấu câu của text gửi AI. Không đổi mốc theo câu bị bỏ; text rỗng, đổi nguồn hoặc dừng/đổi phiên xóa mốc. Mốc lỗi/skipped/cancelled không chặn câu mới. Dịch ngay/thử lại bỏ lọc gần giống, vẫn chặn trùng nguyên văn đang pending.
- OpenRouter nhận `stream: true` cho bản dịch, ưu tiên provider theo `latency`, giữ model do người dùng chọn. Mọi request dịch gửi reasoning.enabled = false; tóm tắt gửi enabled = true. Cả hai gửi exclude = true để chỉ nhận nội dung cuối; exclude không phải công tắc tắt suy luận. Tóm tắt có ngân sách output 2048 token, dịch 1024. Không âm thầm bật lại suy luận hoặc đổi model khi provider không hỗ trợ cấu hình. Prompt yêu cầu câu dịch ngắn gọn và trường translation trước thông tin nhân vật; parser vẫn hỗ trợ thứ tự trường khác.
- Bản nháp chỉ ở snapshot, cập nhật tối đa mỗi 100 ms sau lần đầu; không ghi database/cache/ngữ cảnh. Lỗi hoặc dừng xóa bản nháp. Timeout và AbortController bao phủ cả thời gian đọc stream; không tự gửi lại request sau lỗi giữa stream.
- Metadata `queueMs`, `firstTextMs`, `apiMs` phân biệt thời gian chờ hàng đợi, thời điểm hiện chữ đầu và thời gian toàn request. Không log nội dung riêng tư để đo; hai trường mới là tùy chọn để tương thích lịch sử cũ.
- `usage` của dialogue chứa inputTokens/outputTokens do envelope API trả (JSON hoặc event SSE cuối), không từ JSON model sinh. Không ước lượng khi thiếu. Chỉ lưu cùng kết quả hợp lệ; lịch sử cũ không cần migration vì trường tùy chọn. Cache chỉ chứa bản dịch/nhân vật; lần hit cache ghi fromCache và usage 0/0, không lặp lại token đã dùng trước. UI hiển thị token cả prompt/ngữ cảnh và completion, không coi đây là tổng hóa đơn hoặc tổng token của request lỗi/hủy/tóm tắt.
- Khi đầy, bỏ đoạn chưa xử lý cũ nhất, ghi trạng thái `skipped` và giữ đoạn mới nhất. UI cho biết có thể đã bỏ lỡ hội thoại; đoạn bị bỏ không được coi là đã dịch.
- Kết quả về muộn có thể lưu vào lịch sử đúng thứ tự nhưng không đè overlay của đoạn mới hơn. Chỉ đưa vào ngữ cảnh khi còn thuộc phiên và nhánh ngữ cảnh hợp lệ.
- Dừng, đổi nguồn, đổi hồ sơ hoặc reset ngữ cảnh: hủy việc đang chạy, tăng phiên bản để vô hiệu hóa kết quả cũ. Pause giải phóng OCR, giữ nguồn và kết nối preview; resume tạo lại OCR với phiên bản xử lý mới.
- Retry có giới hạn cho lỗi tạm thời; tôn trọng Retry-After khi có. Không retry tự động vô hạn hoặc retry lỗi API key/model không hợp lệ.
- Khi cửa sổ nguồn đóng, stream kết thúc, worker lỗi hoặc mất khung hình mới: dừng phần liên quan, báo trạng thái và cho chọn lại nguồn/thử lại.
- Khi đổi kích thước: ánh xạ vùng chuẩn hóa theo kích thước frame mới; nếu hình bị letterbox hoặc thay bố cục, yêu cầu kiểm tra lại vùng chọn.

Các chu kỳ, ngưỡng ổn định, giới hạn hàng đợi và timeout được define tập trung tại feature sở hữu. Giá trị người dùng cần chỉnh đi qua settings; không đưa mọi tham số kỹ thuật lên UI.

## 6. Ngữ cảnh và xưng hô

Hồ sơ game độc lập với tên cửa sổ. Một hồ sơ có nhiều phiên; đổi nguồn thử sang PS Remote Play vẫn dùng lại được thuật ngữ và quan hệ nhân vật.

Prompt gồm: quy tắc dịch, quy tắc người dùng, nhân vật/quan hệ liên quan, thuật ngữ, tóm tắt phiên, hội thoại gần nhất và câu mới. Có ngân sách token; ưu tiên giữ câu mới và quy tắc đã chốt, cắt lịch sử cũ trước. Tóm tắt tăng dần sau mỗi 20 câu thành công, chạy song song với dịch, không bị hủy chỉ vì có câu mới. Mỗi loại tác vụ nền chạy tối đa một request, đọc đủ lô từ DB theo mốc thay vì chỉ lấy lịch sử giới hạn trên UI; hoàn tất thì kiểm tra lô tiếp theo. Dừng/đổi phiên hoặc sửa ngữ cảnh liên quan vô hiệu kết quả đang chạy.

Settings có model dịch, `summaryModel` và `profileModel`; hai model nền trống nghĩa là dùng model dịch. Ngân sách đầu vào theo giới hạn từng model, chừa output và overhead riêng. Đổi model nền chỉ hủy tác vụ tương ứng, không dừng capture/dịch. Request hồ sơ dùng JSON schema khi model hỗ trợ structured outputs, nếu không thì yêu cầu JSON qua prompt; reasoning bật và exclude bật, không streaming; mục đích request được khai báo tường minh, không suy ra từ việc có JSON schema.

Trần 6.000 chỉ áp dụng đầu vào dịch hội thoại. Tóm tắt, khởi tạo và bổ sung hồ sơ dùng `profileInputTokenLimit`, mặc định 15.000, chỉnh được từ 1.000–1.000.000 trong Cài đặt. Ngân sách này bao gồm system prompt và JSON schema, ước lượng bảo thủ bằng byte UTF-8; giới hạn ngữ cảnh thực tế của model sau khi chừa output/overhead vẫn được ưu tiên. Đổi ngân sách chỉ hủy tác vụ nền dùng mức cũ và thử lại hồ sơ đang lỗi `CONTEXT_LIMIT`, không dừng capture/dịch. Cấu hình cũ tự ghép mặc định, không cần migration DB mới.

Hồ sơ ngoài Chung mặc định bật AI, kể cả hồ sơ cũ khi migration v1 → v2. Sau lần lưu tên game đầu tiên hoặc nâng cấp, AI khởi tạo phần thiếu từ kiến thức chắc chắn, hạn chế spoiler; không tìm web hoặc gửi ảnh. Nếu AI trả danh sách dữ kiện rỗng khi khởi tạo, lưu và báo không có dữ liệu, vẫn tiếp tục học từ hội thoại; kết quả rỗng không khẳng định game không tồn tại. Khi AI biết quan hệ công khai, prompt yêu cầu điền cách xưng hô theo từng chiều, không suy đoán bí mật. Tiếp tục học từ lô hội thoại dịch thành công; nhịp học chỉnh 1–200 câu, mặc định 20. Công tắc theo hồ sơ, trạng thái, lỗi và nút thử lại nằm ở màn hình Hồ sơ. Lỗi không chặn dịch hoặc lưu hồ sơ và không tự retry vô hạn.

Dữ kiện AI mới được lọc trước khi ghép trong transaction: nhân vật cần tên hoặc biệt danh xuất hiện trong ít nhất bốn câu gốc khác nhau đã dịch thành công; thuật ngữ cần từ gốc xuất hiện trong ít nhất bốn câu và cả hai phía không trùng tên hoặc biệt danh nhân vật đã biết hay AI đề xuất. Đếm trên mọi phiên của hồ sơ, kể cả trước khi xóa dữ liệu hồ sơ, không phụ thuộc số dòng hiển thị. So khớp không phân biệt hoa thường, chuẩn hóa khoảng trắng và ranh giới từ Unicode; câu gốc trùng chỉ tính một lần. Dữ kiện thiếu bằng chứng bị bỏ, không lưu chờ; người dùng tự nhập và dữ kiện cũ giữ nguyên. Xưng hô AI chỉ giữ phương án đầu tiên, bỏ biệt danh trùng tên. Quy tắc dịch I/you dựa trên người nói, người nghe và ngữ cảnh, vẫn ưu tiên quy tắc người dùng; phiên bản prompt dịch tăng để tránh dùng cache cũ.

AI chỉ điền phần trống/thêm mục mới trong nhân vật, quan hệ có hướng và thuật ngữ. Trường Quy tắc dịch ưu tiên (`instructions`) chỉ do người dùng nhập: không thuộc schema đầu ra AI và không được tạo thành đề xuất, kể cả khi đang trống. Có thể gửi quy tắc đã nhập làm ngữ cảnh chỉ đọc. Đề xuất quy tắc từ phiên bản cũ được ẩn và không thể chấp nhận; nội dung quy tắc đã lưu được giữ nguyên để người dùng tự chỉnh. Ghép nhân vật theo tên/biệt danh, quan hệ theo cặp người nói–người nghe, thuật ngữ theo nguồn. Mâu thuẫn hoặc ghép không chắc chắn được lưu thành đề xuất có giá trị gốc, giá trị mới và căn cứ; chấp nhận phải kiểm tra giá trị gốc còn đúng. Đề xuất đã bỏ được lưu để không tạo lại cùng nội dung. Ghi hồ sơ, đề xuất và mốc học trong transaction, kiểm tra revision và toàn bộ schema, không cắt bớt dữ liệu khi vượt giới hạn. SQLite v2 bổ sung `profile_ai`, `profile_learning`, `profile_proposals`, không thay lịch sử hoặc cache cũ.

Xóa dữ liệu hồ sơ cần người dùng xác nhận; main kiểm tra revision rồi xóa nhân vật, cách xưng hô, thuật ngữ và đề xuất AI trong transaction, giữ tên, quy tắc, phiên và lịch sử. Các mốc học được đưa đến cuối hội thoại hiện có để không tự khôi phục dữ kiện cũ; AI chỉ học từ hội thoại mới và có thể được khởi tạo lại bằng nút Thử lại. Hủy tác vụ hồ sơ liên quan; nếu hồ sơ thuộc phiên đang dùng thì tạm dừng capture/dịch.

Cập nhật AI không tạm dừng pipeline: request dịch giữ hồ sơ đã chụp, câu sau dùng revision mới. Giao diện giữ bản nháp đang nhập, báo khi revision thay đổi và yêu cầu tải lại trước khi lưu; main từ chối revision cũ bằng `PROFILE_CHANGED`. Chọn hồ sơ, phiên và cửa sổ vẫn thủ công; chưa tự nhận diện game. Tab Hồ sơ ghi nhớ ID hồ sơ chọn cuối trong localStorage, độc lập phiên dịch; nếu hồ sơ không còn tồn tại thì dùng hồ sơ của phiên hoặc Chung. Nút thử lại bị khóa khi request đang gửi, chờ lượt hoặc xử lý.

Không gửi id/tên quản lý/revision của hồ sơ hoặc danh sách rỗng tới model. Giữ nguyên nội dung chỉ dẫn, nhân vật, quan hệ và thuật ngữ đã xác nhận; cache vẫn bao gồm toàn bộ hồ sơ và phiên bản prompt.

Ưu tiên thông tin: quy tắc người dùng > dữ kiện xác nhận > hội thoại > suy luận model. Quan hệ có hướng: A nói với B và B nói với A là hai quy tắc riêng. Cho sửa người nói, người nghe và cách xưng hô. Model không tự ghi đè quy tắc đã chốt; chưa rõ nhân vật thì lưu `unknown`.

Response có cấu trúc nếu model hỗ trợ; luôn kiểm tra runtime. Không nhận dạng được cấu trúc thì trả lỗi có thể xử lý, không đưa JSON thô lên overlay. Không âm thầm đổi model; thay đổi model phải hiển thị và ảnh hưởng khóa cache.

Danh sách model mang cờ `isFree` từ main: chỉ đúng khi giá prompt/completion và request bằng 0 trong dữ liệu API; không suy ra từ hậu tố ID. Giá thiếu/không hợp lệ không được gắn nhãn miễn phí. Ứng dụng tự tải danh sách khi khởi động, giữ cache nếu lỗi và cho tải lại ở Cài đặt. Dropdown tìm theo tên/ID, hiển thị giá USD cho một triệu token input/output, đưa nhóm miễn phí lên đầu rồi xếp theo tổng hai giá; giá thiếu được xếp sau giá đã biết. Chỉ xác nhận option mới thay giá trị form. Dữ liệu model cũ trong SQLite thiếu cờ này vẫn đọc được với mặc định false.

## 7. Dữ liệu và bảo mật

`modelId` của dialogue/cache là ID model lấy từ trường model ở envelope JSON/SSE, không từ JSON model tự sinh và không suy ra từ model cấu hình/router. Trường tùy chọn, kiểm tra chuỗi không rỗng tối đa 200 ký tự, lưu qua restart và cache; không có metadata thì UI ghi chưa có dữ liệu. Cache chỉ giữ bản dịch/nhân vật/model gốc, không giữ usage/cost của request cũ. Cấu hình provider.sort = latency đã có ở completion chung nên áp dụng cho cả dịch và tóm tắt; giữ require_parameters để không bỏ qua các tham số đã gửi. Danh sách model lưu khả năng structured outputs; model không hỗ trợ nhận schema qua prompt và kết quả vẫn phải qua validation. Metadata cũ mặc định hỗ trợ vì danh sách cũ đã được lọc.

Dialogue có `costUsd` tùy chọn lấy độc lập từ `usage.cost` của API (JSON hoặc SSE), chỉ chấp nhận số hữu hạn không âm. Không lấy từ nội dung model hoặc `upstream_inference_cost`, không suy ra từ token. Cache chỉ giữ nội dung; lần dùng cache ghi costUsd = 0. Thiếu chi phí/lịch sử cũ hiển thị -; USD dùng Intl theo locale, tối đa 8 chữ số thập phân và dấu < cho số dương nhỏ hơn mức đó. Lưu cùng dialogue JSON, không cần migration và không gọi endpoint riêng.

SQLite gồm các bảng `settings`, `profiles`, `sessions`, `dialogues`, `translation_cache`. Characters, relationships và glossary nằm trong document hồ sơ có revision, cập nhật nguyên tử trong profiles; chưa tách bảng khi chưa cần truy vấn độc lập. Mỗi dialogue giữ text OCR, bản dịch nếu có, thứ tự, trạng thái và nhân vật nếu biết. Migration có phiên bản và transaction; không xóa database để nâng schema.

Cache tính theo text chuẩn hóa, ngôn ngữ nguồn/đích, model, phiên bản prompt, phiên bản quy tắc và dấu vết ngữ cảnh liên quan. Có giới hạn dung lượng/thời gian lưu; reset hoặc sửa quy tắc không tái dùng cache cũ không phù hợp.

Ngoài cache SQLite, HTTP completion bật response cache OpenRouter bằng X-OpenRouter-Cache: true, TTL 300 giây. Không bật header này trên GET models. Cache phía OpenRouter chỉ hit khi toàn bộ request phù hợp; reasoning/model/ngữ cảnh khác tạo cache khác. SessionController truyền UUID phiên; HTTP tạo session_id ổn định với hậu tố translation/summary để hỗ trợ provider affinity riêng từng luồng và cache prompt tự động nếu provider hỗ trợ. Không thêm cache_control cho provider chưa xác định, không cố định provider hoặc cắt quy tắc để ép cache hit. Phiên bản cache cục bộ tăng khi thay chính sách suy luận. Cache cloud không dùng nhãn fromCache của SQLite vì vẫn có HTTP request; token/chi phí tiếp tục lấy từ metadata API.

- Dữ liệu lưu dưới `app.getPath('userData')`, không trong thư mục source/cài đặt. Database chỉ mở ở main.
- API key lưu riêng dưới dạng mã hóa. Nếu safeStorage không khả dụng, báo lỗi hoặc chỉ giữ key trong bộ nhớ phiên; không tự lưu plaintext.
- Bật contextIsolation và sandbox, tắt nodeIntegration ở renderer; CSP chặt, chỉ tải nội dung ứng dụng tin cậy.
- Kiểm tra schema, kích thước payload và nguồn gửi IPC; giới hạn thao tác theo vai trò cửa sổ. Không để capture/overlay có API sửa key hoặc database tùy ý.
- OCR và response AI là dữ liệu không tin cậy: render dạng text, không dùng innerHTML; phân tách nội dung OCR khỏi chỉ dẫn hệ thống trong prompt.
- Không lưu ảnh capture mặc định; không log key hoặc header xác thực. Khi chạy debug từ source, tab nhật ký hiển thị request/response và lỗi OpenRouter trong RAM để chẩn đoán; xóa khi đóng ứng dụng, giới hạn số dòng và kích thước, không bật trong bản đóng gói. Prompt/hội thoại chỉ xuất hiện trong tab debug theo yêu cầu người dùng.
- UI nêu rõ nội dung text và ngữ cảnh được gửi để dịch. Luồng gửi ảnh lên model chưa thuộc bản đầu.

## 8. Theme sáng/tối

- Hỗ trợ `light`, `dark`, `system`; mặc định `dark` theo brief desktop ngày 29/10/2026. Theme áp dụng thống nhất cho toàn ứng dụng; cấu hình đã lưu được giữ nguyên. Lựa chọn `system` ánh xạ theo Windows.
- Main lưu cấu hình và phát thay đổi cho tất cả cửa sổ. Áp dụng theme trước lần render đầu để hạn chế nháy sai màu.
- Màu được định nghĩa bằng CSS custom properties ngữ nghĩa trong `themes.css`: nền, bề mặt, chữ chính/phụ, border, accent, focus và trạng thái. Component không hardcode màu.
- Hai theme giữ cùng bố cục và phân cấp thông tin; dark dùng sắc trung tính, không chỉ đảo màu hoặc phủ xanh navy.
- Overlay dùng token riêng cho nền phụ đề/chữ; độ tương phản không phụ thuộc hình game phía dưới. Cỡ chữ, vị trí và độ đậm nền chỉnh được, có preview.
- Khi thiếu API key hoặc model, overlay chọn `ocrText` hiện tại; khi đủ cấu hình thì chọn bản dịch mới nhất có nội dung, gồm bản nháp `pending` hoặc bản hoàn tất. Main quản lý caption trong snapshot.overlayText và timer: mặc định 5 giây, chỉnh 1-60 giây trong Cài đặt, tính từ lần nội dung thay đổi cuối. OCR lặp nguyên câu/theme/locale không gia hạn; caption mới hiện lại. Hết hạn chỉ xóa caption và ẩn cửa sổ khi đã khóa, không xóa lịch sử/OCR. Chế độ chỉnh vị trí giữ điều khiển dù caption rỗng; dừng pipeline hủy timer và xóa caption. Timer không lưu database hoặc tiếp tục caption cũ sau khởi động lại.
- Kiểm tra focus, disabled, loading, empty, error và nội dung dài trong cả hai theme. Theme thay đổi không khởi động lại phiên dịch.

## 9. Đa ngôn ngữ

- Locale hỗ trợ: `vi`, `en`; mặc định và fallback là `vi`, không tự đổi mặc định theo Windows.
- Locale giao diện độc lập với ngôn ngữ nguồn/đích bản dịch. Đổi UI sang English không đổi bản dịch tiếng Việt hoặc ngôn ngữ docstring.
- Main lưu locale; gửi sang mọi renderer. Renderer dùng i18next/react-i18next; menu và dialog native dùng cùng bộ tài nguyên qua helper ở main.
- Dùng key theo feature, ví dụ `capture.selectWindow`, `translation.start`, `settings.theme`. Cả hai locale có cùng tập key.
- Dịch nhãn, placeholder, tooltip, aria-label, thông báo trạng thái/lỗi, menu và dialog. Main/worker trả mã lỗi và tham số; UI chọn thông báo theo locale.
- Nội suy bằng tham số, không nối các mảnh câu; số/ngày/thời lượng dùng Intl theo locale. Tài nguyên đi cùng bộ cài, không cần mạng.
- Không dịch tên nhân vật, thuật ngữ hay nội dung người dùng khi chỉ đổi locale giao diện. Không làm mất vùng chọn hoặc khởi động lại phiên.

## 10. Giao diện theo Taste Skill

Bắt buộc sử dụng **Taste Skill: Design Taste Frontend** (`taste-skill:design-taste-frontend`) khi thực hiện công việc giao diện. Đọc bản skill đang cài và `references/app-screens.md`; đây là app screen, không dùng quy trình landing page.

Chưa chốt palette, font hoặc style trước khi chạy quy trình chọn hướng của skill. Khi bắt đầu UI:

1. Xác định dữ liệu, công việc và câu hỏi chính của từng màn hình.
2. Chạy `draw.mjs --app`, chọn hướng phù hợp phiên dịch dài; lưu quyết định và seed. Thiết kế hai theme bằng cùng hệ token và hình học.
3. Xây màn hình từ nội dung thật của sản phẩm: nguồn capture, vùng chọn, text gốc/bản dịch và người nói. Không tạo KPI/chart hoặc số liệu trang trí.
4. Dùng typography hỗ trợ đầy đủ dấu tiếng Việt, một bộ icon thống nhất, bề mặt phẳng, màu nhấn tiết chế. Preview vùng chữ và cặp câu gốc/bản dịch là trọng tâm.
5. Có empty/loading/error/disabled, keyboard focus, tên truy cập cho control và reduced-motion. Nút bắt đầu/dừng và trạng thái phiên dễ thấy.
6. Chạy lint/inspect ở chế độ `--app` theo skill trên bản build, xem toàn bộ screenshot, sửa lỗi và kiểm tra lại. Nếu dùng preview browser có bridge giả lập thì phải ghi rõ và kiểm tra thêm Electron thật.

Kiểm tra cả `vi`/`en` × `light`/`dark`, thao tác bàn phím, Windows scaling và nhiều màn hình. Các viewport kiểm tra của skill là kiểm tra renderer; không mở rộng phạm vi sang ứng dụng mobile. Kích thước cửa sổ tối thiểu sẽ được quyết định trong vòng UI đầu tiên dựa trên bố cục thực tế.

## 11. Trình tự triển khai và kiểm chứng

1. Dựng Electron, bridge an toàn, theme và i18n.
2. Capture một cửa sổ bất kỳ, vùng chữ, preview và OCR cục bộ.
3. Dịch thủ công, timeout/hủy, overlay, lọc trùng và hàng đợi tự động.
4. Hồ sơ, SQLite, thuật ngữ, xưng hô, cache và tóm tắt.
5. Kiểm tra bản đóng gói trên Windows, nguồn video gameplay và sau này PS Remote Play.

Mỗi bước theo Red → Green → Refactor trong CODE_RULES.md. Unit test dùng clock, OCR và HTTP giả lập có kiểm soát; không gọi API trả phí. Integration test dùng database tạm. E2E kiểm tra renderer/main/preload thật với nguồn thử; capture hệ điều hành, focus, DPI, đa màn hình và độ trễ cần kiểm chứng trên Windows thật. Không đặt con số độ trễ cam kết trước khi đo.

`node scripts/check-preview-quality.mjs` chạy chính module preview trên Edge với canvas có chữ nhỏ và chuyển động, truyền qua encoder/decoder WebRTC thật. Kiểm tra kích thước nhận không vượt Full HD, giữ tỷ lệ và không phóng lớn nguồn nhỏ; so pixel vùng chữ Full HD với ảnh gốc, lưu số đo/ảnh đối chiếu trong `.taste-skill/after/preview-quality/`. Đây là kiểm tra pipeline video trên browser, không thay thế capture cửa sổ Windows qua Electron.

Khi chạy source, Vite phải pre-bundle PaddleOCR, OpenCV và ONNX WASM ngay từ lúc khởi động. Worker được gọi muộn khi người dùng bật capture; nếu để Vite tự phát hiện các dependency này lúc đó, full reload có thể ngắt pipeline. E2E source dùng cấu hình renderer thật và ép cache dependency lạnh để kiểm tra trường hợp này.

## Kết nối model local qua LM Studio và Ollama

- Settings chọn OpenRouter, LM Studio hoặc Ollama (`openRouter` mặc định) cho dịch, tóm tắt và hồ sơ. Mỗi provider local có địa chỉ, token và ba model riêng; model nền để trống kế thừa model dịch của provider đó. Cấu hình cũ được ghép mặc định, không cần migration SQLite.
- LM Studio/Ollama giữ đầu lịch sử theo lô 12 câu để tái sử dụng prompt đã xử lý: khi đã đủ lịch sử, thường gửi 12–23 câu gần nhất trước câu mới, vẫn cắt theo ngân sách đầu vào. Ví dụ câu 50 dùng lịch sử 37–49 khi đủ ngân sách. Khi thiếu ngân sách, local bỏ từng nhóm 6 câu cũ thay vì trượt từng câu; giữ câu gần nhất nếu còn chỗ, không cắt quy tắc hay câu OCR mới. Lịch sử bỏ trường speaker/listener trống hoặc unknown, giữ đủ nhân vật đã xác định. OpenRouter tiếp tục dùng cửa sổ 12 câu cuối và cắt từng câu theo ngân sách. Phiên bản prompt/cache là 9.
- Với provider local, tóm tắt và tạo/học hồ sơ chỉ chạy khi không ở trạng thái `starting`/`running` và không có câu dịch `pending`. Bắt đầu/tiếp tục phiên hoặc gửi câu dịch hủy tác vụ nền; kết quả trả muộn không được ghi. Thao tác dừng/tạm dừng chủ động khởi chạy lại phần nền còn thiếu từ mốc đã lưu. Hồ sơ/ngữ cảnh vẫn bật thinking; khi dịch liên tục, bản tóm tắt chưa cập nhật cho đến lúc tạm dừng. OpenRouter giữ xử lý nền song song.
- Server local dùng API tương thích OpenAI: `GET /models`, `POST /chat/completions` dưới base URL mặc định `http://localhost:1234/v1`. Cho chỉnh địa chỉ HTTP/HTTPS cùng máy hoặc LAN; không nhận URL chứa credentials, query hoặc fragment, không theo redirect.
- Main sở hữu toàn bộ HTTP và secret. Token local tùy chọn, mã hóa riêng bằng safeStorage, không dùng key OpenRouter; snapshot chỉ chứa cờ đã lưu token. Hai pool dịch/nền hiện có được tái sử dụng và hủy khi thoát.
- Chỉ model LM Studio có metadata `arch: gemma2` mới chuyển system vào user và ghép các lượt liên tiếp cùng role. Các kiến trúc khác, model thiếu metadata và OpenRouter giữ nguyên prompt. Tải danh sách từ `/v1/models` trước, khi chọn LM Studio, thử ghép kiến trúc từ `/api/v0/models`; nếu metadata không khả dụng thì giữ danh sách chuẩn và không đoán kiến trúc theo tên.
- Ollama có thể dùng địa chỉ `http://localhost:11434/v1`; server phải hỗ trợ API và JSON schema mà ứng dụng yêu cầu. Mã settings và token `lmStudio` được giữ để đọc dữ liệu cũ mà không di chuyển secret.
- Request local giữ streaming/JSON schema và validation kết quả; bỏ reasoning, provider routing, session affinity và header cache riêng của OpenRouter. LM Studio và Ollama gửi `reasoning_effort: none` khi dịch, `medium` khi tóm tắt ngữ cảnh hoặc tạo/học hồ sơ để yêu cầu bật suy luận; hiệu lực phụ thuộc khả năng model và phiên bản server. Dùng tham số tương thích OpenAI trên `/v1/chat/completions`, không dùng `think` của API Ollama native. Không tự chuyển provider hoặc đổi model khi server/model không hỗ trợ JSON schema.
- Bản dịch local gửi temperature 0, bật stream_options.include_usage để nhận token thực từ server. Prompt yêu cầu JSON một dòng gọn và trả ngay kết quả. Không hạ max_tokens để ép tốc độ vì đây chỉ là trần đầu ra; giảm trần có thể làm JSON bị cắt. Tốc độ còn phụ thuộc cache prompt, độ dài câu, model và phần cứng; không cam kết mọi lượt hoàn tất trong một giây.
- Timeout giữ nguyên: dịch/danh sách model 20 giây, tóm tắt/hồ sơ 240 giây. Metadata context local có thể thiếu; khi đó dùng ngân sách hiện có, không coi là 0. Giá/chi phí không được tự suy ra.
- Đổi provider/server/model dịch tạm dừng phiên, hủy request và vô hiệu kết quả cũ. Danh sách model cùng cache bản dịch phân biệt provider/base URL; đổi server hủy cả yêu cầu tải model đang chạy.
