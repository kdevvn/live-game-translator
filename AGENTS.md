# Hướng dẫn làm việc trong project

- Trước khi sửa code, đọc [architecture](docs/ARCHITECTURE.md) và [code rules](docs/CODE_RULES.md). Đọc thêm `AGENTS.md` trong thư mục con nếu có.
- Trả lời đơn giản, rõ ràng bằng tiếng Việt. Giữ phong cách code hiện có; không tự ý đổi cấu trúc hoặc thêm framework.
- Dùng Electron + TypeScript, tổ chức feature-first bên trong từng tiến trình. Chỉ tạo file/thư mục khi có nhu cầu thực tế.
- Tuân thủ TDD: viết test hành vi thất bại trước, triển khai tối thiểu để test qua, rồi refactor. Áp dụng DRY và YAGNI.
- Viết JSDoc rõ ràng bằng tiếng Việt có dấu cho hàm, hook, component và hợp đồng dữ liệu theo `docs/CODE_RULES.md`.
- Đặt cấu hình có thể chỉnh ở settings; hằng số dùng riêng đặt đầu file, dùng chung đặt tại nơi sở hữu. Không rải magic number/string.
- Khi thiết kế, sửa hoặc review giao diện, bắt buộc dùng skill **Taste Skill: Design Taste Frontend** (`taste-skill:design-taste-frontend`). Đọc `SKILL.md` và `references/app-screens.md`; dùng quy trình dành cho app screen.
- Hỗ trợ theme sáng/tối và i18n `vi`/`en` ngay từ đầu. Ngôn ngữ mặc định là tiếng Việt. Không hardcode chuỗi giao diện hoặc màu theme trong component.
- Không đưa API key, truy cập filesystem/database hoặc Node.js API vào giao diện. Giữ IPC hẹp, có kiểu dữ liệu và kiểm tra đầu vào.
- Trước khi bàn giao, chạy kiểm tra phù hợp và báo đúng kết quả. Không tuyên bố đã chạy test hoặc kiểm tra UI khi chưa chạy.
- Khi kiểm thử, chạy lệnh từ terminal; không mở Visual Studio hoặc VS Code và không khởi chạy hay gắn debugger. Nếu ứng dụng lỗi hoặc crash, đọc log/trace trong terminal và báo lỗi; không chọn mở Visual Studio để debug.
- Không chạy thử lại Electron E2E khi đã biết lỗi môi trường có thể làm Electron crash và bật hộp thoại Windows Just-In-Time Debugger/Visual Studio. Chỉ chạy lại sau khi xác minh nguyên nhân đã được xử lý bằng kiểm tra không khởi chạy Electron.
- Lỗi đã gặp ngày 30/10/2026: Electron báo `install_dir_access.cc:52` vì ACL của `node_modules/electron/dist` thiếu quyền đọc cho `ALL APPLICATION PACKAGES`. Trước khi chạy lại Electron E2E trên môi trường này, kiểm tra ACL bằng terminal; không khởi chạy để thử xem còn crash không. Không tự đổi ACL, registry/JIT debugger hoặc tắt sandbox để né lỗi.
- Khi Electron E2E bị chặn, tiếp tục các kiểm tra phù hợp không mở Electron GUI (lint, format, typecheck, unit/component test, build hoặc renderer trên browser với bridge giả lập), ghi rõ phần Electron thật chưa kiểm chứng. Nếu Windows tự bật hộp thoại debugger, dừng lượt kiểm tra đó, báo ngay và không chọn mở Visual Studio.
- Không gọi CLI `lms`/`lms.exe` để kiểm tra LM Studio trên môi trường này, kể cả `lms server status`, `lms ls`, `--help` hoặc `--version`: đã gặp lỗi native `Illegal Instruction` (`0xc000001d`) làm Windows bật hộp thoại debug. Ưu tiên đọc log/cấu hình; khi cần kiểm tra kết nối thì gọi API HTTP của server đang chạy, không tự khởi động LM Studio hoặc CLI. Test tự động dùng mock transport/server HTTP thử, không gọi LM Studio thật.
- Khi phát triển, ưu tiên chạy từ source qua `npm run dev` hoặc cấu hình VS Code. Không đóng gói bộ cài/exe trừ khi người dùng yêu cầu; build kiểm tra mã nguồn không đồng nghĩa đóng gói exe.
- Nếu tạo commit, dùng thông điệp tiếng Việt có dấu.
