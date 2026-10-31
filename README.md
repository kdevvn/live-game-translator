# Live Game Translator

Ứng dụng Electron trên Windows: chọn cửa sổ, khoanh vùng phụ đề tiếng Anh, nhận dạng chữ cục bộ và dịch tiếng Việt qua OpenRouter. Có phụ đề nổi, hồ sơ game, thuật ngữ và quy tắc xưng hô có hướng.

## Chạy từ source

Yêu cầu Node.js 24 LTS, npm và Windows x64. Bản phân phối nhắm Windows 11; môi trường triển khai hiện tại là Windows 10 x64 nên vẫn cần kiểm tra nghiệm thu riêng trên Windows 11. Nếu không có binary SQLite dựng sẵn cho runtime, npm cần Python và Visual Studio Build Tools C++ để rebuild.

```powershell
npm ci
npm run dev
```

`postinstall` chuẩn bị SQLite theo ABI Electron, chép ONNX WASM và tải hai model PaddleOCR chính thức (detection mobile + recognition tiếng Anh, khoảng 13 MB), có kiểm tra SHA-256. Chạy OCR sau đó không cần mạng, Python hoặc server. Không dùng `--ignore-scripts` cho cài đặt thông thường. Nếu bước chuẩn bị tài nguyên bị gián đoạn, chạy lại `node scripts/prepare-ocr.mjs`.

Trong VS Code, mở thư mục gốc dự án, chạy `npm ci` ở lần đầu rồi chọn **Run and Debug → Live Game Translator: chạy từ source → F5**. Cấu hình tại `.vscode/launch.json` chạy electron-vite trực tiếp, có source map và tự gắn debugger vào tiến trình con. Renderer cập nhật khi sửa code; thay đổi main/preload sẽ khởi động lại Electron. Không cần chạy `npm run build` hoặc tạo bộ cài trước.

Nhấn **Shift+F5** để dừng phiên debug, hoặc **Ctrl+F5** để chạy không debug. Từ terminal vẫn dùng `npm run dev` như trên. Khi phát triển hằng ngày, kiểm tra bằng source; chỉ tạo `.exe` khi có yêu cầu đóng gói.

Sau khi cập nhật cấu hình Vite, dừng phiên dev đang mở rồi chạy lại. Lần đầu Vite chuẩn bị dependency PaddleOCR/OpenCV/ONNX trước khi capture để tránh tự reload giữa phiên; không cần tạo exe hoặc xóa dữ liệu ứng dụng.

Chạy bản build:

```powershell
npm run build
npm run preview
```

Tạo bộ cài: `npm run dist`. Kết quả nằm trong `release/`, gồm bộ cài NSIS và `win-unpacked/Live Game Translator.exe`. Bộ cài chưa ký số và chưa có auto-update.

## Dùng thử khi chưa cài PS Remote Play

1. Mở **Dịch cửa sổ → Mở nguồn thử**. Một cửa sổ phụ đề tiếng Anh sẽ đổi câu mỗi 7 giây.
2. Bấm **Làm mới**, chọn cửa sổ **Live Game Translator - Test source**.
3. Khoanh vùng phụ đề trên preview, hoặc nhập tọa độ theo phần trăm trong mục **Tọa độ vùng chữ**.
4. Bấm **Bắt đầu theo dõi**. Chưa có API key hoặc model thì phụ đề nổi hiển thị chữ OCR, không gọi API dịch. Có thể bấm **Chỉnh phụ đề nổi** và **Khóa vị trí phụ đề** ngay ở bước này.
5. Vào **Cài đặt**, nhập API key OpenRouter và **Lưu thay đổi**. Key không được hiển thị lại.
6. Bấm **Tải danh sách model**, mở dropdown rồi tìm theo tên hoặc ID. Model miễn phí nằm đầu danh sách và có nhãn **Miễn phí**; các model cùng nhóm xếp theo tên. Chọn bằng chuột hoặc phím mũi tên/Enter rồi lưu; Escape đóng tìm kiếm và giữ lựa chọn cũ. Ứng dụng chỉ liệt kê model hỗ trợ structured outputs, không tự chọn hoặc đổi model.
7. Quay về màn hình dịch, bắt đầu/tiếp tục theo dõi. Bấm **Dịch ngay** hoặc bật **Tự động dịch khi câu ổn định**.
8. Bấm **Chỉnh phụ đề nổi**, kéo cửa sổ phụ đề tới vị trí mong muốn rồi **Khóa vị trí phụ đề** để bấm xuyên qua.

