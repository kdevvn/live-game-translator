import { effectiveModel, hasProviderAccess } from './modelSettings';
import type { Dialogue, SessionSnapshot } from './types';
import { isTranslatableText } from './ocrFilter';

/** Chọn đúng câu có chữ đang stream hoặc đã dịch mới nhất, bỏ câu chưa có bản nháp. */
function latestOverlayDialogue(dialogues: Dialogue[]): Dialogue | undefined {
  return dialogues
    .filter((d) => (d.status === 'translated' || d.status === 'pending') && d.translation)
    .at(-1);
}

/** Dùng OCR khi thiếu cấu hình; khi dịch ưu tiên bản nháp streaming hoặc câu hoàn tất mới nhất. */
export function getOverlayText(
  snapshot: Pick<SessionSnapshot, 'hasApiKey' | 'settings' | 'ocrText' | 'dialogues'>,
): string {
  if (
    !hasProviderAccess(snapshot.settings, snapshot.hasApiKey) ||
    !effectiveModel(snapshot.settings)
  )
    return isTranslatableText(snapshot.ocrText) ? snapshot.ocrText.trim() : '';
  return latestOverlayDialogue(snapshot.dialogues)?.translation ?? '';
}

/** Lấy tên đã xác định của đúng caption còn hiển thị; không gán tên cho OCR hoặc bản nháp khác. */
export function getOverlaySpeaker(
  snapshot: Pick<SessionSnapshot, 'hasApiKey' | 'settings' | 'dialogues' | 'overlayText'>,
): string {
  if (
    !snapshot.overlayText ||
    !hasProviderAccess(snapshot.settings, snapshot.hasApiKey) ||
    !effectiveModel(snapshot.settings)
  )
    return '';
  const dialogue = latestOverlayDialogue(snapshot.dialogues);
  if (dialogue?.translation !== snapshot.overlayText) return '';
  const speaker = dialogue.speaker.trim();
  return speaker.toLowerCase() === 'unknown' ? '' : speaker;
}

/** Chế độ toàn màn hình luôn hiện nền, kể cả khi không có phụ đề. */
export function shouldShowOverlay(
  snapshot: Pick<SessionSnapshot, 'settings' | 'overlayEditing' | 'overlayText'>,
): boolean {
  return (
    snapshot.settings.overlayFullscreen || snapshot.overlayEditing || Boolean(snapshot.overlayText)
  );
}
