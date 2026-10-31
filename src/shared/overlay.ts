import { effectiveModel, hasProviderAccess } from './modelSettings';
import type { SessionSnapshot } from './types';
import { isTranslatableText } from './ocrFilter';

/** Dùng OCR khi thiếu cấu hình; khi dịch ưu tiên bản nháp streaming hoặc câu hoàn tất mới nhất. */
export function getOverlayText(
  snapshot: Pick<SessionSnapshot, 'hasApiKey' | 'settings' | 'ocrText' | 'dialogues'>,
): string {
  if (
    !hasProviderAccess(snapshot.settings, snapshot.hasApiKey) ||
    !effectiveModel(snapshot.settings)
  )
    return isTranslatableText(snapshot.ocrText) ? snapshot.ocrText.trim() : '';
  return (
    snapshot.dialogues
      .filter((d) => (d.status === 'translated' || d.status === 'pending') && d.translation)
      .at(-1)?.translation ?? ''
  );
}

/** Chế độ toàn màn hình luôn hiện nền, kể cả khi không có phụ đề. */
export function shouldShowOverlay(
  snapshot: Pick<SessionSnapshot, 'settings' | 'overlayEditing' | 'overlayText'>,
): boolean {
  return (
    snapshot.settings.overlayFullscreen || snapshot.overlayEditing || Boolean(snapshot.overlayText)
  );
}
