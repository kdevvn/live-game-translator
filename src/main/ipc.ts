import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import { z } from 'zod';
import type { ApiResult } from '../shared/types';
import { errorCode } from './features/session';

/** Chỉ cửa sổ capture với lệnh bắt đầu hợp lệ được xin quyền chia sẻ hình. */
export function capturePermission(
  sender: number | undefined,
  owner: number | undefined,
  permission: string,
  starting: boolean,
): boolean {
  return sender !== undefined && sender === owner && starting && permission === 'display-capture';
}

/** Kiểm tra quyền theo WebContents được main sở hữu và chỉ chấp nhận main frame. */
export function allowedSender(sender: number, frame: boolean, allowed: number[]): boolean {
  return frame && allowed.includes(sender);
}

/** Đăng ký IPC hẹp với validation runtime và lỗi đã lọc. */
export function handle<T, R>(
  channel: string,
  owners: () => WebContents[],
  schema: z.ZodType<T>,
  run: (payload: T) => R | Promise<R>,
): void {
  ipcMain.handle(channel, async (event, payload: unknown): Promise<ApiResult<R>> => {
    if (
      !allowedSender(
        event.sender.id,
        event.senderFrame === event.sender.mainFrame,
        owners().map((w) => w.id),
      )
    )
      return { ok: false, error: 'FORBIDDEN' };
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
    try {
      return { ok: true, value: await run(parsed.data) };
    } catch (error) {
      return { ok: false, error: errorCode(error) };
    }
  });
}
