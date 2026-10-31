import { expect, it, vi } from 'vitest';

const getSources = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ desktopCapturer: { getSources } }));
import { listCaptureSources } from './captureSources';

it('danh sách nguồn chỉ trả cửa sổ ngoài ứng dụng, không chụp hoặc gửi ảnh qua IPC', async () => {
  const ownThumbnail = vi.fn();
  const thumbnail = 'data:image/png;base64,full-resolution-window';
  getSources.mockResolvedValue([
    { id: 'window:1:0', name: 'Live Game Translator', thumbnail: { toDataURL: ownThumbnail } },
    { id: 'window:2:0', name: 'Game', thumbnail: { toDataURL: () => thumbnail } },
  ]);

  const sources = await listCaptureSources(new Set(['window:1:0']));

  expect(sources).toEqual([{ id: 'window:2:0', name: 'Game' }]);
  expect(ownThumbnail).not.toHaveBeenCalled();
  expect(getSources).toHaveBeenCalledWith({
    types: ['window'],
    thumbnailSize: { width: 0, height: 0 },
  });
});
