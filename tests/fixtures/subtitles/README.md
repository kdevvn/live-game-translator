# Ảnh hồi quy phụ đề gameplay

`atreus-scene.png` là vùng crop từ ảnh người dùng cung cấp ngày 28/10/2026, không phải ảnh tổng hợp. Crop ở tọa độ x=0, y=540, rộng 1394, cao 150 pixel từ ảnh gốc; không phóng lớn hoặc nén JPEG.

Transcript đối chiếu:

> Atreus: That can NOT be my future. It says I serve Odin, and my father dies.

Test trong `tests/e2e/ocr.spec.ts` đo crop 1394 × 150 và so đủ từ/người nói. CER vẫn tính chữ hoa, dấu câu nguyên bản. Không hardcode transcript vào code OCR. Hai ảnh chưa đại diện toàn bộ game hoặc mọi kiểu chữ.

## Ảnh hai người nói

`angrboda-scene.png`: ảnh người dùng cung cấp ngày 28/10/2026, giữ nguyên pixel.
Crop hồi quy: x=350, y=505, width=700, height=125.

Transcript:

```text
Atreus: There's just no way...
Angrboda: Look, this is the only way things turn out.
```

Kiểm tra PaddleOCR giữ đủ từ, người nói và thứ tự. Dấu chấm/dấu ba chấm bị bỏ sót được ghi trong báo cáo CER nguyên bản, không thêm lại vào kết quả engine.