Trong **Cài đặt → Phụ đề nổi**, chỉnh **Thời gian hiển thị (giây)** từ 1-60 giây, mặc định 5. Phụ đề tự ẩn khi hết thời gian; câu mới hiện lại. OCR lặp nguyên câu không giữ phụ đề mãi; lịch sử hội thoại vẫn còn.

Phím mặc định: `Ctrl+Alt+T` dịch ngay, `Ctrl+Alt+P` tạm dừng/tiếp tục. Có thể đổi trong Cài đặt; ứng dụng báo khi phím bị trùng hoặc không đăng ký được.

Bản dịch hiện dần trong hội thoại và phụ đề nổi khi API đang trả kết quả. Nội dung đang nhận là bản nháp; chỉ kết quả hoàn tất, đúng cấu trúc mới được lưu. Dịch thủ công và tự động không gửi trùng một câu đang chờ. Sau cập nhật code main, dừng rồi chạy lại F5/`npm run dev` để nạp thay đổi.

Trong **Cài đặt → Lọc câu tương tự**, ngưỡng mặc định **80%**, chỉnh được 0-100%; 0 tắt lọc gần giống. Chế độ tự động so với câu gần nhất đã chấp nhận, bỏ câu đạt ngưỡng để tránh dịch lại do OCR khác dấu câu. Chuẩn hóa khoảng trắng/hoa thường chỉ dùng để so sánh; câu gửi AI vẫn giữ hoa thường và dấu câu. Ngưỡng thấp có thể bỏ sót câu khác nghĩa hoặc câu đang hiện dở. **Dịch ngay/Thử lại** bỏ qua lọc gần giống; vẫn chặn gửi trùng nguyên văn khi request đó đang chờ.

Mọi lượt dịch, kể cả **Dịch ngay/Thử lại**, chỉ nhận câu có ít nhất **4 ký tự Unicode và một chữ cái** sau chuẩn hóa khoảng trắng. `Hi`, `a12`, `123456`, `12@`, `^%&*%$` bị bỏ; `123a`, `123$s`, `こんにちは`, `你好世界` được giữ. Câu bị bỏ vẫn hiện ở vùng OCR để kiểm tra nhưng không lên overlay, không gọi AI hoặc tạo bản ghi DB. Caption hợp lệ trước đó tiếp tục theo thời gian còn lại.

Trong **Cài đặt → OpenRouter**, chọn riêng **Model tóm tắt** và **Model hồ sơ game**; để trống để dùng model dịch. Đổi model nền không dừng dịch. Nhịp học hồ sơ mặc định 20 câu dịch thành công, chỉnh được từ 1–200 câu.

**Ngân sách ngữ cảnh hồ sơ game** mặc định **15.000 token ước lượng**, chỉnh được từ 1.000–1.000.000. Áp dụng cho tóm tắt, khởi tạo và bổ sung hồ sơ, gồm prompt/schema; vẫn bị giới hạn bởi ngữ cảnh model sau khi chừa đầu ra. Dịch hội thoại giữ trần 6.000 riêng. Tăng mức này có thể tăng chi phí; lưu mức mới sẽ thử lại hồ sơ bị lỗi giới hạn ngữ cảnh mà không dừng dịch. Hiện ứng dụng ước lượng bảo thủ bằng byte UTF-8, chưa dùng tokenizer riêng từng model.

Mỗi lời thoại hiển thị token đầu vào/đầu ra do API báo, bao gồm prompt và ngữ cảnh, không chỉ riêng câu OCR. Thiếu usage hoặc lịch sử cũ thì hiện dấu `-`; cache cục bộ hiện 0 token và nhãn không gọi API mới. Đây không phải tổng tiền tài khoản: chưa cộng các request lỗi/hủy thiếu usage, tóm tắt hoặc phân tách giá token cache của provider.

