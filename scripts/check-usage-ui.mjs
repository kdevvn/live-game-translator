import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const folder = '.taste-skill/screens/usage';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const locale of ['vi', 'en'])
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`http://127.0.0.1:4173?locale=${locale}&theme=${theme}&stream=1&usage=1`);
      await page.locator('.dialogue').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const tokens = await page.locator('.row-footer').textContent();
      if (!tokens?.includes('preview/actual-subtitle-model:free'))
        throw new Error('Thiếu model thực tế fixture');
      if (!tokens?.includes('420') || !tokens.includes('36'))
        throw new Error('Thiếu token fixture');
      if (!tokens.includes(locale === 'vi' ? '0,00001234' : '0.00001234'))
        throw new Error('Thiếu chi phí USD fixture');
      await page
        .locator('.history')
        .screenshot({ path: `${folder}/history-${locale}-${theme}.png` });
      await page
        .getByRole('button', { name: locale === 'vi' ? 'Cài đặt' : 'Settings', exact: true })
        .click();
      const input = page.getByRole('spinbutton', {
        name: locale === 'vi' ? 'Ngưỡng bỏ qua câu tương tự (%)' : 'Skip similar subtitles at (%)',
        exact: true,
      });
      if ((await input.inputValue()) !== '80') throw new Error('Sai ngưỡng mặc định');
      await input.fill('95');
      await page
        .getByRole('button', {
          name: locale === 'vi' ? 'Lưu thay đổi' : 'Save changes',
          exact: true,
        })
        .click();
      const saved = await page.evaluate(() => window.app.snapshot());
      if (!saved.ok || saved.value.settings.duplicateThreshold !== 95)
        throw new Error('Không lưu ngưỡng');
      await input
        .locator('xpath=ancestor::section')
        .screenshot({ path: `${folder}/settings-${locale}-${theme}.png` });
      await page.setViewportSize({ width: 390, height: 1000 });
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
        throw new Error('Tràn ngang settings');
      await page
        .getByRole('button', {
          name: locale === 'vi' ? 'Dịch cửa sổ' : 'Translate window',
          exact: true,
        })
        .click();
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
        throw new Error('Tràn ngang hội thoại');
      await page.close();
    }
  console.log('Đạt: token, lưu ngưỡng, vi/en × light/dark và không tràn ngang ở 390 px.');
} finally {
  await browser.close();
}
