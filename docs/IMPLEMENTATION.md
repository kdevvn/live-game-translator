# Báo cáo triển khai

## Preview khớp khung/DPI và giữ tỷ lệ - 28/10/2026

- Nguyên nhân có thể gây mềm ảnh: pipeline cũ mã hóa tới Full HD rồi CSS thu nhỏ vào khung, đồng thời WebRTC có nén mất dữ liệu. Độ phân giải nguồn lớn hơn khung không tự chứng minh là lỗi tỷ lệ hoặc nguyên nhân duy nhất của ảnh người dùng gửi. Code trước đã giữ tỷ lệ tự nhiên; không ép 16:9. Không tăng độ phân giải hoặc bitrate, không thêm sharpen giả.
- UI gửi chiều rộng pixel vật lý theo CSS × devicePixelRatio lúc kết nối và resize; encoder giảm đều hai chiều, tối đa 1920×1080, không upscale khi mã hóa. Giữ tỷ lệ cửa sổ capture thay vì tỷ lệ video con bên trong. Gộp resize 100 ms, gỡ observer/listener/timer khi dừng. Khi nguồn resize vẫn dùng giới hạn khung gần nhất; preview đổi kích thước không đổi crop OCR gốc.
- Đặt contentHint = detail trước khi tạo offer để gợi ý encoder giữ nét chữ/đường cạnh; phục hồi giá trị cũ khi dispose. Đây là gợi ý cho trình duyệt, không bảo đảm mọi khung hình rõ tuyệt đối hoặc FPS luôn 60. Căn cứ: [W3C MediaStreamTrack Content Hints](https://www.w3.org/TR/mst-content-hint/). CSS ghi rõ height: auto, object-fit: contain.
- Red → Green: hai test thất bại vì chưa có hint và chưa gửi kích thước khung/DPI; sau sửa kiểm tra được scale theo khung, không upscale, giữ tỷ lệ, resize/DPI và cleanup. Thêm kiểm tra schema chặn width ngoài 1-1920, số lẻ/NaN và URL. 118 test ở 18 file đạt; typecheck, lint, format, build source và diff check đạt. Không đóng gói exe.
- Bốn E2E Electron đạt với nguồn thử: capture gốc 1920×1080 vẫn giữ nguyên; preview khớp khung khoảng 588×331, chuyển nguồn thành 960×600 giữ tỷ lệ 16:10, đổi kích thước app và chuyển màn hình kết nối lại đúng. Kiểm tra tỷ lệ video/khung sai lệch dưới 0,01 và kích thước encoder sai lệch tối đa 4 px do làm tròn codec. Chưa đo cải thiện chất lượng bằng video YouTube thực tế; không tuyên bố đã loại hết mờ trong ảnh người dùng.

## Thời gian overlay và preview video Full HD/60 fps - 28/10/2026

- Thêm overlayDurationSeconds, mặc định 5, giới hạn 1-60 giây; cấu hình cũ nhận mặc định và lưu qua SQLite/restart. Form có nhãn/hint vi/en. Main quản lý timer và snapshot.overlayText: hết hạn xóa caption, ẩn cửa sổ đã khóa; OCR lặp nguyên câu hoặc đổi theme không kéo dài thời gian. Câu mới/bản nháp streaming mới hiện lại. Dừng hủy timer; chỉnh vị trí giữ điều khiển dù hết caption.
- Thay preview JPEG 960 px mỗi giây bằng video WebRTC nội bộ từ cùng track capture, không mở stream thứ hai hoặc truyền video qua IPC. IPC chỉ trao đổi SDP đã giới hạn kích thước/role/generation và mã kết nối. Không dùng STUN/TURN. Preview giới hạn Full HD/60 fps, giữ tỷ lệ, không upscale nguồn nhỏ, cập nhật scale khi nguồn resize. Capture yêu cầu 60 fps; nhịp quan sát OCR vẫn 30 lần/giây, một OCR đang chạy/một frame mới nhất chờ, crop gốc không đi qua codec preview.
- Cleanup peer, ICE timer, listener và video.srcObject khi unmount/stop/đổi generation; lỗi preview giải phóng riêng kết nối và báo cách kết nối lại, OCR tiếp tục. Encoder ưu tiên giữ độ phân giải; FPS còn phụ thuộc nguồn và máy.
- Red: 4 test hành vi thất bại vì thiếu thời gian cài đặt/tự ẩn và stream còn yêu cầu 30 fps. Bổ sung Red → Green cho peer dùng track gốc/giới hạn Full HD, cập nhật scale sau resize và cleanup khi preview lỗi. Green: 115 unit/integration/component test ở 18 file đạt. Bốn E2E Electron đạt: lưu/restart thời gian 8 giây, OCR/overlay không key, ẩn cửa sổ overlay thật, video 1920×1080, resize về 960×540, chuyển Cài đặt rồi kết nối lại, dừng giải phóng stream.
- Đo trong E2E nguồn thử: preview 1920×1080, khoảng 43,98 khung giải mã/giây, 4 khung rơi trong cửa sổ đo một giây. Track clone đọc bằng MediaStreamTrackProcessor ghi khoảng 9,43 frame/giây; đây là hai phép đo khác nhau, không khẳng định nguồn cung cấp 60 frame khác nhau hoặc preview giữ ổn định 60 fps. Mức 60 fps là cấu hình yêu cầu/giới hạn, cần đo thêm khi chạy video thật trên máy người dùng. Không gọi API thật hoặc đóng gói exe.
- Visual QA dùng production renderer với bridge thử, không dùng số liệu giả làm bằng chứng hiệu năng. Taste lint đạt 0 FAIL/0 WARN; inspect Cài đặt vẫn báo 1 FAIL contrast do đọc sai nền rgba của preview chữ trắng và 1 WARN tỷ lệ chữ trợ giúp dưới 13 px. Đã xem đủ sáu ảnh inspector và tám ảnh phần overlay ở vi/en × sáng/tối × 1440/390 px: nền phụ đề thực tối, nhãn/ô nhập không cắt hoặc tràn ngang. Chi tiết trong UI_DESIGN.md.

## Tái sử dụng kết nối Keep-Alive - 28/10/2026

- Node fetch vốn đã có pool mặc định; không coi đây là tính năng hoàn toàn thiếu trước sửa. Thêm pool riêng cho OpenRouter bằng Undici 7.30.1 (dependency production có lockfile), tối đa hai socket/pipelining 1, idle tối đa 60 giây và tôn trọng việc server đóng sớm. Models, dịch và tóm tắt dùng cùng transport main; không đổi global dispatcher, header cache, reasoning hoặc API key boundary.
- Tái hiện SSE: event DONE có trước HTTP EOF; reader cũ cancel body ngay, làm mất kết nối. Bài loopback năm request với HTTP EOF trễ 25 ms ghi nhận chín kết nối ở lần Red. Sau sửa, đọc hết HTTP rồi trả socket về pool; bài JSON và SSE đều xác nhận năm request dùng không quá hai kết nối. Đây là test TCP HTTP/1.1 thật cục bộ, không phải benchmark TLS/độ trễ OpenRouter thật và không có SLA tăng tốc.
- Bổ sung dispose idempotent để destroy socket cả khi body đang chờ, từ chối request sau dispose và nối cleanup vào before-quit sau khi hủy phiên. HTTP status lỗi không bỏ lửng body; đọc SSE vẫn hủy tức thì nếu đã DONE nhưng chưa EOF. Timeout 20 giây giữ nguyên; không giả lập HTTP EOF bằng cách trả kết quả trong khi reader vẫn sống.
- Red: test socket chưa đóng sau dispose, request đang chờ không bị hủy, SSE mở quá nhiều TCP và body lỗi không được cancel thất bại trước sửa. Green: qua sau triển khai. Bổ sung test abort sau DONE và điều chỉnh fixture streaming đóng HTTP sau event kết thúc như server thực.
- 109 unit/integration/component test ở 17 file đạt; typecheck, lint và build source đạt. Test loopback chạy không cần key, không gọi OpenRouter hoặc model trả phí. Cài thêm thư viện JS bằng npm với ignore-scripts trong đợt bổ sung dependency để không chạy lại postinstall SQLite/OCR đã chuẩn bị; không thay native module hoặc đóng gói exe. Audit khi cài trả 0 vulnerability.
- Bốn E2E Electron build đạt, gồm nạp dependency mới, lưu/restart cấu hình, capture/OCR/overlay và IPC thật. Format và diff check đạt. Không đổi UI nên không chạy visual QA; source cleanup đã có giới hạn ở đợt trước, không chạy lại trong thay đổi này.
- Đối chiếu cơ chế dispatcher/connection lifecycle với tài liệu chính thức [Node fetch](https://nodejs.org/api/globals.html#fetch) và [Undici Agent](https://undici.nodejs.org/api/Agent).

## Tách suy luận và bật cache OpenRouter - 28/10/2026

- Mọi model dịch gửi reasoning.enabled = false, tóm tắt gửi true; cả hai exclude = true để không hiển thị nội dung suy luận. Không nhầm exclude với tắt reasoning. Tăng max_tokens tóm tắt từ 512 lên 2048 để dành chỗ cho suy luận và câu trả lời; summary rỗng trả lỗi, không được lưu như đã tóm tắt. Giữ timeout/hủy và provider.sort = latency.
- Bật response cache trên HTTP completion bằng X-OpenRouter-Cache: true và X-OpenRouter-Cache-TTL: 300, cho cả streaming và JSON. GET models không có header cache này. Giữ cache SQLite; tăng PROMPT_VERSION lên 4 để không dùng lại kết quả theo chính sách suy luận cũ.
- Truyền mã phiên qua main đến API, session_id có hậu tố translation/summary để giữ provider affinity riêng theo luồng. Quy tắc/prefix system vẫn ổn định khi câu hoặc tóm tắt thay đổi; không cố định provider hay bỏ ngữ cảnh để ép cache hit. Cache phản hồi yêu cầu toàn request giống nhau; prompt cache tự động còn phụ thuộc provider, độ dài và nội dung prefix. Không thêm cache_control cho model/provider chưa xác định.
- Model bắt buộc suy luận hoặc không hỗ trợ suy luận có thể từ chối cấu hình tương ứng; không âm thầm đổi model/trả phí hoặc thay công tắc người dùng yêu cầu. Chỉ gửi cấu hình qua mock transport trong đợt này, chưa đo cache hit hoặc độ trễ thực tế bằng key thật.
- Red: ba ca thất bại khi chưa có cấu hình hai luồng/cache/affinity; thêm một ca summary rỗng thất bại trước sửa. Green: các ca qua sau triển khai. Kiểm tra thêm mã phiên thực từ SessionController, khác phiên có affinity khác, request giống giữ nguyên body, GET models không cache và prefix system không đổi theo câu.
- 104 unit/integration/component test ở 16 file đạt và thoát sạch; typecheck, lint, format và build source đạt. Thay đổi thuần main/HTTP, không đổi UI/capture/IPC; không chạy lại E2E hoặc visual QA trong đợt này, không đóng gói exe.
- Đối chiếu tài liệu chính thức: [reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [response cache](https://openrouter.ai/docs/guides/features/response-caching), [prompt cache và session_id](https://openrouter.ai/docs/guides/best-practices/prompt-caching).

## Model thực tế của từng lời thoại - 28/10/2026

- Thêm modelId từ metadata model của JSON/SSE, bỏ qua metadata sai/thiếu mà vẫn dịch được. Không nhận modelId do AI tự viết trong nội dung; không gán tên router cấu hình thành model đã dùng. Lịch sử cũ hiện chưa có dữ liệu, không gọi API tra cứu lại.
- Cache giữ model gốc nhưng vẫn loại token/chi phí cũ; dialogue giữ model qua mở lại database. Giao diện Việt/Anh thêm dòng Model cùng metadata, có wrap cho ID dài, hỗ trợ hai theme theo Taste app screen hiện có.
- Provider.sort = latency đã được gửi trong completion chung từ trước yêu cầu này; giữ nguyên require_parameters và không đổi model ngầm. Bổ sung test xác nhận request dịch và tóm tắt đều gửi latency. Không đặt SLA hoặc gọi model trả phí.
- Red: bảy test thất bại khi chưa đọc model JSON/SSE, cache làm mất model và UI thiếu trạng thái model. Green: qua sau sửa. Bổ sung thiếu/sai metadata, cache cũ, loại token/chi phí khỏi cache và persistence model. Full suite cuối 99 test/16 file đạt, có cảnh báo worker thoát chậm; bốn file liên quan chạy riêng đạt 52 test và thoát sạch. Typecheck, lint, format và build source đạt. Bốn E2E Electron build đạt; không chạy lại E2E source đang có lỗi cleanup đã ghi ở đợt trước.
- Visual QA trên preview build: model/token/chi phí và lưu settings đạt bốn tổ hợp locale/theme; không tràn ngang ở 390 px. Taste lint/inspect hội thoại 0 FAIL/0 WARN; đã xem bốn ảnh metadata cùng sáu ảnh inspector. Model preview chỉ là fixture, không phải kết quả API thật. Không đóng gói exe.

## Hiển thị chi phí mỗi lần dịch - 28/10/2026

- Thêm costUsd tùy chọn, đọc từ usage.cost của envelope JSON/event SSE cuối, độc lập với token. Kiểm tra số hữu hạn không âm, phân biệt 0 với thiếu/null/âm/chuỗi. Không dùng dữ liệu model tự viết hoặc upstream_inference_cost, không tính tiền theo giá model và không gọi API tra cứu bổ sung.
- Chi phí lưu trong dialogue, không lưu vào cache nội dung. Lần hit cache ghi 0 USD; lịch sử cũ hoặc API thiếu cost hiện -. UI dùng Intl USD theo vi/en, tối đa 8 chữ số thập phân; số dương nhỏ hơn 1e-8 hiện dấu < để không nhầm miễn phí. Chưa cộng tổng hóa đơn, phí nạp tiền hoặc chi phí tóm tắt/request lỗi khác.
- Red: sáu test thất bại khi chưa có chi phí JSON/SSE/0 và UI thiếu cả trạng thái tiền có/không/cache. Green: qua sau triển khai; bổ sung số rất nhỏ, cost độc lập token, persistence qua mở lại database và cache không tính tiền gốc lần hai. Unit/integration/component: 92 test ở 16 file đạt; typecheck, lint và build source đạt. Không gửi key/nội dung thật hoặc gọi model trả phí trong đợt này.
- Visual QA: bốn tổ hợp locale/theme và giá USD mẫu đạt; Taste lint/inspect hội thoại 0 FAIL/0 WARN, đã xem bốn ảnh metadata và sáu ảnh inspector. E2E: bốn bài Electron build và hai bài OCR thật đạt; bài source hoàn thành capture/restart nhưng treo trong cleanup sau khi in trạng thái stream đã giải phóng, timeout 120 giây. Chạy riêng vẫn tái hiện; không coi toàn bộ E2E là đạt và không đổi luồng thoát production trong yêu cầu chi phí này. Các lần thử bị kẹt đã dừng.

## Lọc câu gần giống và hiển thị token - 28/10/2026

- Thêm duplicateThreshold, mặc định 80, kiểm tra số nguyên 0-100 tại ranh giới settings; cấu hình cũ ghép mặc định, SQLite không cần xóa/nâng schema. Giao diện Việt/Anh và sáng/tối giữ bố cục hiện có.
- Lọc tự động bằng Levenshtein sau chuẩn hóa khoảng trắng/hoa thường. So với câu gần nhất đã chấp nhận; câu bị bỏ không làm trôi mốc. Giữ nguyên hoa thường/dấu câu gửi AI và trong lịch sử; reset mốc khi text rỗng, đổi nguồn hoặc dừng/đổi phiên. Dịch ngay/thử lại bỏ lọc gần giống. Ngưỡng thấp có thể bỏ câu khác nghĩa/đang hiện dở; đã nêu trong Cài đặt.
- Đọc prompt_tokens/completion_tokens thật từ metadata JSON hoặc event SSE cuối, không thêm request đếm token, không tin trường usage do AI sinh trong bản dịch. Số thiếu/sai không được đoán thành 0. Chỉ lưu usage cùng bản dịch hoàn tất; cache cục bộ không lưu usage của request gốc, lần dùng cache ghi 0/0 và nhãn riêng.
- Token đầu vào gồm toàn prompt/ngữ cảnh; đầu ra gồm completion theo cách API đếm. Chưa phải báo cáo tổng chi phí: request lỗi/hủy thiếu usage và tóm tắt không được cộng vào số của lời thoại. Không gọi API thật hoặc model trả phí trong đợt kiểm tra này. Căn cứ [Usage Accounting chính thức](https://openrouter.ai/docs/cookbook/administration/usage-accounting): usage tự có trong response, không cần tham số include_usage đã deprecated.
- Red: sáu test thất bại trên hành vi cũ: vẫn dịch lại câu gần giống, trôi mốc theo câu bị bỏ, không có control settings và không giữ usage JSON/SSE. Green: qua sau sửa. Bổ sung kiểm tra ranh giới 80/81/100/0, A→B→A, text rỗng, manual/retry, mốc lỗi, nguyên hoa thường trong payload, persistence usage và ngưỡng, tương thích settings cũ, thiếu usage và cache không tính token hai lần.
- 83 unit/integration/component test ở 16 file đạt. Lần chạy toàn bộ có cảnh báo worker thoát chậm ở session/Field; chạy riêng hai file đạt 14 test và thoát sạch. Typecheck, ESLint, build source đạt; 7 E2E đạt, gồm lưu ngưỡng 95 qua restart, capture/OCR/overlay và source cache lạnh. Không đóng gói exe.
- Kiểm tra UI bằng preview fixture (420 input/36 output, không phải chi phí thật): thao tác lưu ngưỡng, bốn tổ hợp locale/theme và không tràn ngang ở 390 px đạt. Taste lint và inspect hội thoại 0 FAIL/0 WARN; inspect settings có false positive contrast của preview nền rgba cũ và cảnh báo tỷ lệ chữ nhỏ trong hint. Xem giải thích/screenshot ở UI_DESIGN.md.

## Kiểm tra tiếp độ trễ với model miễn phí - 28/10/2026

- Người dùng yêu cầu tiếp tục chỉ miễn phí. Đọc riêng metadata trong database ở chế độ chỉ đọc, không đọc key hoặc nội dung hội thoại: câu có API 3.561 ms bắt đầu hiện bản nháp ở 2.530 ms, queue 0 ms. Một câu khác API 6.422 ms có firstText 5.718 ms; câu sau đó chờ queue 2.995 ms. Đây là các phép đo trong ứng dụng, không phải thời gian kết nối TCP thuần hoặc benchmark có kiểm soát.
- Cấu hình vẫn là `openrouter/free`. Tài liệu chính thức xác nhận router chọn model miễn phí ngẫu nhiên; streaming không loại bỏ thời gian chờ chữ đầu. Không đổi model ngầm hoặc gọi dịch trả phí. Danh sách model miễn phí có structured outputs đã được kiểm tra qua API công khai; chưa benchmark từng model nên không gắn nhãn model nhanh nhất.
- Bỏ metadata quản lý hồ sơ và các danh sách rỗng khỏi prompt; giữ nguyên quy tắc/nhân vật/quan hệ/thuật ngữ và giới hạn hội thoại. Tăng PROMPT_VERSION lên 3 để không tái dùng cache của prompt cũ. Đây là giảm payload, chưa có phép đo API chứng minh giảm độ trễ thực tế hoặc đạt dưới một giây.
- Red: test tái hiện prompt còn chứa id/tên/revision và danh sách rỗng thất bại. Green: test qua sau sửa, kèm test bảo toàn tất cả dữ kiện đã xác nhận. 68 unit/integration/component test đạt; typecheck, lint, format và build source đạt. Không đổi IPC/UI/vòng đời capture; không chạy lại E2E cho thay đổi thuần prompt này. Kết quả 7 E2E ở bảng dưới thuộc lần kiểm tra pipeline streaming trước đó.

## Phần đã triển khai

- Scaffold Electron/React/TypeScript strict, feature-first; lint, formatter, unit/integration test, E2E và đóng gói NSIS.
- Bridge IPC kiểm tra schema, sender và main frame; chỉ capture renderer đang có lệnh bắt đầu được cấp `display-capture`. Từ chối camera/microphone.
- Capture một cửa sổ, preview giới hạn tần suất, crop chuẩn hóa, OCR worker offline, lọc ảnh/text trùng và câu ổn định.
- OpenRouter model list, JSON schema, validation response, timeout, hủy và một retry cho 429/5xx; không tự fallback model.
- Overlay click-through/chỉnh vị trí, đồng bộ theme/locale; lịch sử sửa được, thử lại đoạn lỗi.
- SQLite migration, hồ sơ có phiên bản, quan hệ có hướng, glossary, lịch sử phiên, cache có ngữ cảnh và tóm tắt lúc rảnh.
- Key mã hóa bằng safeStorage và không quay lại renderer; theme sáng/tối/system, i18n Việt/Anh.

## Quyết định khi triển khai

- Electron 45 và better-sqlite3 13 tương thích với nhau; dùng lockfile để giữ phiên bản đã kiểm tra. Bản Electron ban đầu được thay sau khi audit phát hiện advisory.
- Test SQLite chạy trên Node đi kèm Electron để tránh lệch ABI với Node cài trên máy.
- Đổi tên module `capture.ts` thành `captureRuntime.ts` để tránh đụng `Capture.tsx` trên Windows không phân biệt hoa/thường.
- Hồ sơ lưu characters/relationships/glossary trong một document JSON có revision trong bảng profiles, cập nhật nguyên tử. Chưa tách ba bảng khi chưa có nhu cầu truy vấn độc lập.
- OCR hiện dùng SDK PaddleOCR chính thức trong worker riêng, model PP-OCRv5 mobile detection và recognition tiếng Anh. ONNX WASM/model đi cùng build; không cần Python/server. Thiết kế Tesseract trước đây đã được thay thế; xem phép đo cuối tài liệu.
- Token đầu vào được ước lượng bảo thủ bằng số byte UTF-8 cộng overhead; ngân sách có thể chặt hơn tokenizer thực. Không tuyên bố tính token chính xác cho mọi model.
- Preview UI dùng bridge giả lập riêng ngoài bộ cài; ứng dụng production luôn dùng preload thật.

## Bằng chứng kiểm tra

Kết quả lần kiểm tra cuối:

| Kiểm tra                                                                       | Kết quả                                             |
| ------------------------------------------------------------------------------ | --------------------------------------------------- |
| TypeScript strict, ESLint, Prettier                                            | Đạt                                                 |
| Unit/integration/component                                                     | 109 test đạt, 17 file                               |
| E2E bản build                                                                  | 4/4 đạt; source/OCR không chạy lại trong đợt model  |
| Electron E2E trên `release/win-unpacked/Translate Game.exe`                    | 4/4 đạt                                             |
| E2E bản sửa `release/ocr-fix/win-unpacked/Translate Game.exe` và OCR hồi quy   | 5/5 đạt                                             |
| E2E bản `release/capture-30fps/win-unpacked/Translate Game.exe` và OCR hồi quy | 5/5 đạt                                             |
| Taste lint và inspect màn hình Dịch                                            | 0 FAIL, 0 WARN cho cả 4 tổ hợp locale/theme         |
| Hồ sơ/Cài đặt ở 1440 và 390 px                                                 | 16 screenshot đã xem, không tràn ngang              |
| `npm run dev`                                                                  | Giao diện hiển thị, preload trả snapshot thành công |
| `npm run dist`                                                                 | Tạo NSIS x64 thành công, có icon và metadata 0.1.0  |
| Audit dependency sau nâng runtime                                              | 0 vulnerability                                     |

Các phép đo Taste chạy trên production renderer với preview bridge riêng. Các dòng kiểm tra exe là kết quả lịch sử với Tesseract, chưa kiểm chứng bộ cài PaddleOCR; thay đổi hiện tại chỉ build source. Runtime đang dùng Electron 45.0.0; môi trường test Windows 10 x64. Không suy rộng các kết quả này thành nghiệm thu Windows 11 hoặc chất lượng bản dịch AI.

Các vòng Red/Green đã quan sát trong quá trình làm:

- 5 test normalization, text ổn định và queue thất bại trên bộ khung chưa có hành vi, sau đó qua khi triển khai.
- OpenRouter: test gửi request/response, lỗi key và timeout thất bại trước triển khai client, sau đó qua.
- 2 test vùng chọn thất bại khi chưa có phép chuẩn hóa, sau đó qua.
- Test nhãn truy cập tái hiện việc hint làm sai accessible name, sau đó qua khi tách label và aria-describedby.
- Test quyền capture tái hiện thay đổi `display-capture` của Electron 45, sau đó qua khi sửa đúng loại quyền.

Các test bổ sung bảo vệ persistence/migration, IPC input/sender, cache, ngữ cảnh, locale fallback và kết quả API về sau khi đổi phiên. Không gọi API trả phí trong unit/integration/E2E.

OCR PaddleOCR: 30 ảnh chữ rõ + 30 biến thể nền/font tổng hợp, có transcript và công cụ sinh lại. CER trung bình nhóm rõ 0%, khoảng 608 ms/ảnh; nhóm biến thể khoảng 0,77%, khoảng 536 ms/ảnh trong lần đo ghi ở OCR_BENCHMARK.json. Thời gian nhóm rõ gồm lần nạp model đầu tiên; nhóm biến thể không đại diện mọi game khó thực tế.

E2E mở Electron thật: lưu theme/locale và đồng bộ overlay, khởi động lại không tự capture, OCR nguồn thử với HTTP/HTTPS bị chặn ở browser context, lưu/xóa key và CRUD hồ sơ qua IPC. Dữ liệu test nằm trong thư mục tạm riêng.

## Các giới hạn nghiệm thu

- Đã thử dịch một câu công khai bằng cấu hình `openrouter/free` hiện có; chưa đánh giá chất lượng xưng hô hoặc độ trễ trên phiên chơi dài. Các unit/integration/E2E vẫn dùng transport giả lập, không gọi API trả phí.
- Môi trường hiện tại Windows 10 x64; chưa nghiệm thu Windows 11, nhiều màn hình hoặc scaling 150% vật lý.
- Chưa có PS Remote Play, chưa kiểm thử game/video có bảo vệ capture hoặc fullscreen độc quyền.
- Bộ cài chưa ký số. Khởi chạy bản unpacked và tạo NSIS không đồng nghĩa đã kiểm thử toàn bộ vòng cài/gỡ trên Windows sạch.
- OCR tổng hợp vượt ngưỡng kỹ thuật ban đầu; vẫn cần bổ sung dataset gameplay thực tế trước khi cam kết độ chính xác hoặc độ trễ.

## Sửa OCR phụ đề nhỏ trên nền cảnh - 27/10/2026

- Phản hồi thử YouTube cho thấy chuỗi ký tự rác dù vùng chọn chứa phụ đề tiếng Anh. Đã xem video God of War do người dùng cung cấp và ảnh ứng dụng; chưa có ảnh crop nguyên bản từ stream của máy người dùng để tái hiện chính xác cùng frame.
- Capture yêu cầu độ phân giải tối đa mong muốn 3840 × 2160 thay vì để browser chọn mặc định. Nguồn thực tế có thể thấp hơn; không phục hồi được chi tiết đã mất trong video.
- OCR đọc crop phóng lớn tối đa 3 lần, có lề và giới hạn kích thước xử lý. Nếu confidence dưới 85, đọc thêm ảnh chỉ giữ chữ sáng gần trung tính; chọn lượt có confidence cao hơn. Vẫn đọc ảnh gốc để hỗ trợ chữ đen/chữ màu.
- Confidence dưới 60 trả text rỗng, không chuyển chuỗi rác sang dịch. Đây là ngưỡng kỹ thuật, không phải xác suất nhận đúng; có thể bỏ sót câu chữ khó.
- Red: hai test hành vi thất bại khi pixel chưa được tách nền và text confidence thấp còn được chấp nhận. Green: cả hai qua sau sửa. Bổ sung kiểm tra fallback và dừng khi OCR chưa trả về.
- Phép đo Tesseract thật dùng ba ảnh tổng hợp chữ Arial 14 px: nền nhiều chi tiết, nền tối và chữ đen trên nền trắng. Ảnh nền nhiều chi tiết không nhận được câu ở pipeline crop thô; sau xử lý CER 2,94%. Hai nhóm còn lại CER 0%. Đây là kiểm tra hồi quy nhỏ, không thay thế bộ benchmark 30 ảnh hoặc nghiệm thu video thực tế.
- Tái chạy bằng `npx playwright test tests/e2e/ocr.spec.ts`; chi tiết lần chạy ghi tại `test-results/subtitle-ocr.json`. Không gửi ảnh hoặc text thử đến API bên ngoài.
- Bản sửa đạt 34 unit/integration/component test, 5 E2E trên build và 5 E2E khi dùng exe đã đóng gói; typecheck, lint, format và build đạt. Bộ cài mới tại `release/ocr-fix/Translate Game Setup 0.1.0.exe`.
- E2E dùng phím tắt riêng để tránh xung đột với phiên ứng dụng người dùng đang mở. Lần chạy đầu bị lỗi SHORTCUT ở bước lưu settings; không phải lỗi OCR.

## Tăng nhịp theo dõi phụ đề - 28/10/2026

- Stream yêu cầu 30 fps; lấy mẫu vùng chữ khoảng mỗi 33 ms thay cho stream 5 fps và chu kỳ 500 ms. Preview vẫn giới hạn một lần/giây, không đại diện FPS capture.
- Giữ riêng ảnh đang OCR và một ảnh mới nhất đang chờ. Kết thúc OCR thì lấy ngay ảnh mới nhất; không tạo hàng đợi theo số frame. Hai lượt OCR gốc/dự phòng luôn đọc cùng ảnh.
- Sửa lỗi nhánh lấy mẫu lúc bận vẫn vào `finally` và xóa cờ bận của lượt OCR khác. Chỉ lượt sở hữu worker mới được mở khóa và chạy việc chờ.
- Giảm ngưỡng ổn định câu từ 500 ms xuống 150 ms; frame tĩnh không gọi OCR lại hoặc phát IPC theo từng frame. Vẫn có thể nhận phải câu đang hiện dở nếu nó tạm dừng lâu hơn ngưỡng này.
- Red: hai test yêu cầu stream 30 fps và xử lý ngay frame chờ thất bại trên code cũ. Green: qua sau sửa; bổ sung kiểm tra một OCR duy nhất khi bận, không tích tụ frame, không phát IPC 30 lần/giây và dừng bỏ việc chờ.
- Đạt 39 unit/integration/component test và 5 E2E trên build; typecheck, lint và build đạt. E2E đo bằng MediaStreamTrackProcessor trên nguồn thử có chuyển động: stream báo 30 fps, 3840 × 2160; đọc được 30 frame trong khoảng 1014 ms (~29,58 fps). Bộ đếm compositor của video không dùng để đo cửa sổ capture ẩn.
- Đây là FPS stream đo trong một khoảng ngắn trên nguồn thử, không phải FPS OCR hoặc tốc độ dịch. Tesseract và API vẫn có thể chậm hơn nhịp phụ đề; chưa khẳng định không bỏ lỡ câu trên video/game thực tế.
- Bản exe đã đóng gói đạt 5 E2E. Hai lần đo ngắn trên exe khoảng 30,42 và 28,91 fps; không bảo đảm tối thiểu 30 fps liên tục. Bộ cài tại `release/capture-30fps/Translate Game Setup 0.1.0.exe`.
- Lần E2E exe đầu gặp khóa file cache khi dọn dữ liệu tạm sau đóng app; bổ sung retry có giới hạn cho thao tác cleanup, lần chạy lại đạt. Không xóa dữ liệu người dùng.

## Giữ ảnh nguồn và overlay OCR không cần key - 28/10/2026

- Bỏ width/height 3840 × 2160 khỏi yêu cầu capture; dùng `resizeMode: { ideal: 'none' }`, giữ yêu cầu 30 fps. Không tự phóng crop 3 lần; thêm lề ở tỷ lệ pixel 1:1 và chỉ thu nhỏ nếu vượt giới hạn 3200 px/4 triệu pixel. Theo [Screen Capture W3C](https://www.w3.org/TR/2026/WD-screen-capture-20260716/), chế độ `none` ưu tiên đầy đủ chi tiết nguồn; kết quả vẫn cần kiểm tra trên runtime thực.
- Sửa phép đo kích thước: `getSettings()` báo track 1920 × 1080 nhưng frame thực qua `videoWidth/videoHeight` là 1084 × 610, tương ứng vùng nội dung cửa sổ thử 1084 × 611 (làm tròn một pixel). Các số 4K trước đó cũng được ghi từ metadata track, chưa đủ để kết luận kích thước ảnh OCR thực tế.
- E2E xác nhận frame gốc, đổi nguồn thử sang vùng nội dung 960 × 540 thì video cập nhật cùng kích thước; bản exe đo khoảng 30,58 fps trong một khoảng ngắn. Không bảo đảm FPS tối thiểu trên mọi máy/nguồn.
- Khi thiếu key hoặc model, overlay hiển thị chữ OCR và cho chỉnh/khóa vị trí ngay cả trước capture. Chữ rỗng thì hiển thị hướng dẫn trong chế độ chỉnh; dừng capture xóa OCR và ẩn caption. OCR không gọi API dịch hoặc phát lỗi thiếu key trong chế độ này.
- Khi đủ cấu hình, overlay vẫn hiện bản dịch hoàn tất mới nhất. Main và renderer dùng chung hàm chọn caption để tránh lệch nội dung/trạng thái hiện ẩn; không expose API key.
- Red: năm test hành vi thất bại trước sửa, gồm ép 4K, phóng crop, thiếu caption OCR và lỗi key khi chưa cấu hình dịch. Green: toàn bộ test liên quan qua sau sửa. Bổ sung giữ bản dịch khi đã cấu hình và chuyển về OCR khi bỏ key.
- 47 unit/integration/component test đạt; 5 E2E trên build và 5 E2E trên exe đạt. Bộ OCR hồi quy chữ 14 px vẫn đạt: nhóm nền nhiều chi tiết CER 2,94%, nền tối và chữ đen trên nền trắng CER 0%; đây là ba ảnh tổng hợp, chưa phải nghiệm thu video người dùng.
- Đã xem screenshot overlay vi/en × light/dark trên Electron thật; Taste lint/inspect và nhận xét được ghi trong UI_DESIGN.md. Bộ cài mới: `release/native-ocr-overlay/Translate Game Setup 0.1.0.exe`.

## Hồi quy trên ảnh phụ đề gameplay thực - 28/10/2026

- Dùng ảnh Atreus do người dùng cung cấp, lưu crop nguyên pixel và transcript tại `tests/fixtures/subtitles/`. Không đưa transcript vào code nhận dạng. Test chạy offline, không gửi ảnh tới model AI.
- Tái hiện trước sửa: nền bị đọc thành ký tự thừa; hai lượt OCR đọc sai các từ khác nhau. Confidence trung bình cả câu có thể ưu tiên một câu vẫn sai chữ hoa/dấu câu hoặc còn nhiễu. Test so toàn câu thất bại trước khi sửa.
- Lấy output `blocks`/dòng/từ từ Tesseract. Chọn dòng chính cùng các dòng gần có cỡ chữ tương ứng, giữ được phụ đề hai dòng và bỏ dòng nhiễu xa. Đối chiếu bbox giữa ảnh gốc và ảnh tách nền để chọn từ có confidence tốt hơn; kiểm tra cả độ trùng và mép bbox để không ghép từ dính vào một từ đơn.
- Chỉ trong lượt tách chữ sáng, engine không nhận `|` và `\` để hạn chế nhầm I trong hội thoại tiếng Anh. Tham số áp dụng tạm cho lượt đó; lượt ảnh gốc vẫn nhận đầy đủ ký tự. Đây là giới hạn cho phụ đề hội thoại, không cam kết đọc nguyên vẹn các chuỗi kỹ thuật chứa hai dấu này.
- Vẫn tối đa hai lượt OCR, cùng một worker và cùng crop; giữ pixel nguồn, không tăng độ phân giải, không gọi AI để sửa chữ. Lệnh dừng/đổi phiên được kiểm tra sau mỗi lượt để không chạy tiếp hoặc phát kết quả muộn.
- Green: đọc đúng toàn bộ transcript, gồm chữ hoa và dấu câu, trên hai vùng crop 1394 × 150 và 900 × 75 của ảnh được cung cấp (CER 0 trong hai mẫu này). Đây là một cảnh thực, không phải bảo đảm chính xác cho mọi cảnh/font; crop quá sát làm mất nét vẫn có thể nhận sai.
- Bổ sung test chọn từ theo vị trí, không ghép từ ở dòng khác, không ghép từ dính và giữ hai dòng phụ đề. Chi tiết thời gian/kết quả của lần chạy nằm tại `test-results/gameplay-ocr.json`; không đặt SLA từ phép đo này.
- 54 unit/integration/component test và 6 E2E đạt; typecheck, lint, format và build đạt. Chạy từ source bằng F5/`npm run dev`; không đóng gói exe cho thay đổi này.

## Thay engine bằng PaddleOCR - 28/10/2026

- Yêu cầu người dùng: bỏ Tesseract do vẫn đọc sai chữ và thiếu hội thoại trên ảnh hai người nói. Red: test ảnh mới trên engine cũ thất bại; kết quả có `way. :`, `Look.` và ký tự nền cuối câu.
- Gỡ Tesseract, traineddata và code mặt nạ/ghép từ. Dùng `@paddleocr/paddleocr-js` 0.4.2, `onnxruntime-web` 1.24.3 và OpenCV 4.10; cố định phiên bản trong lockfile. Model chính thức `PP-OCRv5_mobile_det` và `en_PP-OCRv5_mobile_rec` tải khi postinstall, kiểm tra SHA-256. Sau chuẩn bị, OCR không cần mạng.
- Worker riêng chạy ONNX WASM CPU một thread; tái sử dụng model. Dùng OpenCV Mat từ pixel RGBA để tránh API DOM của SDK trong worker. Không truyền ảnh capture ra main/OpenRouter, không gọi dịch để sửa chữ. Stop terminate worker ngay và hủy promise đang chờ; lỗi/timeout trả mã OCR hiện có.
- Giữ stream 30 fps, pixel crop nguồn và hàng đợi một ảnh mới nhất. Không phóng lớn cửa sổ. Detection chuẩn hóa theo model với cạnh dài tối đa 1600; recognition chuẩn hóa từng dòng theo tensor của model. Giữ tất cả dòng đủ điểm theo thứ tự, không giới hạn một người nói.
- Green trên hai ảnh người dùng: đủ mọi từ, tên người nói và thứ tự. CER nguyên bản ảnh Atreus 1,32% (mất dấu chấm cuối); ảnh hai người nói 3,57% (mất dấu ba chấm). Test so đủ từ và yêu cầu CER ≤5%; không tuyên bố chính xác toàn bộ dấu câu. Transcript chỉ nằm trong fixture/test.
- Lần E2E cuối: nạp model + OCR đầu khoảng 4.025/3.620 ms; lượt tiếp theo khoảng 898/1.138 ms cho hai crop. Thời gian phụ thuộc tải CPU, không phải SLA hoặc OCR 30 fps. Báo cáo chi tiết nằm tại `test-results/atreus-scene.png.json` và `test-results/angrboda-scene.png.json` sau chạy test.
- Benchmark 60 ảnh tổng hợp: 30 chữ rõ CER trung bình 0%; 30 nền/font biến thể khoảng 0,77%. Báo cáo mới ghi rõ engine tại `docs/OCR_BENCHMARK.json`; chạy lại bằng `npm run test:ocr`.
- 49 unit/integration/component test, 6 E2E, typecheck, lint, format và build đạt. E2E kiểm tra cả source OCR trong Edge và capture/overlay trên Electron build, chặn HTTP/HTTPS ngoài ứng dụng. Capture thực đo khoảng 30,75 fps trong khoảng một giây; không suy rộng thành cam kết tối thiểu liên tục.
- Tài nguyên đã được chuẩn bị cho workspace hiện tại; tiếp tục chạy bằng F5 hoặc `npm run dev`. Không đóng gói exe và chưa kiểm chứng PS Remote Play/Windows 11 trên thay đổi này.

## Tìm và ưu tiên model miễn phí - 28/10/2026

- Main đọc giá prompt/completion/request từ OpenRouter để tạo cờ `isFree`; giá thiếu hoặc không hợp lệ không được coi là miễn phí. Không suy ra từ tên hay hậu tố `:free`. Cache model cũ thiếu cờ vẫn tương thích.
- Thay select model bằng combobox tìm tên/ID không phân biệt hoa thường. Nhóm miễn phí đứng trước, mỗi nhóm xếp theo tên; có nhãn miễn phí, ID phụ, trạng thái không tìm thấy và thao tác chuột/mũi tên/Enter/Escape/Tab. Tìm kiếm không tự chọn model hoặc lưu một chuỗi tùy ý.
- Red: test API thiếu cờ giá và ba test form không có danh sách tìm kiếm thất bại trên code cũ. Green: cả bốn qua sau sửa. Form kiểm tra thứ tự, tìm theo ID, lưu ID đúng và Escape giữ model cũ.
- 53 unit/integration/component test và 6 E2E đạt; typecheck, ESLint và build đạt. Giao diện dropdown được kiểm tra thêm 12 tổ hợp locale/theme/chiều rộng trên bản build với fixture; xem báo cáo Taste trong UI_DESIGN.md, gồm một false positive contrast đã đối chiếu screenshot.
- Không gọi OpenRouter bằng key thật trong đợt này; kiểm tra client dùng transport giả lập. Không đóng gói exe; tiếp tục F5/`npm run dev`.

## Kẹt khởi tạo OCR khi chạy source - 28/10/2026

- Tái hiện trong Electron nạp renderer từ Vite, dùng cấu hình dự án thật. Engine được gọi lần đầu thì Vite mới phát hiện PaddleOCR/OpenCV, re-optimize dependency và phát full reload. Capture bị cleanup giữa phiên, không còn video và không nhận được chữ. Test source thất bại ở bước chờ OCR; bộ test build trước đó không bao phủ tình huống này.
- Thêm PaddleOCR, OpenCV và ONNX WASM vào `optimizeDeps.include` để chuẩn bị ngay từ đầu dev server. Không đổi engine, tăng độ phân giải, thay model dịch hoặc đóng gói exe.
- Bổ sung `tests/e2e/devCapture.spec.ts`: dùng cấu hình renderer thật, ép cache Vite lạnh, chờ thoát `starting` và có OCR, xác nhận không có reload giữa phiên, dừng/restart capture và kiểm tra stream được giải phóng. Test dùng dữ liệu tạm, nguồn thử nội bộ, không dùng key thật.
- Khi xây test mới, bước đóng browser context dev bị treo nếu còn capture hoạt động. Test cleanup chủ động dừng stream/worker rồi gọi luồng quit của Electron; không sửa hành vi thoát production trong đợt này.
- Test source sau sửa đạt; unit/integration/component giữ 53 test. Typecheck, lint, format và build mã nguồn đạt. Sau cập nhật cần dừng phiên F5/dev đang chạy và mở lại để nạp cấu hình Vite mới.

## Giảm thời gian chờ dịch - 28/10/2026

- Metadata lịch sử đọc ở chế độ chỉ đọc: model cấu hình là `openrouter/free`; bốn câu hoàn tất có API trung bình khoảng 4.322 ms, cao nhất 7.626 ms, chưa gồm thời gian xếp hàng. Không in key, câu hội thoại hoặc sửa dữ liệu người dùng trong bước đo.
- Chuyển bản dịch sang SSE: hiển thị dần trường translation trong lịch sử và overlay. Parser xử lý UTF-8 chia chunk, escape Unicode, heartbeat và thứ tự trường JSON khác nhau; không hiện reasoning/JSON thô. Chỉ response hoàn tất đúng schema mới ghi database/cache/ngữ cảnh. Lỗi, timeout hoặc hủy xóa bản nháp và giải phóng reader.
- Ưu tiên provider độ trễ thấp trên cùng model; tắt reasoning tùy chọn riêng khi dịch qua `openrouter/free`. Model cụ thể giữ cấu hình reasoning mặc định để tương thích model bắt buộc suy luận. Không tự chọn model trả phí, service tier hoặc tăng song song làm sai thứ tự ngữ cảnh.
- Prompt yêu cầu dịch phụ đề ngắn gọn, translation trước speaker/listener; tăng phiên bản prompt để không dùng cache cũ không phù hợp. Chặn cùng câu đang pending và tránh gửi lại tự động sau thao tác dịch ngay. Câu xuất hiện lại sau đoạn khác vẫn hợp lệ.
- Thêm metadata queueMs/firstTextMs; bản nháp phát snapshot tối đa mỗi 100 ms sau lần đầu. Không lưu bản nháp theo từng token hoặc tạo IPC mới.

Phép thử HTTP thật dùng cùng câu công khai ngắn “Father, we must leave before dawn.”, prompt tối thiểu, không ghi vào lịch sử ứng dụng. Key chỉ được giải mã trong main và không ghi ra file/log. Không gọi model trả phí.

| Mẫu thử                                                                    | Nhận header |   Hiện chữ đầu | Hoàn tất |
| -------------------------------------------------------------------------- | ----------: | -------------: | -------: |
| Streaming, ưu tiên latency; parser ban đầu chỉ hỗ trợ translation đứng đầu |    1.820 ms | Không ghi được | 9.586 ms |
| Parser hỗ trợ thứ tự trường khác nhau; reasoning mặc định                  |    1.135 ms |       6.137 ms | 6.164 ms |
| Tắt reasoning tùy chọn trên free router                                    |    1.323 ms |       1.327 ms | 1.383 ms |

Đây là ba mẫu nhỏ ở thời điểm khác nhau; free router có thể chọn model/provider khác nhau. Không phải đối chiếu có kiểm soát, không đủ chứng minh mức tăng tốc cố định hoặc đặt SLA. Ngữ cảnh game dài có thể chậm hơn. Tham số dựa trên tài liệu chính thức [streaming](https://openrouter.ai/docs/api_reference/streaming), [reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) và [provider selection](https://openrouter.ai/docs/guides/routing/provider-selection).

- Red → Green: quan sát test thất bại khi chưa có tiến độ trước response hoàn tất, overlay không hiện bản nháp và cùng câu pending tạo hai request. Các test qua sau sửa. Có thêm vòng thất bại/qua cho thao tác thủ công, thứ tự trường preview và tham số reasoning của free router.
- Kiểm tra thêm stream cắt dở/lỗi, timeout/hủy khi đọc body, bản nháp không vào database, kết quả muộn không sang phiên mới, model cụ thể không nhận tùy chọn reasoning và câu A→B→A không bị mất.
- 66 test unit/integration/component ở 15 file và 7 E2E đạt. TypeScript strict, ESLint và build source đạt. E2E gồm Electron capture/overlay, OCR thật và khởi động source với cache Vite lạnh; không có API thật trong bộ E2E.
- Taste lint/inspect đạt 0 FAIL/0 WARN; đã xem giao diện chính và overlay ở bốn tổ hợp locale/theme qua preview fixture, cùng sáu ảnh inspector. Không đóng gói exe; chạy lại F5/`npm run dev` sau cập nhật.