Chi phí USD của từng lần dịch lấy từ `usage.cost` do OpenRouter trả và lưu cùng lịch sử. Không tính bằng giá model hoặc dùng chi phí upstream. Thiếu số tiền thì hiện `-`, cache cục bộ hiện 0 USD. Số dương nhỏ hơn độ chính xác hiển thị được ghi dạng `< 0,00000001 USD`, không làm tròn thành miễn phí. Không phát sinh API riêng để tra chi phí; số này không bao gồm phí nạp tiền hoặc các request khác của tài khoản.

Mỗi lời thoại hiển thị ID model thực tế do OpenRouter trả, hữu ích khi dùng `openrouter/free`. ID được lưu trong lịch sử và cache, không đổi theo model đang chọn sau đó. Lịch sử/cache cũ thiếu metadata hiện `-`, không đoán model đã dùng. Cả dịch và tóm tắt đều gửi `provider: { require_parameters: true, sort: 'latency' }`; ưu tiên provider độ trễ thấp không bảo đảm thời gian cố định.

Dịch gửi yêu cầu **tắt suy luận**; tóm tắt ngữ cảnh luôn gửi yêu cầu **bật suy luận**. Model/provider cần hỗ trợ chế độ tương ứng; model bắt buộc suy luận có thể từ chối request dịch, ứng dụng không tự đổi model hoặc bật lại suy luận. Cache phản hồi OpenRouter bật 5 phút, bổ sung cache cục bộ. Mã phiên ổn định hỗ trợ tái dùng prompt cache nếu provider cho phép; cache không bảo đảm nhanh hơn khi câu/ngữ cảnh khác nhau hoặc chưa có cache hit. Chưa có phép đo độ trễ API thật cho cấu hình mới này.

Request dịch dùng pool Keep-Alive riêng trong main, tối đa hai kết nối. Danh sách model, tóm tắt và hồ sơ AI dùng pool nền riêng tối đa bốn kết nối, chạy song song mà không chiếm socket dịch. Cả hai giữ kết nối rỗi tối đa 60 giây nếu server cho phép. Stream đọc hết HTTP body sau `[DONE]` để tái sử dụng socket; dừng/timeout vẫn hủy ngay. Hai pool đóng khi thoát ứng dụng. Phần này giảm việc thiết lập lại kết nối, không giảm thời gian suy luận/sinh chữ của model.

## Ngữ cảnh và dữ liệu

