/** Chuẩn hóa text OCR trước khi so sánh nội dung. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
/**
 * So độ giống Levenshtein trên bản chữ thường, giữ nguyên input cho hiển thị/gửi AI.
 * Ngưỡng 0 tắt lọc. Bỏ prefix/suffix chung và dừng sớm khi đã vượt số phép sửa cho phép.
 */
export function isSimilarText(first: string, second: string, threshold: number): boolean {
  if (threshold <= 0) return false;
  let a = Array.from(normalizeText(first).toLowerCase());
  let b = Array.from(normalizeText(second).toLowerCase());
  if (!a.length || !b.length) return false;
  const allowed = Math.floor((Math.max(a.length, b.length) * (100 - threshold)) / 100);
  if (Math.abs(a.length - b.length) > allowed) return false;
  let start = 0;
  while (start < Math.min(a.length, b.length) && a[start] === b[start]) start++;
  a = a.slice(start);
  b = b.slice(start);
  while (a.length && b.length && a.at(-1) === b.at(-1)) {
    a.pop();
    b.pop();
  }
  if (!a.length || !b.length) return Math.max(a.length, b.length) <= allowed;
  if (a.length > b.length) [a, b] = [b, a];
  let previous = Array.from({ length: a.length + 1 }, (_, i) => i);
  let current = new Array<number>(a.length + 1).fill(Infinity);
  for (let row = 1; row <= b.length; row++) {
    current[0] = row;
    const low = Math.max(1, row - allowed);
    const high = Math.min(a.length, row + allowed);
    if (low > 1) current[low - 1] = Infinity;
    let minimum = current[0];
    for (let column = low; column <= high; column++) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (a[column - 1] === b[row - 1] ? 0 : 1),
      );
      minimum = Math.min(minimum, current[column]);
    }
    if (high < a.length) current[high + 1] = Infinity;
    if (minimum > allowed) return false;
    [previous, current] = [current, previous];
  }
  return previous[a.length] <= allowed;
}
/** Theo dõi độ ổn định của một dòng phụ đề. */
export class TextStabilizer {
  private candidate = '';
  private since = 0;
  private emitted = '';
  /** Khởi tạo thời gian chờ tối thiểu tính theo mili giây. */
  constructor(private readonly delay: number) {}
  /** Trả câu mới khi ổn định; thao tác thủ công xác nhận ngay và ngăn tự động gửi trùng. */
  accept(input: string, now: number, immediate = false): string | null {
    const text = normalizeText(input);
    if (text !== this.candidate) {
      this.candidate = text;
      this.since = now;
    }
    if (!text) {
      this.emitted = '';
      return null;
    }
    if ((!immediate && now - this.since < this.delay) || this.emitted === text) return null;
    this.emitted = text;
    return text;
  }
}
/** Hàng đợi tuần tự có thể hủy theo phiên. */
export class TranslationQueue<T> {
  private pending: T[] = [];
  private controller: AbortController | null = null;
  private task: Promise<void> = Promise.resolve();
  /** Nhận bộ xử lý, callback khi bỏ đoạn và giới hạn đoạn chờ. */
  constructor(
    private readonly run: (item: T, signal: AbortSignal) => Promise<void>,
    private readonly skip: (item: T) => void,
    private readonly limit: number,
  ) {}
  /** Thêm một đoạn vào hàng đợi. */
  push(item: T): void {
    if (!this.controller) {
      this.execute(item);
      return;
    }
    if (this.pending.length >= this.limit) {
      const removed = this.pending.shift();
      if (removed !== undefined) this.skip(removed);
    }
    this.pending.push(item);
  }
  /** Hủy việc đang chạy và đoạn đang chờ. */
  cancel(): void {
    this.pending.splice(0).forEach(this.skip);
    this.controller?.abort();
  }
  /** Chờ hàng đợi hiện tại kết thúc. */
  async idle(): Promise<void> {
    while (this.controller) await this.task;
  }
  /** Xử lý một đoạn và tiếp tục hàng đợi kể cả khi caller trả lỗi. */
  private execute(item: T): void {
    this.controller = new AbortController();
    this.task = this.run(item, this.controller.signal)
      .catch(() => undefined)
      .finally(() => {
        this.controller = null;
        const next = this.pending.shift();
        if (next !== undefined) this.execute(next);
      });
  }
}
