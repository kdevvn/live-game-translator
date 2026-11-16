import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const folder = '.taste-skill/screens/overlay-duration';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const locale of ['vi', 'en'])
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`http://127.0.0.1:4173?screen=settings&locale=${locale}&theme=${theme}`);
      const duration = page.getByRole('spinbutton', {
        name: locale === 'vi' ? 'Thời gian hiển thị (giây)' : 'Display duration (seconds)',
        exact: true,
      });
      await duration.waitFor();
      await page.evaluate(() => document.fonts.ready);
      if ((await duration.inputValue()) !== '5') throw new Error('Sai thời gian mặc định');
      await duration.fill('8');
      await page
        .getByRole('button', {
          name: locale === 'vi' ? 'Lưu thay đổi' : 'Save changes',
          exact: true,
        })
        .click();
      const saved = await page.evaluate(() => window.app.snapshot());
      if (!saved.ok || saved.value.settings.overlayDurationSeconds !== 8)
        throw new Error('Không lưu thời gian');
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
          throw new Error('Tràn ngang cài đặt');
        await duration
          .locator('xpath=ancestor::section')
          .screenshot({ path: `${folder}/${locale}-${theme}-${width}.png` });
      }
      await page.close();
    }
  console.log('Đạt: thời gian mặc định/lưu 8 giây, vi/en × light/dark, 1440/390 px.');
} finally {
  await browser.close();
}