- Hồ sơ **Chung** dùng được ngay. Tạo hồ sơ riêng cho mỗi game, thêm nhân vật/biệt danh, thuật ngữ và chỉ dẫn dịch.
- **Tự bổ sung hồ sơ bằng AI** mặc định bật cho hồ sơ game mới/cũ, tắt cho Chung. Sau khi lưu tên game và có cấu hình, AI khởi tạo phần thiếu từ kiến thức cơ bản, không tìm web hoặc gửi ảnh; nếu không trả dữ kiện, giao diện báo không có dữ liệu và vẫn tiếp tục học từ hội thoại. AI có thể thêm cách xưng hô dựa trên quan hệ công khai đã biết. Có thể tắt theo hồ sơ. Các tác vụ này cũng sử dụng API và có chi phí theo model, chưa cộng vào chi phí từng câu dịch.
- Trong tab **Hồ sơ game**, nút **Xóa dữ liệu hồ sơ** yêu cầu xác nhận trước khi xóa nhân vật, cách xưng hô, thuật ngữ và đề xuất AI. Tên, quy tắc dịch ưu tiên và lịch sử được giữ. AI chỉ học từ hội thoại mới; có thể bấm **Thử lại** để khởi tạo lại. Nếu hồ sơ đang dùng, phiên sẽ tạm dừng.
- Nhân vật và thuật ngữ AI chỉ được bổ sung khi có bằng chứng trong ít nhất bốn câu gốc khác nhau đã dịch thành công ở các phiên của hồ sơ. Tên hoặc biệt danh nhân vật không được thêm làm thuật ngữ. Lịch sử trước khi xóa dữ liệu hồ sơ vẫn được dùng để đếm bằng chứng.
- AI tự thêm nhân vật, quan hệ và thuật ngữ còn thiếu, giữ nguyên dữ liệu đã có. **Quy tắc dịch ưu tiên** chỉ do người dùng tự nhập; AI không tự điền hoặc đề xuất sửa trường này, kể cả khi đang trống. Mâu thuẫn xuất hiện tại **Hồ sơ bằng AI** để chấp nhận hoặc bỏ; lỗi có nút **Thử lại**. AI được yêu cầu hạn chế spoiler, nhưng người dùng vẫn cần kiểm tra độ chính xác. Bản đang nhập được giữ khi AI cập nhật; nếu hồ sơ đã đổi, tải lại trước khi lưu.
- Quan hệ Father → Son có thể là `ta / con`, Son → Father là `con / cha`. Mỗi chiều cần một dòng riêng.
- Quy tắc người dùng luôn được đặt ở mức ưu tiên cao hơn suy luận model. Nhân vật chưa rõ được giữ là `unknown`; AI vẫn có thể suy luận sai.
- Mỗi hồ sơ có nhiều phiên. Chọn phiên cũ để tiếp tục hoặc tạo phiên mới để bắt đầu ngữ cảnh khác. Không tự capture khi khởi động.
- Có thể sửa câu OCR, bản dịch và người nói/nghe từ lịch sử. Sửa ngữ cảnh đang dùng sẽ tạm dừng pipeline để kết quả cũ không đè dữ liệu mới.
- Tóm tắt chạy nền sau mỗi 20 câu dịch thành công, song song với dịch và không bị hủy chỉ vì có câu mới. Tóm tắt cũng sử dụng API, do đó có chi phí theo model.
- SQLite và key mã hóa nằm trong thư mục `userData` của Electron dưới tài khoản Windows; không nằm trong thư mục source hoặc cài đặt. Không chia sẻ nguyên thư mục này nếu chứa hội thoại riêng tư.
- UI mặc định tiếng Việt, hỗ trợ English; ngôn ngữ giao diện độc lập ngôn ngữ dịch. Theme mặc định theo Windows, có thể chọn Sáng/Tối.

## Kiểm tra

Chạy kiểm thử từ terminal; không mở Visual Studio hoặc VS Code để chạy test và không khởi chạy hay gắn debugger. Nếu test hoặc Electron crash, xem log và trace trong `test-results/` để chẩn đoán, không chọn mở Visual Studio để debug. Nếu Windows tự mở trình gỡ lỗi, báo lại hiện tượng và nguyên nhân; không tự thay đổi cấu hình gỡ lỗi toàn hệ thống.

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e
npm run test:ocr
```

Unit/integration test chạy bằng Node đi kèm Electron để dùng đúng binary SQLite; không gọi API trả phí. E2E mở cửa sổ Electron thật và dùng dữ liệu tạm riêng, có thể ảnh hưởng focus trong lúc chạy. Bộ đo OCR cần Microsoft Edge và sinh lại ảnh có transcript; kết quả lưu tại `docs/OCR_BENCHMARK.json`.

Để chạy cùng bộ E2E trên exe đã đóng gói, đặt biến `TRANSLATE_GAME_EXECUTABLE` thành đường dẫn tuyệt đối của `release/win-unpacked/Live Game Translator.exe` trước khi chạy `npm run test:e2e`.

Kiểm tra UI độc lập: sau build chạy `node scripts/preview-ui.mjs`, mở `http://127.0.0.1:4173`. Đây là preview với bridge giả lập chỉ dành cho visual QA, không dùng để dịch. `node scripts/check-ui.mjs` chụp màn hình hồ sơ/cài đặt theo hai locale và hai theme.

## Giới hạn đã biết

