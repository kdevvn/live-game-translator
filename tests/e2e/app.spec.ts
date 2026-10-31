import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let app: ElectronApplication;
let page: Page;
let dataDir: string;

/** Preview giữ chi tiết nguồn tới Full HD và đúng tỷ lệ, kể cả khi khung UI nhỏ. */
async function expectPreviewSize(sourceWidth: number, sourceHeight: number): Promise<void> {
  await expect
    .poll(
      () =>
        page.locator('.preview video').evaluate(
          (element, source) => {
            const video = element as HTMLVideoElement;
            const bounds = video.getBoundingClientRect();
            const target = Math.min(source.width, 1920, (1080 * source.width) / source.height);
            return {
              matchesSize: Math.abs(video.videoWidth - target) <= 4,
              matchesSourceRatio:
                Math.abs(video.videoWidth / video.videoHeight - source.width / source.height) <
                0.01,
              matchesBoxRatio:
                Math.abs(bounds.width / bounds.height - source.width / source.height) < 0.01,
            };
          },
          { width: sourceWidth, height: sourceHeight },
        ),
      { timeout: 15000 },
    )
    .toEqual({
      matchesSize: true,
      matchesSourceRatio: true,
      matchesBoxRatio: true,
    });
}

/** Cùng một bộ test cho bản build và bản Windows đã đóng gói, dùng dữ liệu tạm. */
function launch(): Promise<ElectronApplication> {
  const executablePath = process.env.TRANSLATE_GAME_EXECUTABLE;
  return electron.launch({
    executablePath,
    args: executablePath ? [] : ['.'],
    env: { ...process.env, TRANSLATE_GAME_DATA_DIR: dataDir },
  });
}

test.beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'translate-game-e2e-'));
  app = await launch();
  await expect.poll(() => app.windows().some((p) => p.url().includes('role=main'))).toBe(true);
  const found = app.windows().find((p) => p.url().includes('role=main'));
  if (!found) throw new Error('Không có cửa sổ chính');
  page = found;
  await expect(page.getByRole('heading', { name: 'Dịch cửa sổ', exact: true })).toBeVisible();
  // Phiên người dùng có thể đang giữ phím tắt mặc định; test chỉ dùng tổ hợp riêng.
  const configured = await page.evaluate(async () => {
    const state = await window.app.snapshot();
    if (!state.ok) return state;
    return window.app.settings({
      ...state.value.settings,
      translateShortcut: 'Ctrl+Alt+Shift+F11',
      pauseShortcut: 'Ctrl+Alt+Shift+F12',
    });
  });
  expect(configured.ok).toBe(true);
});
test.afterAll(async () => {
  if (app) await app.close();
  // Chromium có thể nhả khóa file cache trễ hơn lúc Electron báo đã đóng trên Windows.
  if (dataDir) await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('preview vừa chọn cửa sổ cập nhật hình trực tiếp trước khi bắt đầu theo dõi', async () => {
  await page.getByRole('button', { name: 'Mở nguồn thử', exact: true }).click();
  await expect.poll(() => app.windows().some((p) => p.url().includes('role=test'))).toBe(true);
  await app.evaluate(({ BrowserWindow }) => {
    const source = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes('role=test'),
    );
    source?.setBounds({ width: 1280, height: 720 });
  });
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  const select = page.getByLabel('Chọn cửa sổ ứng dụng');
  const option = select.locator('option').filter({ hasText: 'Live Game Translator - Test source' });
  await expect(option).toHaveCount(1);
  const id = await option.getAttribute('value');
  if (!id) throw new Error('Không tìm thấy nguồn thử');
  const source = app.windows().find((page) => page.url().includes('role=test'));
  if (!source) throw new Error('Thiếu cửa sổ nguồn thử');
  await source.evaluate(() => {
    const marker = document.createElement('div');
    marker.id = 'live-preview-marker';
    Object.assign(marker.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgb(255, 0, 0)',
      zIndex: '9999',
    });
    document.body.append(marker);
  });
  await select.selectOption(id);
  const video = page.locator('.preview video');
  await expect(video).toBeVisible();
  await expect
    .poll(() =>
      video.evaluate((element) => {
        const video = element as HTMLVideoElement;
        const target = Math.min(1280, Math.ceil(video.clientWidth * window.devicePixelRatio));
        return video.videoWidth >= target;
      }),
    )
    .toBe(true);
  /** Đọc pixel giữa video để chứng minh ảnh nguồn thay đổi đã đến UI qua stream. */
  async function centerColor(): Promise<'red' | 'green' | 'other'> {
    return video.evaluate((element) => {
      const video = element as HTMLVideoElement;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context || !video.videoWidth) return 'other';
      context.drawImage(video, video.videoWidth / 2, video.videoHeight / 2, 1, 1, 0, 0, 1, 1);
      const [r, g] = context.getImageData(0, 0, 1, 1).data;
      return r > 200 && g < 50 ? 'red' : g > 200 && r < 50 ? 'green' : 'other';
    });
  }
  await expect.poll(centerColor).toBe('red');
  await source.evaluate(() => {
    const marker = document.getElementById('live-preview-marker');
    if (marker) marker.style.background = 'rgb(0, 255, 0)';
  });
  await expect.poll(centerColor).toBe('green');
  await expect(page.locator('.preview img')).toHaveCount(0);
  const state = await page.evaluate(() => window.app.snapshot());
  expect(state.ok && state.value.status).toBe('idle');
  await page.locator('.preview').screenshot({ path: 'test-results/preview-before-watching.png' });
  await page.getByRole('button', { name: 'Dừng', exact: true }).click();
  await expect(video).toHaveCount(0);
  await expect
    .poll(() =>
      app.evaluate(async ({ BrowserWindow }) => {
        const capture = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('role=capture'),
        );
        return capture?.webContents.executeJavaScript(
          'document.querySelector("video").srcObject === null',
        );
      }),
    )
    .toBe(true);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((win) => win.webContents.getURL().includes('role=test'))
      ?.close();
  });
});

