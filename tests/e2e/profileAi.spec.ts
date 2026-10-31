import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('model nền và lọc dữ kiện hồ sơ khi chưa đủ hội thoại qua IPC thật', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'translate-game-profile-ai-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TRANSLATE_GAME_DATA_DIR: dataDir },
  });
  try {
    await expect
      .poll(() => app.windows().some((page) => page.url().includes('role=main')))
      .toBe(true);
    const page = app.windows().find((window) => window.url().includes('role=main'));
    if (!page) throw new Error('Thiếu cửa sổ chính');
    await expect
      .poll(async () => {
        const logs = await page.evaluate(() => window.app.debugLogs());
        return logs.ok && logs.value?.some((entry) => entry.path === '/models');
      })
      .toBe(true);
    // Chỉ thay HTTP trong main của ứng dụng test; mọi preload/IPC/SQLite đều là thật.
    await app.evaluate(() => {
      globalThis.fetch = async (input, init) => {
        if (String(input).endsWith('/models'))
          return new Response(
            JSON.stringify({
              data: ['translation', 'summary', 'profile'].map((name) => ({
                id: `test/${name}`,
                name,
                context_length: 32000,
                supported_parameters: ['structured_outputs'],
                pricing: { prompt: '0', completion: '0' },
              })),
            }),
          );
        const body = JSON.parse(String(init?.body));
        if (
          body.model !== 'test/profile' ||
          body.reasoning.enabled !== true ||
          body.stream !== false ||
          body.plugins !== undefined
        )
          throw new Error('Sai model hoặc cấu hình hồ sơ');
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    instructions: 'Dịch tên riêng',
                    characters: [{ name: 'Father', aliases: 'Dad' }],
                    relationships: [
                      { speaker: 'Father', listener: 'Son', self: 'cha', address: 'con' },
                    ],
                    glossary: [{ source: 'Northern Gate', target: 'Cổng Bắc' }],
                    evidence: 'Kiến thức nền về tên nhân vật, không tiết lộ tình tiết.',
                  }),
                },
              },
            ],
          }),
        );
      };
    });
    expect((await page.evaluate(() => window.app.saveKey('test-key-no-network'))).ok).toBe(true);
    expect((await page.evaluate(() => window.app.models())).ok).toBe(true);
    const configured = await page.evaluate(async () => {
      const result = await window.app.snapshot();
      if (!result.ok) return result;
      return window.app.settings({
        ...result.value.settings,
        model: 'test/translation',
        summaryModel: 'test/summary',
        profileModel: 'test/profile',
        profileLearningInterval: 2,
        translateShortcut: 'Ctrl+Alt+Shift+F9',
        pauseShortcut: 'Ctrl+Alt+Shift+F10',
      });
    });
    expect(configured.ok).toBe(true);
    await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tải danh sách model' })).toBeVisible();
    const model = page.getByRole('combobox', { name: 'Model dịch', exact: true });
    await model.click();
    await expect(page.getByText('Input $0 · Output $0 / 1 triệu token').first()).toBeVisible();
    await model.press('Escape');
    const budget = page.getByRole('spinbutton', {
      name: 'Ngân sách ngữ cảnh hồ sơ game (token ước lượng)',
    });
    await expect(budget).toHaveValue('15000');
    await budget.fill('25000');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.app.snapshot());
        return result.ok ? result.value.settings.profileInputTokenLimit : 0;
      })
      .toBe(25000);
    const original = {
      id: 'game',
      name: 'The Northern Gate',
      instructions: 'Giữ tên riêng',
      characters: [],
      relationships: [],
      glossary: [{ source: 'Northern Gate', target: 'Cổng cũ' }],
      revision: 0,
      aiEnabled: true,
    };
    expect((await page.evaluate((profile) => window.app.saveProfile(profile), original)).ok).toBe(
      true,
    );
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.app.snapshot());
        return state.ok
          ? state.value.profileTasks?.find((task) => task.profileId === 'game')?.status
          : '';
      })
      .toBe('completed');
    const stale = await page.evaluate((profile) => window.app.saveProfile(profile), original);
    expect(stale).toEqual({ ok: false, error: 'PROFILE_CHANGED' });
    await page.getByRole('button', { name: 'Hồ sơ game', exact: true }).click();
    await page.getByRole('combobox', { name: 'Chọn hồ sơ', exact: true }).selectOption('game');
    await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await page.getByRole('button', { name: 'Hồ sơ game', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Chọn hồ sơ', exact: true })).toHaveValue(
      'game',
    );
    await expect(page.getByRole('textbox', { name: 'Tự xưng' })).toHaveValue('cha');
    await expect(page.getByRole('textbox', { name: 'Gọi người nghe' })).toHaveValue('con');
    await expect(page.getByText('Đã cập nhật hồ sơ', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Quy tắc dịch ưu tiên' })).toHaveValue(
      'Giữ tên riêng',
    );
    await expect(page.locator('.profile-proposal')).toHaveCount(0);
    const snapshot = await page.evaluate(() => window.app.snapshot());
    expect(
      snapshot.ok &&
        snapshot.value.profiles.find((profile) => profile.id === 'game')?.glossary[0].target,
    ).toBe('Cổng cũ');
    expect(
      snapshot.ok && snapshot.value.profiles.find((profile) => profile.id === 'game')?.characters,
    ).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain('test-key-no-network');
    expect((await page.evaluate(() => window.app.deleteProfile('game'))).ok).toBe(true);
    await page.evaluate(() => window.app.saveKey(''));
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
