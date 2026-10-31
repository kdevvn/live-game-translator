import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('resources', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = '#131416';
    context.beginPath();
    context.roundRect(0, 0, 256, 256, 48);
    context.fill();
    context.strokeStyle = '#86c8d5';
    context.lineWidth = 14;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(88, 56);
    context.lineTo(48, 56);
    context.lineTo(48, 200);
    context.lineTo(88, 200);
    context.moveTo(168, 56);
    context.lineTo(208, 56);
    context.lineTo(208, 200);
    context.lineTo(168, 200);
    context.moveTo(88, 108);
    context.lineTo(168, 108);
    context.moveTo(88, 152);
    context.lineTo(144, 152);
    context.stroke();
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const png = Buffer.from(data, 'base64');
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile('resources/icon.ico', Buffer.concat([header, png]));
  await writeFile('resources/icon.png', png);
} finally {
  await browser.close();
}
