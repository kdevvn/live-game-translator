# Quy tắc viết code

## 1. Nguyên tắc chung

- Tuân thủ [ARCHITECTURE.md](ARCHITECTURE.md) và các ranh giới tiến trình Electron.
- Feature-first trong main/renderer; đặt code và test gần feature sở hữu.
- Giữ cách viết thống nhất với code hiện có. Thay đổi quy ước phải cập nhật tài liệu và công cụ liên quan.
- Ưu tiên hàm đơn giản, trách nhiệm rõ, dependency tường minh. Không thêm lớp chỉ để chuyển tiếp lời gọi.
- **DRY:** một quy tắc nghiệp vụ hoặc một nguồn dữ liệu có một nơi định nghĩa. Chỉ chia sẻ khi trách nhiệm và lý do thay đổi giống nhau, không trừu tượng hóa chỉ vì hai đoạn code trông giống nhau.
- **YAGNI:** chỉ triển khai yêu cầu hiện tại. Không tạo hệ plugin, backend, framework nội bộ hoặc adapter cho nền tảng tương lai.

## 2. TypeScript và định dạng

- Bật `strict`; không dùng `any` để bỏ qua lỗi. Dữ liệu bên ngoài bắt đầu là `unknown`, được kiểm tra trước khi sử dụng.
- Ưu tiên type suy luận trong thân hàm; khai báo kiểu cho tham số và return của API/hàm export. Component có props được định nghĩa rõ ràng.
- Dùng union cho trạng thái hữu hạn; không dùng boolean chồng chéo tạo trạng thái không hợp lệ.
- Ưu tiên `const`, dùng `let` khi cần gán lại; không dùng `var`. Dùng `import type` cho import chỉ chứa kiểu.
- Hạn chế type assertion và non-null assertion; kiểm tra null và narrow kiểu thay vì ép kiểu cho qua compiler.
- Dùng named export cho code ứng dụng; default export chỉ khi công cụ/framework yêu cầu.
- Đặt tên code bằng tiếng Anh: camelCase cho biến/hàm, PascalCase cho component/type, UPPER_SNAKE_CASE cho hằng cấu hình cố định cấp module.
- Component/file component dùng PascalCase (`Capture.tsx`); module thường camelCase (`capture.ts`), hook bắt đầu `use`; test dùng tên file gốc với `.test.ts`/`.test.tsx`.
- Prettier thống nhất: 2 spaces, single quotes, dấu chấm phẩy, trailing comma `all`, printWidth 100, line ending LF. Không sửa format thủ công khác formatter.
- ESLint áp dụng TypeScript, React Hooks và promise handling. Không disable rule toàn file để che lỗi; ngoại lệ nhỏ phải giải thích lý do.

## 3. Docstring bằng tiếng Việt

Trong TypeScript, dùng **JSDoc `/** ... */` bằng tiếng Việt có dấu**.

Bắt buộc ghi JSDoc cho:

- Hàm/hook/component khai báo có tên, kể cả private/internal.
- API qua preload, IPC handler nghiệp vụ, worker message và hợp đồng dữ liệu dùng chung.
- Type/interface nghiệp vụ; field có đơn vị, ý nghĩa chưa rõ, giới hạn hoặc quy tắc đặc biệt.
- Hàm có side effect, bất đồng bộ, cleanup hoặc quy tắc xử lý thứ tự.

Nội dung nêu mục đích và hành vi đáng chú ý. Dùng `@param`, `@returns`, `@throws` khi cần giải thích ý nghĩa tham số, kết quả, lỗi hoặc đơn vị; không lặp lại kiểu TypeScript. Giải thích hủy request, lưu dữ liệu, quy tắc ưu tiên hoặc điều kiện bỏ kết quả nếu có.

Ví dụ quy ước, không phải API đã triển khai:

```ts
/**
 * Dịch một đoạn hội thoại bằng ngữ cảnh đã chụp tại thời điểm gửi.
 * Không tự lưu kết quả để caller kiểm tra phiên trước khi cập nhật dữ liệu.
 *
 * @param segment - Đoạn OCR đã chuẩn hóa, có mã phiên và số thứ tự.
 * @param context - Ngữ cảnh và quy tắc xưng hô áp dụng cho đoạn này.
 * @param signal - Tín hiệu hủy khi dừng hoặc đổi phiên dịch.
 * @returns Bản dịch đã kiểm tra cấu trúc.
 * @throws Lỗi xác thực, timeout hoặc response không hợp lệ từ nhà cung cấp.
 */
export async function translateSegment(
  segment: TranslationSegment,
  context: TranslationContext,
  signal: AbortSignal,
): Promise<TranslationResult> {
  // Triển khai sau khi có test hành vi thất bại.
}
```

