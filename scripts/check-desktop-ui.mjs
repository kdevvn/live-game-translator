import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Kiểm tra renderer build qua bridge giả lập; Electron thật có bộ E2E riêng.
const folder = '.taste-skill/after/screens';
await mkdir(folder, { recursive: true });
// Chỉ browser QA dùng loopback; không thay cấu hình WebRTC hay sandbox của Electron.
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'],
});
const findings = [];
const errors = [];
const labels = {
  vi: {
    translation: 'Dịch cửa sổ',
    context: 'Hồ sơ game',
    settings: 'Cài đặt',
    commands: 'Mở bảng lệnh',
  },
  en: {
    translation: 'Translate window',
    context: 'Game profiles',
    settings: 'Settings',
    commands: 'Open command palette',
  },
};
try {
  for (const locale of ['vi', 'en'])
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`http://127.0.0.1:4173?locale=${locale}&theme=${theme}`);
        await page.evaluate(() => document.fonts.ready);
        for (const screen of ['translation', 'context', 'settings']) {
          await page
            .getByRole('navigation')
            .getByRole('button', { name: labels[locale][screen], exact: true })
            .click();
          const overflow = await page.evaluate(() => {
            const frame = document.querySelector('.main-frame');
            return (
              document.documentElement.scrollWidth > window.innerWidth ||
              frame.scrollWidth > frame.clientWidth
            );
          });
          findings.push({ locale, theme, width, screen, overflow });
          expect(overflow, `${locale}/${theme}/${width}/${screen}`).toBe(false);
          await page.screenshot({ path: `${folder}/${screen}-${locale}-${theme}-${width}.png` });
          if (screen === 'settings') {
            await page.locator('.main-frame').evaluate((element) => {
              element.scrollTop = element.scrollHeight;
            });
            await page.screenshot({
              path: `${folder}/${screen}-bottom-${locale}-${theme}-${width}.png`,
            });
          }
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('button', { name: labels[locale].commands }).click();
      const search = page.getByRole('dialog').getByRole('combobox');
      await expect(search).toBeFocused();
      await page.screenshot({ path: `${folder}/commands-${locale}-${theme}.png` });
      await search.fill(labels[locale].translation);
      await search.press('Enter');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(labels[locale].translation);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog').getByRole('combobox').press('Escape');
      await expect(page.getByRole('button', { name: labels[locale].commands })).toBeFocused();
      await page.close();
    }
  // Ảnh gameplay fixture đã có trong project, dữ liệu mẫu chỉ phục vụ visual QA.
  const image = `data:image/png;base64,${(await readFile('tests/fixtures/subtitles/atreus-scene.png')).toString('base64')}`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4173?theme=dark');
  await page.evaluate(async (thumbnail) => {
    const result = await window.app.snapshot();
    const state = result.value;
    state.hasApiKey = true;
    state.settings.model = 'preview/subtitle-model';
    state.ocrText = 'That can NOT be my future. It says I serve Odin, and my father dies.';
    state.overlayText =
      'Đó không thể là tương lai của con. Nó nói con sẽ phục vụ Odin, còn cha con sẽ chết.';
    state.status = 'paused';
    state.sourceName = 'Gameplay fixture';
    state.profiles[0].id = 'preview-game';
    state.profiles[0].name = 'Lời tiên tri';
    state.profiles[0].glossary = [{ source: 'Odin', target: 'Odin' }];
    state.profiles[0].characters = [{ id: 'atreus', name: 'Atreus', aliases: '' }];
    state.session = {
      id: 'preview',
      profileId: 'preview-game',
      summary: 'Atreus lo sợ lời tiên tri về tương lai của hai cha con.',
      summarizedThrough: 1,
      createdAt: 0,
    };
    state.dialogues = [
      {
        id: 'preview-line',
        sessionId: 'preview',
        sequence: 1,
        text: state.ocrText,
        translation: state.overlayText,
        speaker: 'Atreus',
        listener: 'Father',
        status: 'translated',
        createdAt: 0,
        ocrMs: 37,
        apiMs: 420,
        modelId: 'preview/subtitle-model',
      },
    ];
    window.app.sources = () =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'fixture', name: 'Gameplay fixture', thumbnail }],
      });
    await window.app.settings(state.settings);
  }, image);
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await page.getByLabel('Chọn cửa sổ ứng dụng', { exact: true }).selectOption('fixture');
  await expect
    .poll(() => page.locator('.preview video').evaluate((video) => video.videoWidth))
    .toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${folder}/translation-populated-dark.png` });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: `${folder}/translation-reduced-motion.png` });
  await page.close();
} finally {
  await browser.close();
}
await writeFile(`${folder}/report.json`, JSON.stringify({ findings, errors }, null, 2));
expect(errors).toEqual([]);
console.log(
  `${findings.length} viewport/locale/theme/view checks passed; command keyboard flows passed; no page errors.`,
);
