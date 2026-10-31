# Live Game Translator

Dịch phụ đề game từ tiếng Anh sang tiếng Việt ngay trên Windows. Chọn cửa sổ đang chơi, khoanh vùng phụ đề và xem bản dịch trên overlay mà không cần rời game.

## Tính năng

- Nhận dạng chữ cục bộ bằng PaddleOCR; hỗ trợ dịch qua **OpenRouter, LM Studio và Ollama**.
- Hiển thị bản dịch dần trên overlay có thể di chuyển, chỉnh cỡ chữ và bấm xuyên qua.
- Hồ sơ riêng cho từng game: nhân vật, thuật ngữ và quy tắc xưng hô; hỗ trợ AI bổ sung hồ sơ từ hội thoại.
- Lưu lịch sử, tiếp tục phiên cũ và chỉnh sửa bản dịch.
- Giao diện tiếng Việt/Anh, theme sáng/tối và phím tắt tùy chỉnh.

## Chạy từ mã nguồn

Yêu cầu **Windows x64**, **Node.js 24 LTS** và npm.

```powershell
npm ci
npm run dev
```

Lần cài đầu cần mạng để tải model OCR. OCR sau đó chạy cục bộ; dịch bằng OpenRouter cần mạng và API key. Nếu SQLite cần biên dịch lại, máy cần Python và Visual Studio Build Tools C++.

## Sử dụng

1. Trong **Cài đặt → Kết nối model**, chọn nhà cung cấp, nhập API key/token nếu cần, tải danh sách và chọn model.
2. Chọn hoặc tạo hồ sơ game, rồi mở một phiên dịch.
3. Chọn cửa sổ nguồn, khoanh vùng phụ đề và bấm **Bắt đầu theo dõi**. Có thể dùng **Mở nguồn thử** để làm quen.
4. Bật **Tự động dịch khi câu ổn định** hoặc bấm **Dịch ngay**.
5. Dùng **Chỉnh phụ đề nổi** để đặt vị trí overlay, sau đó **Khóa vị trí phụ đề**.

Phím tắt mặc định: **Ctrl+Alt+T** để dịch ngay; **Ctrl+Alt+P** để tạm dừng/tiếp tục.

Với model local, bật server tương thích OpenAI và chọn model hỗ trợ JSON có cấu trúc. Địa chỉ mặc định:

| Nhà cung cấp | Địa chỉ API                 |
| ------------ | --------------------------- |
| LM Studio    | `http://localhost:1234/v1`  |
| Ollama       | `http://localhost:11434/v1` |

## Lưu ý

- Hiện hỗ trợ OCR tiếng Anh và dịch sang tiếng Việt; không dịch giọng nói.
- Overlay chỉ hiển thị trên PC, không thay chữ gốc trong game.
- Chất lượng và tốc độ phụ thuộc hình ảnh, model và phần cứng. Cửa sổ thu nhỏ hoặc nội dung được bảo vệ có thể không capture được.
- OCR chạy cục bộ; văn bản và ngữ cảnh được gửi đến nhà cung cấp dịch đã chọn. Lịch sử lưu trên máy, API key/token được mã hóa bằng cơ chế của hệ điều hành.

## Phát triển

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Tìm hiểu thêm tại [Kiến trúc](docs/ARCHITECTURE.md) và [Quy tắc code](docs/CODE_RULES.md).
