import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const folder = '.taste-skill/screens';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const findings = [];
try {
  for (const locale of ['vi', 'en'])
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`http://127.0.0.1:4173?locale=${locale}&theme=${theme}`);
        for (const screen of ['context', 'settings']) {
          const labels = {
            vi: { context: 'Hồ sơ game', settings: 'Cài đặt' },
            en: { context: 'Game profiles', settings: 'Settings' },
          };
          await page.getByRole('button', { name: labels[locale][screen], exact: true }).click();
          await page.evaluate(() => document.fonts.ready);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
          );
          findings.push({ locale, theme, width, screen, overflow });
          await page.screenshot({
            path: `${folder}/${screen}-${locale}-${theme}-${width}.png`,
            fullPage: true,
          });
        }
      }
      await page.close();
    }
} finally {
  await browser.close();
}
await writeFile(`${folder}/report.json`, JSON.stringify(findings, null, 2));
console.log(findings);
if (findings.some((finding) => finding.overflow)) process.exitCode = 1;
