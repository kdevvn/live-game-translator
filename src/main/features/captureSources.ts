import { desktopCapturer } from 'electron';
import type { CaptureSource } from '../../shared/types';

/** Liệt kê cửa sổ ngoài ứng dụng mà không chụp ảnh; preview dùng stream trực tiếp. */
export async function listCaptureSources(ownIds: ReadonlySet<string>): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 0, height: 0 },
  });
  return sources
    .filter((source) => !ownIds.has(source.id))
    .map((source) => ({
      id: source.id,
      name: source.name,
    }));
}
