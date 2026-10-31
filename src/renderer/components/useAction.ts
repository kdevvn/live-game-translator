import { useState } from 'react';
import type { ApiResult, AppError } from '../../shared/types';

/** Chạy thao tác bridge, gom lỗi đã dịch ở UI và không để promise bị bỏ rơi. */
export function useAction() {
  const [error, setError] = useState<AppError | null>(null);
  const [pending, setPending] = useState(0);
  /** Trả value khi thành công; báo lỗi ở state và trả undefined khi thất bại. */
  async function run<T>(action: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
    setPending((count) => count + 1);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.error);
      return result;
    } catch {
      setError('INTERNAL');
      return { ok: false, error: 'INTERNAL' };
    } finally {
      setPending((count) => count - 1);
    }
  }
  return { run, error, busy: pending > 0 };
}
