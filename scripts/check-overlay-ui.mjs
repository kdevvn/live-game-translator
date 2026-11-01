import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

const folder = '.taste-skill/screens/overlay-controls';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const locale of ['vi', 'en'])
    for (const theme of ['light', 'dark']) {
      const labels = JSON.parse(await readFile(`src/renderer/i18n/${locale}.json`, 'utf8'));
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:4173?locale=${locale}&theme=${theme}`);
      const panel = page.locator('.overlay-settings');
      const duration = panel.getByRole('spinbutton', {
        name: labels.settings.overlayDuration,
        exact: true,
      });
      await expect(duration).toHaveValue('5');
      await page.evaluate(() => document.fonts.ready);
      await duration.fill('8');
      await expect
        .poll(async () => {
          const saved = await page.evaluate(() => window.app.snapshot());
          return saved.ok && saved.value.settings.overlayDurationSeconds;
        })
        .toBe(8);
      const floatingSize = panel.getByRole('spinbutton', {
        name: labels.settings.fontSize,
        exact: true,
      });
      const fullscreenSize = panel.getByRole('spinbutton', {
        name: labels.settings.fullscreenFontSize,
        exact: true,
      });
      await floatingSize.fill('36');
      await expect(panel.locator('.subtitle-preview')).toHaveCSS('font-size', '36px');
      await panel.getByRole('checkbox').check();
      await fullscreenSize.fill('44');
      await expect(panel.locator('.subtitle-preview')).toHaveCSS('font-size', '44px');
      await panel.getByRole('checkbox').uncheck();
      await expect(panel.locator('.subtitle-preview')).toHaveCSS('font-size', '36px');
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
          throw new Error('Tràn ngang màn hình dịch');
        await panel.screenshot({ path: `${folder}/${locale}-${theme}-${width}.png` });
      }
      await page
        .getByRole('navigation')
        .getByRole('button', {
          name: labels.settings.title,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole('heading', {
          name: labels.settings.overlay,
          exact: true,
        }),
      ).toHaveCount(0);
      expect(errors).toEqual([]);
      await page.close();
    }
  console.log(
    'Đạt: tự lưu, xem trước hai cỡ chữ, chuyển chế độ, bỏ khỏi Cài đặt; vi/en × light/dark × 1440/768/390 px.',
  );
} finally {
  await browser.close();
}
