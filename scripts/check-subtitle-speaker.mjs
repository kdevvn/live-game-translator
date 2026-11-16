import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const folder = '.taste-skill/after/subtitle-speaker';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = [];
try {
  for (const locale of ['vi', 'en'])
    for (const theme of ['light', 'dark'])
      for (const width of [1440, 768, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 600 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(
          `http://127.0.0.1:4173?role=overlay&stream=1&speaker=Dutch&locale=${locale}&theme=${theme}`,
        );
        const caption = page.locator('.overlay-caption p');
        await expect(caption).toHaveText('Dutch Cha ơi, chúng ta phải rời đi');
        expect((await page.evaluate(() => window.app.snapshot())).value.dialogues[0].status).toBe(
          'pending',
        );
        await page.evaluate(() => document.fonts.ready);
        for (const fullscreen of [false, true]) {
          await page.evaluate(async (value) => {
            const current = await window.app.snapshot();
            await window.app.settings({ ...current.value.settings, overlayFullscreen: value });
          }, fullscreen);
          const colors = await caption.evaluate((element) => {
            const view = element.ownerDocument.defaultView;
            const name = element.querySelector('.subtitle-speaker');
            const firstWord = [...element.childNodes].find(
              (node) => node.nodeType === 3 && node.textContent.trim(),
            );
            const range = element.ownerDocument.createRange();
            const offset = firstWord.textContent.search(/\S/);
            range.setStart(firstWord, offset);
            range.setEnd(firstWord, offset + 1);
            const canvas = element.ownerDocument.createElement('canvas');
            const context = canvas.getContext('2d');
            const channels = [name, element].map((node) => {
              context.fillStyle = view.getComputedStyle(node).color;
              context.fillRect(0, 0, 1, 1);
              return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
            });
            return {
              name: channels[0],
              text: channels[1],
              inline: view.getComputedStyle(name).display === 'inline',
              gap: range.getBoundingClientRect().left - name.getBoundingClientRect().right,
              fontSize: Number.parseFloat(view.getComputedStyle(element).fontSize),
            };
          });
          expect(colors.inline).toBe(true);
          expect(colors.name.every((channel, index) => channel < colors.text[index])).toBe(true);
          expect(Math.max(...colors.name)).toBeLessThan(180);
          expect(colors.gap).toBeGreaterThan(colors.fontSize * 0.35);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
          ).toBe(false);
          await page
            .locator('.overlay-caption')
            .screenshot({ path: `${folder}/${locale}-${theme}-${width}-${fullscreen}.png` });
          report.push({ locale, theme, width, fullscreen, colors });
        }
        expect(errors).toEqual([]);
        await page.close();
      }
} finally {
  await browser.close();
}
await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
console.log(
  `Đạt ${report.length} trường hợp tên đầu câu, màu tối hơn lời thoại, không tràn ngang.`,
);
