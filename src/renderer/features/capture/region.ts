import type { CaptureRegion } from '../../../shared/types';
/** Điểm tương đối trên nội dung ảnh. */
export interface RegionPoint {
  x: number;
  y: number;
}
/** Chuẩn hóa hai góc kéo thành vùng hợp lệ; bỏ thao tác click không có diện tích. */
export function regionFromPoints(a: RegionPoint, b: RegionPoint): CaptureRegion | null {
  const clamp = (n: number): number => Math.min(1, Math.max(0, n));
  const x = Math.min(clamp(a.x), clamp(b.x));
  const y = Math.min(clamp(a.y), clamp(b.y));
  const width = Number(Math.abs(clamp(a.x) - clamp(b.x)).toFixed(5));
  const height = Number(Math.abs(clamp(a.y) - clamp(b.y)).toFixed(5));
  return width >= 0.01 && height >= 0.01 ? { x, y, width, height } : null;
}