- Chỉ nhận dạng chữ đang xuất hiện; chưa dịch giọng nói, tiếng Nhật hoặc tiếng Trung.
- Nội dung được bảo vệ có thể ra hình đen; cửa sổ thu nhỏ có thể ngừng cập nhật. Ưu tiên cửa sổ đang mở hoặc chế độ toàn màn hình không độc quyền.
- Overlay chỉ hiển thị trên PC. Không thay chữ gốc trong game và không xuất lên TV nối trực tiếp PS5.
- Khi đổi kích thước, letterbox hoặc bố cục nguồn, kiểm tra lại vùng chọn. Theo dõi một cửa sổ tại một thời điểm.
- Có thể bỏ lỡ câu ngắn hoặc khi API chậm hơn tốc độ hội thoại; hàng đợi đầy sẽ ghi nhận đoạn bị bỏ qua.
- OCR benchmark dùng ảnh tổng hợp; không đại diện mọi font, video nén hoặc nền game chuyển động.
- Capture yêu cầu 60 fps; preview là video trực tiếp, tự khớp chiều rộng khung theo DPI, tối đa Full HD (1920×1080)/60 fps. Giữ tỷ lệ của toàn bộ cửa sổ được chọn, không ép thành tỷ lệ video YouTube/game bên trong. Không tăng độ phân giải nguồn hoặc phóng lớn khi mã hóa; ưu tiên chi tiết chữ. Nguồn nhỏ vẫn có thể mềm khi kéo khung hiển thị lớn hơn ảnh gốc. FPS thực phụ thuộc cửa sổ nguồn và máy. OCR vẫn theo dõi vùng chữ khoảng mỗi 33 ms, chạy tuần tự và chỉ giữ một frame mới nhất chờ; 60 fps không phải tốc độ OCR/dịch.
- Capture ưu tiên `resizeMode: none`, không ép cửa sổ lên 4K. PaddleOCR nhận pixel crop gốc, độc lập với video preview; detection giới hạn cạnh dài 1600 px và recognition chuẩn hóa từng dòng theo model. Preview dùng chung nguồn capture, không gửi chuỗi ảnh JPEG liên tục qua IPC. Nếu preview lỗi, dừng rồi bắt đầu theo dõi để kết nối lại.
- PaddleOCR dùng model tiếng Anh PP-OCRv5 trong Web Worker với ONNX WASM CPU. Lượt đầu cần nạp model; tốc độ phụ thuộc CPU và kích thước vùng chọn. Chữ nhỏ/nền phức tạp hoặc dấu câu sát mép vẫn có thể nhận sai, không có bước AI tự sửa OCR.
- Đã thử một câu công khai qua `openrouter/free`; chưa benchmark chất lượng xưng hô hoặc độ trễ trên phiên chơi dài. Router miễn phí có thể chọn model/provider khác nhau nên tốc độ dao động; không cam kết thời gian dịch cố định. Chi tiết phép đo trong `docs/IMPLEMENTATION.md`.
- Chưa kiểm chứng PS Remote Play, Windows scaling 150% trên màn hình thật, nhiều màn hình hoặc mọi chế độ toàn màn hình.

Xem [architecture](docs/ARCHITECTURE.md), [code rules](docs/CODE_RULES.md), [quyết định UI](docs/UI_DESIGN.md) và [báo cáo triển khai](docs/IMPLEMENTATION.md).

## Dùng model local qua LM Studio

1. Cài LM Studio, tải một model văn bản hỗ trợ JSON có cấu trúc và bật server trong mục Developer.
2. Trong **Cài đặt → Kết nối model**, chọn **LM Studio**. Nhập địa chỉ API, mặc định `http://localhost:1234/v1`; nếu dùng máy khác trong LAN, thay localhost bằng địa chỉ máy chạy server và bật truy cập mạng trong LM Studio.
3. Nếu server bật xác thực, nhập token LM Studio. Token là tùy chọn khi server tắt xác thực; được mã hóa riêng với key OpenRouter và không hiển thị lại.
4. Nhấn **Tải danh sách model**, chọn model dịch. Có thể chọn riêng model tóm tắt/hồ sơ hoặc để dùng model dịch.

Đổi nhà cung cấp vẫn giữ các lựa chọn model trước đó. LM Studio áp dụng cho cả dịch và tác vụ nền, không tự chuyển sang OpenRouter khi lỗi. Nếu server chưa chạy hoặc model không hỗ trợ JSON schema, ứng dụng báo lỗi để bạn kiểm tra; dịch có timeout 20 giây, tác vụ nền 240 giây.

Tài liệu chính thức: [API tương thích OpenAI](https://lmstudio.ai/docs/developer/openai-compat), [token xác thực](https://lmstudio.ai/docs/developer/core/authentication), [JSON có cấu trúc](https://lmstudio.ai/docs/developer/openai-compat/structured-output).
