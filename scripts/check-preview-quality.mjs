import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const folder = `.taste-skill/after/preview-quality/${baseline ? 'before' : 'after'}`;
const DISPLAY_WIDTH = 840;
const CASES = [
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
  { width: 1600, height: 1200 },
  { width: 640, height: 360 },
  { width: 1080, height: 1920 },
];
await mkdir(folder, { recursive: true });
// Chạy đúng module preview.ts sản phẩm, không thay đầu gửi bằng bridge giả lập.
const server = await createServer({
  configFile: false,
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'preview-quality-harness',
      configureServer(server) {
        server.middlewares.use('/quality', (_request, response) => {
          response.setHeader('Content-Type', 'text/html');
          response.end('<!doctype html><title>Preview quality check</title>');
        });
      },
    },
  ],
});
await server.listen();
const origin = server.resolvedUrls.local[0];
// Chỉ browser thử dùng loopback vì môi trường headless không phân giải ICE mDNS.
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'],
});
const findings = [];
const errors = [];
try {
  for (const source of CASES) {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}quality`);
    await page.evaluate(
      async ({ source, displayWidth }) => {
        const { createPreviewPeer } = await import('/src/renderer/features/capture/preview.ts');
        const peers = [];
        const NativePeer = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends NativePeer {
          constructor(options) {
            super(options);
            peers.push(this);
          }
        };
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.style.width = `${displayWidth}px`;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, source.width, source.height);
        for (let row = 0; row < Math.floor(source.height / 28); row++) {
          const y = 30 + row * 28;
          context.fillStyle = row % 2 ? '#222222' : '#565656';
          context.font = `${12 + (row % 4) * 2}px sans-serif`;
          context.fillText(
            `Tin nhắn ${row + 1}: Cửa sổ trực tiếp, giữ rõ chữ nhỏ. The gate is open. 日本語`,
            20,
            y,
          );
          if (source.width > 1000)
            context.fillText(
              `Reply ${row + 1}: Preview should preserve fine detail 0123456789`,
              800,
              y,
            );
        }
        let frame = 0;
        let animation;
        /** Duy trì chuyển động để test không chỉ đo keyframe của ảnh tĩnh. */
        function draw() {
          context.fillStyle = frame++ % 2 ? '#00aa55' : '#cc3344';
          context.fillRect(source.width - 100, 0, 100, source.height);
          animation = window.requestAnimationFrame(draw);
        }
        draw();
        const video = document.createElement('video');
        video.muted = true;
        video.autoplay = true;
        video.style.width = `${displayWidth}px`;
        document.body.style.cssText =
          'display:flex;gap:24px;align-items:start;background:#ddd;font:16px sans-serif';
        const sourcePane = document.createElement('section');
        const receivedPane = document.createElement('section');
        const sourceLabel = document.createElement('p');
        const receivedLabel = document.createElement('p');
        sourceLabel.textContent = `Nguồn gốc ${source.width}×${source.height}, hiển thị ở ${displayWidth}px`;
        receivedLabel.id = 'received-label';
        receivedLabel.textContent = 'Preview sau mã hóa/giải mã WebRTC';
        sourcePane.append(sourceLabel, canvas);
        receivedPane.append(receivedLabel, video);
        document.body.append(sourcePane, receivedPane);
        const stream = canvas.captureStream(60);
        const sender = createPreviewPeer();
        const receiver = createPreviewPeer((stream) => {
          video.srcObject = stream;
          void video.play();
        });
        const offer = await sender.offer(stream, source.width, source.height);
        await sender.accept(await receiver.answer(offer));
        window.qualityFixture = {
          canvas,
          video,
          peers,
          sender,
          dispose: () => {
            window.cancelAnimationFrame(animation);
            sender.dispose();
            receiver.dispose();
            stream.getTracks().forEach((track) => track.stop());
          },
        };
      },
      { source, displayWidth: DISPLAY_WIDTH },
    );
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.qualityFixture.video.getVideoPlaybackQuality().totalVideoFrames,
          ),
        { timeout: 20000 },
      )
      .toBeGreaterThan(30);
    const result = await page.evaluate(async (displayWidth) => {
      const { canvas, video, peers } = window.qualityFixture;
      const stats = [...(await peers[0].getStats()).values()];
      const outbound = stats.find(
        (entry) => entry.type === 'outbound-rtp' && entry.kind === 'video',
      );
      const codec = stats.find((entry) => entry.id === outbound?.codecId);
      const width = Math.min(displayWidth, canvas.width);
      const height = Math.round((width * canvas.height) / canvas.width);
      const reference = document.createElement('canvas');
      const received = document.createElement('canvas');
      reference.width = received.width = width;
      reference.height = received.height = height;
      const refContext = reference.getContext('2d');
      const receivedContext = received.getContext('2d');
      refContext.drawImage(canvas, 0, 0, width, height);
      receivedContext.drawImage(video, 0, 0, width, height);
      const a = refContext.getImageData(0, 0, width, height).data;
      const b = receivedContext.getImageData(0, 0, width, height).data;
      let error = 0;
      let squaredError = 0;
      let samples = 0;
      for (let y = 10; y < height - 10; y++) {
        for (let x = 10; x < width * 0.7; x++) {
          const index = (y * width + x) * 4;
          if (a[index] > 245) continue;
          const difference = a[index] - b[index];
          error += Math.abs(difference);
          squaredError += difference * difference;
          samples++;
        }
      }
      return {
        decodedWidth: video.videoWidth,
        decodedHeight: video.videoHeight,
        frames: video.getVideoPlaybackQuality().totalVideoFrames,
        textMae: +(error / samples).toFixed(3),
        textPsnrDb: +(10 * Math.log10(255 ** 2 / (squaredError / samples))).toFixed(3),
        codec: codec?.mimeType,
        qualityLimitationReason: outbound?.qualityLimitationReason,
        encodings: peers[0].getSenders()[0].getParameters().encodings,
        referencePng: reference.toDataURL(),
        receivedPng: received.toDataURL(),
      };
    }, DISPLAY_WIDTH);
    const { referencePng, receivedPng, ...measurement } = result;
    const name = `${source.width}x${source.height}`;
    await writeFile(
      `${folder}/${name}-reference.png`,
      Buffer.from(referencePng.split(',')[1], 'base64'),
    );
    await writeFile(
      `${folder}/${name}-received.png`,
      Buffer.from(receivedPng.split(',')[1], 'base64'),
    );
    await page.locator('#received-label').evaluate((label, measurement) => {
      label.textContent = `Preview ${measurement.decodedWidth}×${measurement.decodedHeight} · ${measurement.codec}`;
    }, measurement);
    await page.screenshot({ path: `${folder}/${name}-comparison.png`, fullPage: true });
    findings.push({ source, ...measurement });
    console.log(name, JSON.stringify(measurement));
    expect(measurement.encodings[0].maxFramerate).toBeUndefined();
    await page.evaluate(() => window.qualityFixture.dispose());
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
await writeFile(`${folder}/report.json`, JSON.stringify({ findings, errors }, null, 2));
expect(errors).toEqual([]);
if (!baseline) {
  for (const { source, decodedWidth, decodedHeight } of findings) {
    const scale = Math.max(1, source.width / 1920, source.height / 1080);
    expect(decodedWidth).toBeLessThanOrEqual(1920);
    expect(decodedHeight).toBeLessThanOrEqual(1080);
    expect(Math.abs(decodedWidth - source.width / scale)).toBeLessThanOrEqual(2);
    expect(Math.abs(decodedHeight - source.height / scale)).toBeLessThanOrEqual(2);
  }
  const fullHd = findings.find(({ source }) => source.width === 1920 && source.height === 1080);
  // Kiểm tra pixel chữ thật sau mã hóa/giải mã, không chỉ nhìn kích thước video.
  expect(fullHd.textMae).toBeLessThan(10);
  expect(fullHd.textPsnrDb).toBeGreaterThan(30);
}
