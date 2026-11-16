import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const folder = '.taste-skill/after/speaker-display';
const modes = ['inline', 'separateLine', 'none'];
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = [];
try {
  for (const locale of ['vi', 'en']) {
    const strings = JSON.parse(await readFile(`src/renderer/i18n/${locale}.json`, 'utf8'));
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 768, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`http://127.0.0.1:4173?locale=${locale}&theme=${theme}`);
        await page.getByRole('navigation').getByRole('button').nth(1).click();
        await page.evaluate(() => document.fonts.ready);
        const select = page.getByRole('combobox', { name: strings.context.speakerDisplay });
        await expect(select).toHaveValue('inline');
        for (const mode of modes) {
          await select.selectOption(mode);
          await expect(select).toHaveAccessibleDescription(strings.context.speakerHint[mode]);
          const example = page.locator('.whitespace-pre-line');
          await expect(example).toHaveText(strings.context.speakerExample[mode]);
          expect(
            await example.evaluate(
              (element) => element.ownerDocument.defaultView.getComputedStyle(element).whiteSpace,
            ),
          ).toBe('pre-line');
          await select.scrollIntoViewIfNeeded();
          await select.locator('xpath=../..').screenshot({
            path: `${folder}/${locale}-${theme}-${width}-${mode}.png`,
          });
          report.push({ locale, theme, width, mode });
        }
        await select.focus();
        await select.press('Home');
        await select.press('ArrowDown');
        await select.press('Enter');
        await expect(select).toHaveValue('separateLine');
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        ).toBe(false);
        expect(errors).toEqual([]);
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
console.log(`Đã kiểm tra ${report.length} ví dụ kiểu tên, nhãn trợ giúp và bàn phím trên browser.`);
