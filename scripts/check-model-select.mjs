import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const folder = '.taste-skill/screens/model-select';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const locale of ['vi', 'en']) {
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 768, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        await page.goto(
          `http://127.0.0.1:4173?screen=settings&models=1&locale=${locale}&theme=${theme}`,
        );
        await page
          .getByRole('button', {
            name: locale === 'vi' ? 'Tải danh sách model' : 'Load model list',
          })
          .click();
        const combo = page.getByRole('combobox', {
          name: locale === 'vi' ? 'Model dịch' : 'Translation model',
        });
        await combo.evaluate((element) => element.scrollIntoView({ block: 'center' }));
        await combo.click();
        const options = page.getByRole('listbox').getByRole('option');
        await expect(options.nth(0)).toContainText('Beta');
        await expect(options.nth(1)).toContainText('Zeta');
        await expect(options.nth(2)).toContainText('Alpha');
        await page.evaluate(() => document.fonts.ready);
        const control = await combo.boundingBox();
        const menu = await page.getByRole('listbox').boundingBox();
        if (!control || !menu) throw new Error('Thiếu dropdown');
        const path = `${folder}/${locale}-${theme}-${width}.png`;
        await page.screenshot({
          path,
          clip: {
            x: control.x - 4,
            y: control.y - 28,
            width: control.width + 8,
            height: menu.y + menu.height - control.y + 32,
          },
        });
        await combo.fill('PREVIEW/ZETA');
        await expect(options).toHaveCount(1);
        await combo.press('Enter');
        await expect(combo).toHaveValue('Zeta');
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await combo.click();
        await combo.fill('không tồn tại');
        await expect(page.getByRole('status')).toHaveText(
          locale === 'vi' ? 'Không tìm thấy model phù hợp.' : 'No matching models found.',
        );
        await combo.press('Escape');
        await expect(combo).toHaveValue('Zeta');
        await combo.click();
        await combo.press('ArrowDown');
        await combo.press('Enter');
        await expect(combo).toHaveValue('Zeta');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflow).toBe(false);
        results.push({ locale, theme, width, path, overflow });
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${folder}/report.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