Callback ngắn trong `map`, `filter`, JSX hoặc test không cần JSDoc riêng khi tên và ngữ cảnh đã rõ. Logic callback phức tạp cần tách thành hàm có tên và tài liệu. Test mô tả hành vi bằng tên tiếng Việt; không lặp lại tên test bằng docstring.

Comment nội tuyến giải thích **vì sao**, không mô tả lại từng câu lệnh. Không để TODO mơ hồ. Khi đổi hành vi phải cập nhật docstring cùng thay đổi; tài liệu sai là lỗi code.

## 4. TDD: Red → Green → Refactor

Áp dụng cho code hành vi mới và sửa lỗi, gồm nghiệp vụ, IPC, lưu dữ liệu, hook và tương tác UI:

1. **Red:** viết test hành vi mong muốn; chạy và thấy thất bại vì hành vi chưa có hoặc lỗi cần sửa, không vì môi trường hỏng.
2. **Green:** viết lượng code nhỏ nhất để test qua. Chưa thêm nhánh xử lý cho yêu cầu tương lai.
3. **Refactor:** làm rõ tên, loại trùng lặp có ý nghĩa, cập nhật JSDoc; chạy lại test liên quan.

Sửa bug phải có test tái hiện trước khi sửa. Khi refactor thuần túy, giữ test hành vi hiện có; bổ sung nếu chưa có bằng chứng bảo vệ hành vi. Không viết test sau rồi gọi là TDD.

### Chiến lược test

| Phạm vi               | Kiểm tra                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Unit                  | Chuẩn hóa OCR, lọc trùng, thứ tự, timeout, queue, cache, ngân sách ngữ cảnh, ưu tiên xưng hô |
| Component             | Chọn nguồn, bắt đầu/dừng, trạng thái lỗi, settings, đổi theme/locale, keyboard               |
| Integration           | IPC có kiểm tra input, SQLite/migration và payload OpenRouter qua mock transport             |
| E2E                   | Một số luồng quan trọng qua Electron thật, bridge thật và dữ liệu thử                        |
| Thủ công trên Windows | Capture, focus, click-through, DPI, đa màn hình, đóng gói và nguồn có giới hạn capture       |

- Test hành vi quan sát được, không test tên private function hoặc cấu trúc nội bộ.
- Không snapshot toàn bộ DOM làm bằng chứng chính. Không test chỉ để khẳng định mock được gọi mà bỏ qua đầu ra/hành vi.
- Clock, OCR, transport được truyền vào nơi cần kiểm soát; không tạo DI framework.
- Dùng fake timers cho ổn định chữ/retry; không dùng sleep thật để chờ test.
- Unit/component test không cần key, mạng hoặc OpenRouter thật. Test SQLite dùng database tạm, không chạm dữ liệu người dùng.
- Chạy các lệnh kiểm thử từ terminal, không mở Visual Studio hoặc VS Code và không khởi chạy hay gắn debugger. Khi test hoặc Electron crash, dùng log/trace để chẩn đoán, không chọn mở Visual Studio để debug; báo rõ nếu Windows tự mở trình gỡ lỗi.
- Test quan trọng: kết quả cũ không đè câu mới; đổi phiên vô hiệu hóa kết quả; queue đầy không tăng vô hạn; user rule thắng suy luận model; cache đổi khi context/rule đổi.
- Theme/i18n: test persistence, cập nhật cửa sổ, locale fallback và hai bộ key khớp nhau; không chỉ test thuộc tính CSS được gán đúng chuỗi.
- CSS thuần, tài liệu và cấu hình không có hành vi thực thi không cần unit test hình thức. Thay đổi UI vẫn phải qua kiểm tra trực quan; TDD không thay thế visual QA.

Khi dựng scaffold, tạo script tương ứng: `lint`, `format:check`, `typecheck`, `test`, `test:e2e`, `build`. Đây là yêu cầu tương lai, chưa phải lệnh hiện có. Mỗi lần thay đổi chạy test mục tiêu; trước bàn giao chạy lint, format check, typecheck, test và build. Chạy E2E khi luồng tích hợp bị ảnh hưởng. Báo rõ kiểm tra chưa chạy và lý do.

## 5. Cấu hình và DRY

- Không hardcode model, API key, timeout, chu kỳ capture hoặc giới hạn queue rải rác.
- Giá trị kỹ thuật dùng riêng đặt đầu module sở hữu. Chỉ đưa sang `shared/defaults.ts` khi nhiều tiến trình thực sự cần cùng giá trị.
- Giá trị người dùng có thể chọn nằm trong settings, có mặc định và validation tại main. Không biến mọi hằng số thành tùy chọn UI.
- Endpoint đặt tại module OpenRouter; không nhận URL tùy ý từ renderer khi chưa có yêu cầu.
- Prompt thuộc feature translation/context, tách file khi đủ dài. Có phiên bản prompt để kiểm soát cache.
- Theme dùng token; giao diện dùng key i18n. Một trạng thái hoặc tổng số hiện nhiều nơi phải lấy từ cùng nguồn dữ liệu.

