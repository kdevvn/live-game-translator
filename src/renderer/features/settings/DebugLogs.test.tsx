// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DebugLogs } from './DebugLogs';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'vi' } }),
}));
afterEach(cleanup);
it('hiển thị request, response và cho phép xóa nhật ký', () => {
  const clear = vi.fn();
  render(
    <DebugLogs
      entries={[
        {
          id: 1,
          startedAt: 1,
          path: '/chat/completions',
          request: 'prompt',
          response: 'quota',
          status: 'error',
          httpStatus: 429,
          error: 'RATE_LIMIT',
        },
      ]}
      clear={clear}
    />,
  );
  fireEvent.click(screen.getByText('/chat/completions'));
  expect(screen.getByText('prompt')).toBeTruthy();
  expect(screen.getByText('quota')).toBeTruthy();
  expect(screen.getByText(/429/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'debug.clear' }));
  expect(clear).toHaveBeenCalledOnce();
});
