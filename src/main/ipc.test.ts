import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { WebContents } from 'electron';

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
);
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, callback: (event: unknown, payload: unknown) => Promise<unknown>) =>
      handlers.set(name, callback),
  },
}));
import { allowedSender, capturePermission, handle } from './ipc';
import { previewSignalSchema, previewSourceSchema } from '../shared/types';

describe('Bảo vệ IPC', () => {
  it('chọn nguồn preview yêu cầu mã chủ sở hữu hợp lệ và chỉ cho null để giải phóng', () => {
    const id = '86f60c82-bb85-4982-9ab4-05acc6586251';
    expect(previewSourceSchema.safeParse({ id, sourceId: 'window:1:0' }).success).toBe(true);
    expect(previewSourceSchema.safeParse({ id, sourceId: null }).success).toBe(true);
    for (const sourceId of ['', undefined, 'x'.repeat(201)])
      expect(previewSourceSchema.safeParse({ id, sourceId }).success).toBe(false);
    expect(previewSourceSchema.safeParse({ id: 'invalid', sourceId: 'window:1:0' }).success).toBe(
      false,
    );
  });
  it('signaling preview không cho UI đổi độ phân giải hoặc gửi URL tùy ý', () => {
    const signal = {
      generation: 1,
      id: '86f60c82-bb85-4982-9ab4-05acc6586251',
      message: { type: 'request' },
    };
    expect(previewSignalSchema.safeParse(signal).success).toBe(true);
    for (const width of [0, 960, 1921, 960.5, NaN]) {
      expect(
        previewSignalSchema.safeParse({ ...signal, message: { type: 'resize', width } }).success,
      ).toBe(false);
      expect(
        previewSignalSchema.safeParse({ ...signal, message: { type: 'request', width } }).success,
      ).toBe(false);
    }
    expect(
      previewSignalSchema.safeParse({
        ...signal,
        message: { type: 'request', url: 'https://example.com' },
      }).success,
    ).toBe(false);
  });
  it('chỉ cấp display-capture cho nguồn đã chọn, từ chối camera và microphone', () => {
    expect(capturePermission(1, 1, 'display-capture', true)).toBe(true);
    expect(capturePermission(1, 1, 'media', true)).toBe(false);
    expect(capturePermission(2, 1, 'display-capture', true)).toBe(false);
    expect(capturePermission(1, 1, 'display-capture', false)).toBe(false);
  });
  it('từ chối cửa sổ ngoài danh sách và subframe', () => {
    expect(allowedSender(2, true, [1])).toBe(false);
    expect(allowedSender(1, false, [1])).toBe(false);
    expect(allowedSender(1, true, [1])).toBe(true);
  });
  it('không thực thi input sai schema và không lộ lỗi nội bộ', async () => {
    const owner = { id: 1 } as WebContents;
    const run = vi.fn(() => {
      throw new Error('private information');
    });
    handle('test', () => [owner], z.string().max(5), run);
    const callback = handlers.get('test');
    if (!callback) throw new Error('Thiếu handler');
    const frame = {};
    const event = { sender: { id: 1, mainFrame: frame }, senderFrame: frame };
    expect(await callback(event, 'too long')).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(run).not.toHaveBeenCalled();
    expect(await callback(event, 'ok')).toEqual({ ok: false, error: 'INTERNAL' });
  });
});
