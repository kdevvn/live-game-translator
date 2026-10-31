import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Giữ nguyên probe/rule Taste Skill, thay transport CDP đang timeout bằng Playwright.
const skillRoot = process.argv[2];
if (!skillRoot) throw new Error('Truyền đường dẫn thư mục Taste Skill đang cài.');
const { probe, frame, layout, app, colourShare } = await import(
  pathToFileURL(resolve(skillRoot, 'scripts/lib/probe.mjs'))
);
const { judge, judgeLayout, judgeApp, APP_SKIP } = await import(
  pathToFileURL(resolve(skillRoot, 'scripts/lib/rules.mjs'))
);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const folder = '.taste-skill/after/inspection';
await mkdir(folder, { recursive: true });
const report = [];
try {
  const helper = await browser.newPage();
  for (const theme of ['dark', 'light'])
    for (const screen of ['translation', 'context', 'settings'])
      for (const width of [1440, 768, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.goto(`http://127.0.0.1:4173?theme=${theme}`);
        await page
          .getByRole('navigation')
          .getByRole('button')
          .nth(['translation', 'context', 'settings'].indexOf(screen))
          .click();
        await page.evaluate(() => document.fonts.ready);
        const metrics = await page.evaluate(probe);
        const geometry = await page.evaluate(layout);
        const appMetrics = await page.evaluate(app);
        const image = await page.screenshot({ path: `${folder}/${screen}-${theme}-${width}.png` });
        appMetrics.colourShare = await helper.evaluate(
          colourShare,
          `data:image/png;base64,${image.toString('base64')}`,
        );
        const findings = [...judge(metrics, { width }), ...judgeLayout(geometry, { width })].filter(
          (finding) =>
            !APP_SKIP.has(finding.id) && finding.id !== 'no-title' && finding.id !== 'small-title',
        );
        findings.push(...judgeApp(appMetrics, metrics, { width }));
        const frames = [await page.evaluate(frame)];
        const scroll = await page
          .locator('.main-frame')
          .evaluate((element) => ({ height: element.clientHeight, total: element.scrollHeight }));
        for (let y = scroll.height; y < scroll.total; y += scroll.height) {
          await page.locator('.main-frame').evaluate((element, top) => {
            element.scrollTop = top;
          }, y);
          frames.push(await page.evaluate(frame));
        }
        report.push({ screen, theme, width, findings, frames, metrics: appMetrics });
        console.log(
          `${screen}/${theme}/${width}: ${findings.map((f) => `${f.level} ${f.id}: ${f.message}`).join('; ') || 'PASS'}`,
        );
        await page.close();
      }
} finally {
  await browser.close();
}
await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
if (report.some((view) => view.findings.some((finding) => finding.level === 'FAIL')))
  process.exitCode = 1;
