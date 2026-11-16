import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const folder = '.taste-skill/after/checkboxes';
const screens = [
  {
    name: 'translation',
    tab: 0,
    keys: ['settings.overlayFullscreen', 'translation.auto'],
    fields: ['overlayFullscreen', 'autoTranslate'],
  },
  { name: 'context', tab: 1, keys: ['context.aiEnabled'], fields: [] },
  {
    name: 'settings',
    tab: 2,
    keys: ['settings.summaryEnabled', 'settings.overlayFullscreen'],
    fields: ['summaryEnabled', 'overlayFullscreen'],
  },
];
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = [];
try {
  for (const locale of ['vi', 'en']) {
    const strings = JSON.parse(await readFile(`src/renderer/i18n/${locale}.json`, 'utf8'));
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 768, 390]) {
        for (const screen of screens) {
          const page = await browser.newPage({ viewport: { width, height: 1000 } });
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(`http://127.0.0.1:4173?locale=${locale}&theme=${theme}`);
          await page.getByRole('navigation').getByRole('button').nth(screen.tab).click();
          await expect(page.getByRole('checkbox')).toHaveCount(screen.keys.length);
          for (const [index, key] of screen.keys.entries()) {
            const label = key.split('.').reduce((value, part) => value[part], strings);
            const checkbox = page.getByRole('checkbox', { name: label, exact: true });
            await checkbox.scrollIntoViewIfNeeded();
            const geometry = await checkbox.evaluate((element) => {
              const box = element.getBoundingClientRect();
              return { width: box.width, height: box.height };
            });
            expect(geometry).toEqual({ width: 20, height: 20 });
            const field = checkbox.locator(
              'xpath=ancestor::div[contains(@class,"checkbox-field")][1]',
            );
            const prefix = `${folder}/${screen.name}-${index}-${locale}-${theme}-${width}`;
            await expect(checkbox).not.toBeChecked();
            await field.screenshot({ path: `${prefix}-off.png`, animations: 'disabled' });
            await field.locator('label').click();
            await expect(checkbox).toBeChecked();
            if (screen.fields[index])
              await expect
                .poll(() =>
                  page.evaluate(
                    async (field) => (await window.app.snapshot()).value.settings[field],
                    screen.fields[index],
                  ),
                )
                .toBe(true);
            await field.screenshot({ path: `${prefix}-on.png`, animations: 'disabled' });
            await checkbox.focus();
            await checkbox.press('Space');
            await expect(checkbox).not.toBeChecked();
            if (screen.fields[index])
              await expect
                .poll(() =>
                  page.evaluate(
                    async (field) => (await window.app.snapshot()).value.settings[field],
                    screen.fields[index],
                  ),
                )
                .toBe(false);
            report.push({
              screen: screen.name,
              key,
              locale,
              theme,
              width,
              geometry,
              labelClick: true,
              keyboard: true,
            });
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
          ).toBe(false);
          expect(errors).toEqual([]);
          await page.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
console.log(`Đã kiểm tra ${report.length} checkbox trên browser với bridge giả lập.`);