test('titlebar tích hợp Windows và bảng lệnh dùng được bằng bàn phím', async () => {
  const area = await page.evaluate(() => {
    const overlay = Reflect.get(navigator, 'windowControlsOverlay') as {
      visible: boolean;
      getTitlebarAreaRect(): DOMRect;
    };
    return { visible: overlay.visible, height: overlay.getTitlebarAreaRect().height };
  });
  expect(area.visible).toBe(true);
  expect(area.height).toBeGreaterThan(0);
  const trigger = page.getByRole('button', { name: 'Mở bảng lệnh' });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Control+k');
  await dialog.getByRole('combobox').fill('Cài đặt');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Cài đặt', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-shell-dark.png' });
});

test('overlay thường chỉ tô nền quanh nội dung, tự xuống dòng và co lại với câu ngắn', async () => {
  const overlay = app.windows().find((p) => p.url().includes('role=overlay'));
  if (!overlay) throw new Error('Thiếu overlay');
  await page.evaluate(() => window.app.overlay(true));
  try {
    for (const locale of ['vi', 'en'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await page.evaluate(
          async ({ locale, theme }) => {
            const state = await window.app.snapshot();
            if (state.ok) await window.app.settings({ ...state.value.settings, locale, theme });
          },
          { locale, theme },
        );
        await expect(overlay.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(overlay.locator('html')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(overlay.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        // Chỉ thay text trong DOM để kiểm tra layout thật, không gọi OCR hoặc API dịch.
        const caption = overlay.locator('.overlay-caption');
        const text = caption.locator('p');
        await text.evaluate((element) => {
          element.textContent = 'Đội bay 7 >';
        });
        const shortHeight = await caption.evaluate(
          (element) => element.getBoundingClientRect().height,
        );
        await text.evaluate((element) => {
          element.textContent =
            'Chúng ta phải rời khỏi khu vực này ngay trước khi đội tuần tra quay lại. '.repeat(3);
        });
        const longHeight = await caption.evaluate(
          (element) => element.getBoundingClientRect().height,
        );
        expect(longHeight).toBeGreaterThan(shortHeight);
        await text.evaluate((element) => {
          element.textContent = 'Đội bay 7 >';
        });
        expect(await caption.evaluate((element) => element.getBoundingClientRect().height)).toBe(
          shortHeight,
        );
        await overlay.screenshot({ path: `test-results/overlay-wrap-${locale}-${theme}.png` });
      }
    }
  } finally {
    await page.evaluate(async () => {
      await window.app.overlay(false);
      const state = await window.app.snapshot();
      if (state.ok)
        await window.app.settings({ ...state.value.settings, locale: 'vi', theme: 'dark' });
    });
  }
});

test('overlay toàn màn hình giữ vị trí cũ và cỡ chữ riêng', async () => {
  const original = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('role=overlay'),
    )!;
    const bounds = win.getBounds();
    return { bounds, display: screen.getDisplayMatching(bounds).bounds };
  });
  const result = await page.evaluate(async () => {
    const state = await window.app.snapshot();
    if (!state.ok) return state;
    return window.app.settings({
      ...state.value.settings,
      overlayFullscreen: true,
      overlayFullscreenFontSize: 48,
    });
  });
  expect(result.ok).toBe(true);
  const overlay = app.windows().find((p) => p.url().includes('role=overlay'))!;
  await expect(overlay.locator('.overlay-fullscreen .overlay-caption')).toHaveCSS(
    'font-size',
    '48px',
  );
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('role=overlay'))!
        .getBounds(),
    ),
  ).toEqual(original.display);
  expect(await page.evaluate(() => window.app.overlay(true))).toEqual({
    ok: true,
    value: undefined,
  });
  const reset = await page.evaluate(async () => {
    const state = await window.app.snapshot();
    if (!state.ok) return state;
    return window.app.settings({ ...state.value.settings, overlayFullscreen: false });
  });
  expect(reset.ok).toBe(true);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('role=overlay'))!
        .getBounds(),
    ),
  ).toEqual(original.bounds);
});

