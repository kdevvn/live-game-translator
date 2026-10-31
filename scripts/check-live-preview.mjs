import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Dùng canvas + WebRTC thật trong browser; không mở Electron hay capture desktop.
const folder = '.taste-skill/after/live-preview';
await mkdir(folder, { recursive: true });
// Browser thử chạy qua loopback vì môi trường headless này không phân giải mDNS ICE.
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'],
});
const findings = [];
const errors = [];

/** Đọc dấu màu đổi liên tục trong nguồn thử để phân biệt video trực tiếp với ảnh đứng. */
async function markerColor(video) {
  return video.evaluate((video) => {
    if (!video.videoWidth) return 'waiting';
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    context.drawImage(video, video.videoWidth * 0.03, video.videoHeight * 0.03, 1, 1, 0, 0, 1, 1);
    const [red, green] = context.getImageData(0, 0, 1, 1).data;
    return red > 200 && green < 50 ? 'red' : green > 200 && red < 50 ? 'green' : 'other';
  });
}

try {
  for (const locale of ['vi', 'en']) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1.25,
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:4173/?preview=1&locale=${locale}&theme=${theme}`);
      await page.evaluate(() => document.fonts.ready);
      await page
        .getByRole('button', { name: locale === 'vi' ? 'Làm mới' : 'Refresh', exact: true })
        .click();
      const select = page.getByLabel(
        locale === 'vi' ? 'Chọn cửa sổ ứng dụng' : 'Choose an application window',
      );
      await select.selectOption('fixture:1');
      const video = page.locator('.preview video');
      await expect.poll(() => video.evaluate((video) => video.videoWidth)).toBe(1920);
      await expect.poll(() => markerColor(video)).toMatch(/^(red|green)$/);
      const initialColor = await markerColor(video);
      const firstFrames = await video.evaluate(
        (video) => video.getVideoPlaybackQuality().totalVideoFrames,
      );
      await expect.poll(() => markerColor(video)).toBe(initialColor === 'red' ? 'green' : 'red');
      await expect
        .poll(() => video.evaluate((video) => video.getVideoPlaybackQuality().totalVideoFrames))
        .toBeGreaterThan(firstFrames + 3);
      const state = await page.evaluate(() => window.app.snapshot());
      expect(state.value.status).toBe('idle');
      expect(state.value.session).toBeNull();
      expect(state.value.ocrText).toBe('');
      expect(state.value.dialogues).toEqual([]);

      const bounds = await video.boundingBox();
      expect(bounds).not.toBeNull();
      const sourceBounds = await select.boundingBox();
      const controls = await page.locator('.capture-controls').boundingBox();
      const coordinates = await page.locator('.region-details').boundingBox();
      expect(sourceBounds.y + sourceBounds.height).toBeLessThanOrEqual(bounds.y);
      expect(controls.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
      expect(coordinates.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
      expect(Math.abs(bounds.width - sourceBounds.width)).toBeLessThanOrEqual(2);
      expect(bounds.width / bounds.height).toBeCloseTo(1920 / 1080, 3);
      await video.scrollIntoViewIfNeeded();
      const visibleBounds = await video.boundingBox();
      await page.mouse.move(
        visibleBounds.x + visibleBounds.width * 0.2,
        visibleBounds.y + visibleBounds.height * 0.7,
      );
      await page.mouse.down();
      await page.mouse.move(
        visibleBounds.x + visibleBounds.width * 0.8,
        visibleBounds.y + visibleBounds.height * 0.9,
      );
      await page.mouse.up();
      const selection = await page.locator('.selection').evaluate((element) => ({
        x: parseFloat(element.style.left),
        width: parseFloat(element.style.width),
      }));
      expect(selection.x).toBeCloseTo(20, 0);
      expect(selection.width).toBeCloseTo(60, 0);
      await page.screenshot({ path: `${folder}/${locale}-${theme}.png`, fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1600 });
      await page.locator('.main-frame').evaluate((frame) => {
        frame.scrollTop = 0;
      });
      await page.screenshot({ path: `${folder}/layout-${locale}-${theme}.png`, fullPage: true });

      await select.selectOption('fixture:2');
      await expect
        .poll(() => page.evaluate(async () => (await window.app.snapshot()).value.generation))
        .toBeGreaterThan(state.value.generation);
      await expect.poll(() => markerColor(video)).toMatch(/^(red|green)$/);
      await video.evaluate((video) => {
        window.startedPreviewStream = video.srcObject;
        window.startedPreviewFrames = video.getVideoPlaybackQuality().totalVideoFrames;
      });
      await page
        .getByRole('button', {
          name: locale === 'vi' ? 'Bắt đầu theo dõi' : 'Start watching',
          exact: true,
        })
        .click();
      await expect
        .poll(() =>
          video.evaluate(
            (video) =>
              video.getVideoPlaybackQuality().totalVideoFrames - window.startedPreviewFrames,
          ),
        )
        .toBeGreaterThan(5);
      expect(await video.evaluate((video) => video.srcObject === window.startedPreviewStream)).toBe(
        true,
      );

      for (let cycle = 0; cycle < 3; cycle++) {
        for (const name of [
          locale === 'vi' ? 'Tạm dừng' : 'Pause',
          locale === 'vi' ? 'Tiếp tục' : 'Resume',
        ]) {
          const before = await video.evaluate(
            (video) => video.getVideoPlaybackQuality().totalVideoFrames,
          );
          await page.getByRole('button', { name, exact: true }).click();
          await expect
            .poll(() => video.evaluate((video) => video.getVideoPlaybackQuality().totalVideoFrames))
            .toBeGreaterThan(before + 3);
          expect(
            await video.evaluate((video) => video.srcObject === window.startedPreviewStream),
          ).toBe(true);
        }
      }
      await page
        .getByRole('button', { name: locale === 'vi' ? 'Dừng' : 'Stop', exact: true })
        .click();
      await expect(video).toHaveCount(0);
      expect(await select.inputValue()).toBe('');
      findings.push({
        locale,
        theme,
        width: 1920,
        height: 1080,
        sourcePixelsChanged: true,
        idle: true,
        crop: true,
        switchAndStop: true,
        startKeepsVideo: true,
        pauseResumeKeepsVideo: true,
      });
      await page.close();
    }
  }
  for (const shape of ['standard', 'portrait']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:4173/?preview=1&shape=${shape}&locale=vi&theme=dark`);
    await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
    await page.getByLabel('Chọn cửa sổ ứng dụng').selectOption('fixture:1');
    const video = page.locator('.preview video');
    await expect.poll(() => video.evaluate((video) => video.videoHeight)).toBe(1080);
    const dimensions = await video.evaluate((video) => ({
      width: video.getBoundingClientRect().width,
      height: video.getBoundingClientRect().height,
      ratio: video.videoWidth / video.videoHeight,
    }));
    expect(dimensions.width / dimensions.height).toBeCloseTo(dimensions.ratio, 3);
    expect(dimensions.width).toBeLessThanOrEqual(1920);
    expect(dimensions.height).toBeLessThanOrEqual(1080);
    await page.screenshot({ path: `${folder}/${shape}.png`, fullPage: true });
    findings.push({ shape, ...dimensions });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(`${folder}/report.json`, JSON.stringify({ findings, errors }, null, 2));
expect(errors).toEqual([]);
console.log(
  `${findings.length} live preview checks passed: changing pixels, decoded frames, crop, source switch, stop and start without replacing the video stream.`,
);
