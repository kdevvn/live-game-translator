// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useAction } from './useAction';

it('giữ trạng thái bận đến khi mọi thao tác đồng thời kết thúc', async () => {
  const { result } = renderHook(() => useAction());
  let finishFirst!: (value: { ok: true; value: void }) => void;
  let finishSecond!: (value: { ok: true; value: void }) => void;
  const first = new Promise<{ ok: true; value: void }>((resolve) => {
    finishFirst = resolve;
  });
  const second = new Promise<{ ok: true; value: void }>((resolve) => {
    finishSecond = resolve;
  });
  let firstRun!: Promise<unknown>;
  let secondRun!: Promise<unknown>;
  act(() => {
    firstRun = result.current.run(() => first);
    secondRun = result.current.run(() => second);
  });
  expect(result.current.busy).toBe(true);
  await act(async () => {
    finishFirst({ ok: true, value: undefined });
    await firstRun;
  });
  expect(result.current.busy).toBe(true);
  await act(async () => {
    finishSecond({ ok: true, value: undefined });
    await secondRun;
  });
  expect(result.current.busy).toBe(false);
});
