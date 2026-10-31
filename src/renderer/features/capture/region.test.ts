import { describe, expect, it } from 'vitest';
import { regionFromPoints } from './region';
describe('Khoanh vùng', () => {
  it('kéo ngược vẫn có vùng chuẩn hóa hợp lệ', () => {
    expect(regionFromPoints({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.6 })).toEqual({
      x: 0.2,
      y: 0.6,
      width: 0.6,
      height: 0.3,
    });
  });
  it('giới hạn điểm ngoài ảnh và bỏ vùng quá nhỏ', () => {
    expect(regionFromPoints({ x: -0.1, y: 0 }, { x: 1.2, y: 1 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(regionFromPoints({ x: 0, y: 0 }, { x: 0.001, y: 0.001 })).toBeNull();
  });
});