test('lưu theme/locale và đồng bộ overlay', async () => {
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  await page.getByLabel('Chủ đề', { exact: true }).selectOption('dark');
  await page.getByLabel('Ngôn ngữ giao diện').selectOption('en');
  await page.getByLabel('Ngưỡng bỏ qua câu tương tự (%)', { exact: true }).fill('95');
  await page.getByLabel('Thời gian hiển thị (giây)', { exact: true }).fill('8');
  await expect
    .poll(async () => {
      const state = await page.evaluate(() => window.app.snapshot());
      return state.ok ? state.value.settings.overlayDurationSeconds : 0;
    })
    .toBe(8);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const overlay = app.windows().find((p) => p.url().includes('role=overlay'));
  expect(overlay).toBeDefined();
  if (overlay) {
    await expect(overlay.locator('html')).toHaveAttribute('lang', 'en');
    await expect(overlay.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
  const result = await page.evaluate(() => window.app.snapshot());
  expect(result.ok && result.value.settings.model).toBe('');
  expect(result.ok && result.value.settings.duplicateThreshold).toBe(95);
  expect(result.ok && result.value.settings.overlayDurationSeconds).toBe(8);
  expect(result.ok && result.value).not.toHaveProperty('apiKey');
  await page.screenshot({ path: 'test-results/main-dark-en.png', fullPage: true });
});

test('khởi động lại giữ theme/locale và không tự bật capture', async () => {
  await app.close();
  app = await launch();
  await expect.poll(() => app.windows().some((p) => p.url().includes('role=main'))).toBe(true);
  const found = app.windows().find((p) => p.url().includes('role=main'));
  if (!found) throw new Error('Thiếu cửa sổ chính');
  page = found;
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const result = await page.evaluate(() => window.app.snapshot());
  expect(result.ok && result.value.status).toBe('idle');
  expect(result.ok && result.value.settings.duplicateThreshold).toBe(95);
  expect(result.ok && result.value.settings.overlayDurationSeconds).toBe(8);
});

test('capture nguồn thử qua Electron thật và OCR offline', async () => {
  await app.context().route(/^https?:\/\//, (route) => route.abort());
  await page.getByRole('button', { name: 'Translate window', exact: true }).click();
  await page.getByRole('button', { name: 'Open test source' }).click();
  await expect.poll(() => app.windows().some((p) => p.url().includes('role=test'))).toBe(true);
  console.log(
    'Test source bounds:',
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('role=test'),
      );
      win?.setContentSize(1920, 1080);
      win?.webContents.setBackgroundThrottling(false);
      return win?.getContentBounds();
    }),
  );
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const select = page.getByLabel('Choose an application window');
  await expect(
    select.locator('option').filter({ hasText: 'Live Game Translator - Test source' }),
  ).toHaveCount(1);
  const id = await select
    .locator('option')
    .filter({ hasText: 'Live Game Translator - Test source' })
    .getAttribute('value');
  if (!id) throw new Error('Không tìm thấy nguồn thử');
  await select.selectOption(id);
  const overlay = app.windows().find((p) => p.url().includes('role=overlay'));
  if (!overlay) throw new Error('Thiếu overlay');
  await page.getByRole('button', { name: 'Adjust subtitle overlay', exact: true }).click();
  await expect(overlay.locator('.overlay-caption')).toHaveClass(/editing/);
  await expect(overlay.locator('.overlay-caption p')).toBeEmpty();
  await overlay.screenshot({ path: 'test-results/overlay-empty.png' });
  await overlay.getByRole('button', { name: 'Lock subtitle position', exact: true }).click();
  await page.getByRole('button', { name: 'Start watching' }).click();
  await expect(page.locator('.recognized')).not.toContainText('Text from the selected region', {
    timeout: 40000,
  });
  await expect(page.locator('.recognized')).toContainText(/[A-Za-z]{3}/);
  console.log(
    'Preview startup:',
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('role=capture'),
      );
      return win?.webContents.executeJavaScript(
        `JSON.stringify({width:document.querySelector('video').videoWidth,height:document.querySelector('video').videoHeight,settings:document.querySelector('video').srcObject.getVideoTracks()[0].getSettings()})`,
      );
    }),
  );
  await expectPreviewSize(1920, 1080);
  await page.locator('.preview').screenshot({ path: 'test-results/preview-fit-16-9.png' });
  const recognized = await page.locator('.recognized').innerText();
  await expect(overlay.locator('.overlay-caption p')).toHaveText(recognized);
  const ocrState = await page.evaluate(() => window.app.snapshot());
  expect(ocrState.ok && ocrState.value.hasApiKey).toBe(false);
  expect(ocrState.ok && ocrState.value.dialogues).toEqual([]);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes('role=overlay'))
        ?.isVisible(),
    ),
  ).toBe(true);
  if (!ocrState.ok) throw new Error('Không đọc được cấu hình kiểm tra');
  await page.evaluate(() => window.app.overlay(true));
  for (const locale of ['vi', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(
        async ({ locale, theme }) => {
          const state = await window.app.snapshot();
          if (state.ok) await window.app.settings({ ...state.value.settings, locale, theme });
        },
        { locale, theme },
      );
      await expect(overlay.locator('html')).toHaveAttribute('lang', locale);
      await expect(overlay.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(overlay.locator('.overlay-caption p')).toContainText(/[A-Za-z]{3}/);
      await overlay.screenshot({ path: `test-results/overlay-ocr-${locale}-${theme}.png` });
      await page
        .locator('.preview')
        .screenshot({ path: `test-results/preview-${locale}-${theme}.png` });
    }
  }
  await page.evaluate((settings) => window.app.settings(settings), ocrState.value.settings);
  await page.evaluate(() => window.app.overlay(false));
  await page.evaluate(async () => {
    const result = await window.app.snapshot();
    if (result.ok)
      await window.app.settings({ ...result.value.settings, overlayDurationSeconds: 1 });
  });
  await expect(overlay.locator('.overlay-caption p')).toBeEmpty({ timeout: 3000 });
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('role=overlay'))
        ?.isVisible(),
    ),
  ).toBe(false);
  const source = app.windows().find((p) => p.url().includes('role=test'));
  if (!source) throw new Error('Thiếu nguồn thử');
  const nativeSize = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('role=test'),
    );
    if (!win) throw new Error('Thiếu nguồn thử');
    const bounds = win.getContentBounds();
    return {
      width: bounds.width,
      height: bounds.height,
      scale: screen.getDisplayMatching(bounds).scaleFactor,
    };
  });
  await source.evaluate(() => {
    const marker = document.createElement('div');
    marker.id = 'fps-test-marker';
    marker.style.cssText = 'position:fixed;top:0;left:0;width:20px;height:20px;z-index:9999';
    document.body.append(marker);
    marker.animate([{ backgroundColor: 'red' }, { backgroundColor: 'blue' }], {
      duration: 100,
      iterations: Infinity,
    });
  });
  const capture = app.windows().find((p) => p.url().includes('role=capture'));
  if (!capture) throw new Error('Thiếu cửa sổ capture');
  const previewMeasurement = page.locator('.preview video').evaluate(async (element) => {
    const video = element as HTMLVideoElement;
    const first = video.getVideoPlaybackQuality();
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const last = video.getVideoPlaybackQuality();
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      decodedFps:
        ((last.totalVideoFrames - first.totalVideoFrames) * 1000) / (performance.now() - started),
      droppedFrames: last.droppedVideoFrames - first.droppedVideoFrames,
    };
  });
  const metadata = await capture.evaluate(async () => {
    const video = document.querySelector('video');
    if (!video || !(video.srcObject instanceof MediaStream)) throw new Error('Thiếu stream');
    const track = video.srcObject.getVideoTracks()[0].clone();
    const settings = track.getSettings();
    // Chromium có API đọc frame của stream; bộ đếm video compositor có thể đứng khi cửa sổ ẩn.
    const Processor = Reflect.get(window, 'MediaStreamTrackProcessor') as new (options: {
      track: MediaStreamTrack;
    }) => { readable: ReadableStream<{ close(): void }> };
    const reader = new Processor({ track }).readable.getReader();
    const started = performance.now();
    let frames = 0;
    const timer = window.setTimeout(() => {
      void reader.cancel();
    }, 1000);
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        frames++;
        value.close();
      }
    } finally {
      window.clearTimeout(timer);
      reader.releaseLock();
      track.stop();
    }
    const elapsedMs = performance.now() - started;
    return {
      frameRate: settings.frameRate,
      width: video.videoWidth,
      height: video.videoHeight,
      trackWidth: settings.width,
      trackHeight: settings.height,
      resizeMode: Reflect.get(settings, 'resizeMode'),
      frames,
      elapsedMs,
      measuredFps: (frames * 1000) / elapsedMs,
    };
  });
  await source.evaluate(() => document.getElementById('fps-test-marker')?.remove());
  const previewMetadata = await previewMeasurement;
  console.log('Preview metadata:', JSON.stringify(previewMetadata));
  expect(previewMetadata.decodedFps).toBeGreaterThan(0);
  console.log('Native capture metadata:', JSON.stringify({ ...metadata, nativeSize }));
  expect(metadata.frames).toBeGreaterThan(0);
  expect(metadata.width).toBeDefined();
  expect(metadata.height).toBeDefined();
  expect(Math.abs((metadata.width ?? 0) - nativeSize.width * nativeSize.scale)).toBeLessThan(
    32 * nativeSize.scale,
  );
  expect(Math.abs((metadata.height ?? 0) - nativeSize.height * nativeSize.scale)).toBeLessThan(
    32 * nativeSize.scale,
  );
  console.log('Capture metadata:', JSON.stringify(metadata));
  await test.info().attach('capture-metadata', {
    body: JSON.stringify({ capture: metadata, preview: previewMetadata }, null, 2),
    contentType: 'application/json',
  });
  const resized = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('role=test'),
    );
    if (!win) throw new Error('Thiếu nguồn thử');
    win.setContentSize(960, 600);
    return win.getContentBounds();
  });
  await expect
    .poll(() =>
      capture.evaluate(() => {
        const video = document.querySelector('video');
        return { width: video?.videoWidth ?? 0, height: video?.videoHeight ?? 0 };
      }),
    )
    .toEqual({
      width: Math.round(resized.width * nativeSize.scale),
      height: Math.round(resized.height * nativeSize.scale),
    });
  await expectPreviewSize(resized.width * nativeSize.scale, resized.height * nativeSize.scale);
  await page.locator('.preview').screenshot({ path: 'test-results/preview-fit-16-10.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Translate window', exact: true }).click();
  await expectPreviewSize(resized.width * nativeSize.scale, resized.height * nativeSize.scale);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((win) => win.webContents.getURL().includes('role=main'))
      ?.setContentSize(1600, 950);
  });
  await expectPreviewSize(resized.width * nativeSize.scale, resized.height * nativeSize.scale);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect
    .poll(() => capture.evaluate(() => document.querySelector('video')?.srcObject === null))
    .toBe(true);
  await expect(overlay.locator('.overlay-caption p')).toBeEmpty();
  const result = await page.evaluate(() => window.app.snapshot());
  expect(result.ok && result.value.status).toBe('idle');
});

test('key không quay về renderer và hồ sơ lưu được qua IPC thật', async () => {
  const keyResult = await page.evaluate(() => window.app.saveKey('test-only-not-a-real-key'));
  expect(keyResult.ok).toBe(true);
  const state = await page.evaluate(() => window.app.snapshot());
  expect(state.ok && state.value.hasApiKey).toBe(true);
  expect(JSON.stringify(state)).not.toContain('test-only-not-a-real-key');
  const profile = {
    id: 'test-profile',
    name: 'The Northern Gate',
    instructions: 'Cha xưng ta, gọi con.',
    characters: [],
    relationships: [{ speaker: 'Father', listener: 'Son', self: 'ta', address: 'con' }],
    glossary: [{ source: 'Northern Gate', target: 'Cổng Bắc' }],
    revision: 0,
  };
  const saved = await page.evaluate((value) => window.app.saveProfile(value), profile);
  expect(saved.ok).toBe(true);
  const after = await page.evaluate(() => window.app.snapshot());
  expect(
    after.ok && after.value.profiles.find((p) => p.id === 'test-profile')?.relationships[0].address,
  ).toBe('con');
  await page.evaluate(() => window.app.deleteProfile('test-profile'));
  await page.evaluate(() => window.app.saveKey(''));
});