## 6. React và giao tiếp tiến trình

- Dùng function component, hook theo đúng Rules of Hooks; render không gây side effect.
- Dùng state cục bộ trước; Context chỉ cho dữ liệu dùng chung như theme/locale và snapshot phiên khi cần. Không thêm global store trước khi có vấn đề cụ thể.
- Trạng thái phiên có một nguồn sự thật tại main. Renderer gửi intent và nhận snapshot/event, không tự duy trì bản sao trạng thái nghiệp vụ độc lập.
- Effect đăng ký listener phải cleanup; start/stop lặp lại không tạo nhiều stream, worker hoặc subscription.
- React StrictMode không được làm chạy hai phiên capture hoặc gọi API hai lần do effect thiếu cleanup.
- IPC có kiểu, validation runtime, giới hạn kích thước và kiểm tra sender. Không expose database hoặc hàm invoke tùy ý.
- Overlay chỉ nhận dữ liệu cần hiển thị và điều khiển phù hợp; không nhận key hoặc toàn bộ hồ sơ.
- Không chạy OCR hoặc xử lý ảnh nặng trong main/UI thread. Không truyền toàn bộ video qua IPC.
- Bắt lỗi tại ranh giới, không nuốt lỗi; dùng mã lỗi có kiểu và thông báo qua i18n. Cleanup ở finally khi phù hợp.

## 7. Theme, i18n và Taste Skill

- Mọi thay đổi UI phải áp dụng **Taste Skill: Design Taste Frontend**, nhánh app screen trong `references/app-screens.md`.
- Dùng skill đang cài, tìm lại nếu đường dẫn cache thay đổi. Không coi đường dẫn tuyệt đối trên một máy là cấu hình portable của project.
- Lần xây UI đầu chọn hướng theo `draw.mjs --app`; ghi quyết định/seed, sau đó giữ nhất quán. Không bốc lại style cho từng component nhỏ.
- Không tự áp quy tắc landing page lên tool: không hero, số liệu trang trí hoặc animation xuất hiện hàng loạt. Ưu tiên preview, bản dịch và điều khiển phiên.
- Dùng token semantic cho màu, spacing, typography và radius. Không tạo token cho mọi con số bố cục chỉ dùng một lần nếu không có ý nghĩa tái sử dụng.
- Icon đặt cạnh chữ phải có khoảng cách rõ ràng, nhất quán và căn chỉnh với dòng chữ; không dựa vào khoảng trắng trong JSX. Dùng `gap` hoặc spacing dùng chung theo ngữ cảnh, kể cả với icon loading.
- Light/dark được thiết kế và kiểm tra riêng; mặc định dark theo brief desktop ngày 29/10/2026. Text thường đạt tương phản ít nhất 4.5:1; focus và control dễ thấy. Không dùng màu làm tín hiệu duy nhất.
- Tiếng Việt là locale mặc định/fallback; tiếng Anh có đủ key. Không hardcode chuỗi hiển thị trong component, kể cả aria-label, tooltip, empty và error.
- Thay theme/locale phải lưu được, cập nhật các cửa sổ và giữ nguyên phiên đang chạy. Không nhầm locale UI với ngôn ngữ đích dịch.
- Font phải hiển thị đúng dấu tiếng Việt, không bị cắt dấu. Kiểm tra text dài ở cả hai locale, bàn phím, scaling và reduced-motion.
- Chạy các công cụ lint/inspect theo skill, xem screenshot thực tế rồi sửa. Kiểm tra trên bản build; bridge giả lập trong browser không thay thế kiểm tra Electron.
- Nếu môi trường thiếu công cụ, ghi rõ phần chưa kiểm chứng; không tuyên bố đã đạt visual QA. Không cần chạy visual tooling chỉ cho thay đổi tài liệu.

## 8. Điều kiện hoàn thành

- Hành vi đúng yêu cầu, có bằng chứng Red/Green cho thay đổi cần TDD; không có test phụ thuộc mạng trả phí.
- TypeScript strict, lint và format đạt; không che lỗi bằng any, assertion hoặc rule disable tùy tiện.
- Có JSDoc tiếng Việt đúng hành vi; không rải cấu hình hoặc logic trùng lặp.
- Không thêm abstraction/dependency/chức năng ngoài phạm vi.
- Thay đổi UI đã kiểm tra `vi`/`en` × `light`/`dark`, accessibility cơ bản và Taste Skill.
- Vòng đời stream/worker/request/listener được dọn đúng; không ghi secret vào log.
- Cập nhật tài liệu khi quyết định kiến trúc hoặc quy ước đổi. Báo kiểm tra đã chạy, kết quả và hạn chế còn lại.
