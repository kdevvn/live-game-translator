# Chẩn đoán Explorer bị đơ khi capture/OCR

Ngày kiểm tra: 01/11/2026. Không khởi chạy Electron GUI, LM Studio hoặc thay cấu hình Windows trong lần kiểm tra này.

## Bằng chứng trên máy

- Hệ điều hành: Windows 10 Pro 22H2, build 19045.
- Application event 1002 ghi Explorer bị restart lúc 23:30:19 ngày 30/10 và 00:09:07, 21:16:34 ngày 31/10/2026.
- Ngay sau sự kiện Explorer lúc 00:09:07, Application event 1000 lúc 00:09:08 ghi `svchost.exe_CaptureService` crash trong `captureservice.dll`, mã `0xc0000005`.
- System event 7031 lúc 00:09:09 xác nhận CaptureService kết thúc bất thường và Windows lên lịch khởi động lại dịch vụ.
- Application event 1000 lúc 00:18:04 ghi bản cài `Translate Game.exe` crash trong `ucrtbase.dll`, mã `0xc0000409`. Đây là sự kiện khác, không đủ bằng chứng để quy cùng một nguyên nhân.

Các mốc thời gian hỗ trợ nghi vấn luồng chụp cửa sổ kích hoạt vấn đề giữa capture native và Windows shell. Chưa có dump của Explorer đang treo hoặc trace của phiên lỗi để xác định deadlock/driver cụ thể. Không thể dùng tương quan thời gian để khẳng định OCR hay API dịch trực tiếp gây crash.

Chromium có backend chụp cửa sổ WGC; tham khảo [mã nguồn tạo capturer](https://github.com/chromium/chromium/blob/main/content/public/browser/desktop_capture.cc). Electron cũng có [báo cáo crash chụp cửa sổ trên Windows 10](https://github.com/electron/electron/issues/52901). Báo cáo đó là trường hợp tham khảo, chưa chứng minh trùng lỗi trên máy này.

## Lỗi ứng dụng đã sửa

1. Các nhánh OCR lỗi, video không tiến và mở video thất bại trước đây chờ `bridge.error()` rồi mới dừng tài nguyên. IPC treo khiến stream/worker/timer còn sống; IPC bị từ chối có thể làm cleanup không chạy. Nay dừng ngay trước khi báo lỗi, đồng thời xử lý Promise bị từ chối.
2. IPC báo lỗi trả muộn trước đây có thể gọi `stop()` lên phiên mới. Nay callback báo lỗi không còn quyền dừng nguồn sau khi trả về.
3. Stream vừa gán vào video nhưng `play()` chưa hoàn tất trước đây vẫn được tái sử dụng. Lỗi của lượt preview cũ có thể dừng phiên OCR mới. Nay chỉ tái sử dụng video đã phát sẵn sàng, lượt đang mở được vô hiệu và giải phóng có kiểm soát.
4. Dừng hẳn đặt kích thước hai canvas về 0 để bỏ bộ đệm pixel còn giữ lại.

Test hồi quy dùng stream/worker/IPC giả lập, gồm lỗi IPC chậm hoặc từ chối, callback cũ và 20 chu kỳ bật/dừng. Các test này chứng minh vòng đời ứng dụng; không thay thế kiểm tra CaptureService/Explorer thật.

## Hướng khắc phục tiếp theo

1. Kiểm chứng bản sửa từ source sau khi môi trường Electron an toàn. Phân biệt rõ **tạm dừng** với **dừng hẳn**: tạm dừng hiện chủ động giữ stream để preview, nên vẫn giữ phiên capture native. Khi sử dụng xong cần dừng hẳn hoặc thoát ứng dụng.
2. Nếu vẫn đơ sau khi dừng hẳn, ưu tiên thêm backend capture thay thế WGC, có lựa chọn trong settings. Cần đánh giá DXGI cho màn hình hoặc GDI/BitBlt cho cửa sổ theo đúng runtime. Phải kiểm tra ảnh đen, cửa sổ bị che, DPI, đa màn hình và tọa độ crop. Không tự chuyển sang chụp toàn màn hình vì có thể thu thêm nội dung riêng tư.
3. Không áp cờ `--disable-features` lấy từ phiên bản Chromium khác khi chưa xác nhận runtime hiện tại thực sự hỗ trợ; cờ cho screen capture không mặc nhiên đổi backend window capture. Không tắt sandbox hoặc GPU toàn ứng dụng để coi như đã sửa lỗi.
4. Nếu backend thay thế vẫn lỗi, lấy dump Explorer tại thời điểm treo và đối chiếu Application/System events, phiên bản driver GPU, thời điểm bắt đầu/dừng capture. Dump có thể chứa dữ liệu riêng tư, chỉ thu thập và chia sẻ khi người dùng chủ động đồng ý. Đây là bước phân biệt deadlock shell, lỗi runtime và driver.

## Giới hạn xác minh

- TDD: ba test đầu thất bại trước khi sửa cleanup; test preview đang mở thất bại trước khi bổ sung trạng thái video sẵn sàng. Sau sửa, toàn bộ 20 test capture đạt.
- Lượt kiểm tra cuối bằng `node node_modules/vitest/vitest.mjs run`: 35 file test, 282 test đạt.
- ESLint, TypeScript và build source đạt. Format check ba file thay đổi và `git diff --check` đạt; format check toàn repo báo 122 file lệch định dạng, phần lớn đã có từ trước (checkout dùng CRLF). Không format lại các file ngoài phạm vi.
- Không chạy Electron E2E: bản cài dependency hiện thiếu `node_modules/electron/dist`, không thể xác minh ACL theo quy định dự án. Không tải hoặc chạy Electron để thử crash.
- Kiểm tra mã nguồn bằng Node/Vitest; không dùng `npm test` vì script này yêu cầu Electron binary.
- Bản sửa nằm trong source, chưa thay thế bản exe người dùng đang cài. Không đóng gói bộ cài trong đợt này.
- Chưa khẳng định đã hết đơ Explorer; cần kiểm chứng native có kiểm soát sau khi xử lý môi trường.
