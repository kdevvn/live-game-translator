import type { DebugEntry } from '../../shared/types';

const MAX_ENTRIES = 100;
const MAX_TEXT = 100_000;
const TRUNCATED = '\n… [truncated]';

/** Nhật ký OpenRouter giới hạn kích thước, chỉ giữ trong bộ nhớ tiến trình main. */
export class DebugLog {
  private entries: DebugEntry[] = [];
  private keys = new Map<number, string>();
  private nextId = 1;
  constructor(private readonly changed: (entries: DebugEntry[]) => void) {}
  /** Bắt đầu một lần gửi, không ghi header hoặc API key. */
  start(path: string, body: unknown, key: string): number {
    const id = this.nextId++;
    this.keys.set(id, key);
    this.entries.unshift({
      id,
      startedAt: Date.now(),
      path,
      request: this.clean(JSON.stringify(body ?? null, null, 2), key),
      response: '',
      status: 'pending',
    });
    for (const removed of this.entries.splice(MAX_ENTRIES)) this.keys.delete(removed.id);
    this.emit();
    return id;
  }
  /** Hoàn tất request; nội dung lỗi cũng được lọc key và giới hạn. */
  finish(id: number, status: number | undefined, response: string, error?: string): void {
    const entry = this.entries.find((item) => item.id === id);
    if (!entry) return;
    entry.httpStatus = status;
    const key = this.keys.get(id) ?? '';
    entry.response = this.clean(response, key);
    entry.status = error ? 'error' : 'success';
    entry.error = error ? this.clean(error, key) : undefined;
    this.keys.delete(id);
    this.emit();
  }
  /** Ghi lỗi xử lý nội dung sau khi HTTP đã thành công. */
  fail(id: number | undefined, error: string): void {
    const entry = this.entries.find((item) => item.id === id);
    if (!entry) return;
    entry.status = 'error';
    entry.error = error;
    this.emit();
  }
  /** Trả bản sao để UI không sửa trạng thái gốc. */
  snapshot(): DebugEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
  /** Xóa mọi bản ghi và khóa dùng để lọc. */
  clear(): void {
    this.entries = [];
    this.keys.clear();
    this.emit();
  }
  /** Bỏ key và cắt dữ liệu quá dài để tránh tăng bộ nhớ vô hạn. */
  private clean(value: string, key: string): string {
    const redacted = key ? value.split(key).join('[redacted]') : value;
    return redacted.length > MAX_TEXT ? redacted.slice(0, MAX_TEXT) + TRUNCATED : redacted;
  }
  /** Chỉ phát bản sao tới cửa sổ chính. */
  private emit(): void {
    this.changed(this.snapshot());
  }
}
