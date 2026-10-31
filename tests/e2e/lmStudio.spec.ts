import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('cấu hình LM Studio qua UI, IPC và server HTTP local thật', async () => {
  const requests: { path: string; authorization?: string }[] = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url ?? '', authorization: request.headers.authorization });
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({ data: [{ id: 'test/local-model', object: 'model', arch: 'gemma2' }] }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Thiếu địa chỉ server thử');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const dataDir = await mkdtemp(join(tmpdir(), 'translate-game-local-'));
  let app: ElectronApplication | undefined;
  try {
    const launched = await electron.launch({
      args: ['.'],
      env: { ...process.env, TRANSLATE_GAME_DATA_DIR: dataDir },
    });
    app = launched;
    await expect
      .poll(() => launched.windows().some((page) => page.url().includes('role=main')))
      .toBe(true);
    const page = launched.windows().find((page) => page.url().includes('role=main'));
    if (!page) throw new Error('Thiếu cửa sổ chính');
    await expect(page.getByRole('heading', { name: 'Dịch cửa sổ', exact: true })).toBeVisible();
    expect(
      await page.evaluate(async () => {
        const state = await window.app.snapshot();
        if (!state.ok) return false;
        return (
          await window.app.settings({
            ...state.value.settings,
            translateShortcut: 'Ctrl+Alt+Shift+F9',
            pauseShortcut: 'Ctrl+Alt+Shift+F10',
          })
        ).ok;
      }),
    ).toBe(true);
    await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await page.getByRole('combobox', { name: 'Nhà cung cấp model' }).selectOption('lmStudio');
    await page.getByRole('textbox', { name: 'Địa chỉ LM Studio' }).fill(baseUrl);
    await page.getByRole('button', { name: 'Tải danh sách model' }).click();
    await expect
      .poll(() => requests.some((request) => request.path === '/api/v0/models'))
      .toBe(true);
    expect(requests.every((request) => !request.authorization)).toBe(true);
    const model = page.getByRole('combobox', { name: 'Model dịch', exact: true });
    await model.focus();
    await page.getByRole('option', { name: /test\/local-model/ }).click();
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.app.snapshot());
        return state.ok && state.value.settings.lmStudioModel;
      })
      .toBe('test/local-model');
    await page.getByLabel('Token API local (tùy chọn)').fill('test-local-token');
    await page.getByRole('button', { name: 'Tải danh sách model' }).click();
    await expect
      .poll(() => requests.some((request) => request.authorization === 'Bearer test-local-token'))
      .toBe(true);
    const state = await page.evaluate(() => window.app.snapshot());
    expect(state.ok && state.value.hasApiKey).toBe(false);
    expect(state.ok && state.value.hasLmStudioToken).toBe(true);
    expect(JSON.stringify(state)).not.toContain('test-local-token');
    for (const locale of ['vi', 'en'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        expect(
          await page.evaluate(
            async ({ locale, theme }) => {
              const state = await window.app.snapshot();
              return (
                state.ok &&
                (await window.app.settings({ ...state.value.settings, locale, theme })).ok
              );
            },
            { locale, theme },
          ),
        ).toBe(true);
        await expect(
          page.getByRole('heading', {
            name: locale === 'vi' ? 'Cài đặt' : 'Settings',
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({ path: `.taste-skill/after/lmStudio-${locale}-${theme}.png` });
      }
    }
    await app.close();
    const restarted = await electron.launch({
      args: ['.'],
      env: { ...process.env, TRANSLATE_GAME_DATA_DIR: dataDir },
    });
    app = restarted;
    await expect
      .poll(() => restarted.windows().some((page) => page.url().includes('role=main')))
      .toBe(true);
    const reopened = restarted.windows().find((page) => page.url().includes('role=main'));
    if (!reopened) throw new Error('Thiếu cửa sổ sau khởi động lại');
    await expect
      .poll(async () => {
        const state = await reopened.evaluate(() => window.app.snapshot());
        return (
          state.ok &&
          state.value.settings.lmStudioModel === 'test/local-model' &&
          state.value.hasLmStudioToken
        );
      })
      .toBe(true);
  } finally {
    await app?.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
