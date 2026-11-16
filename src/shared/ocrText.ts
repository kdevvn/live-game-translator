import type { GameProfile } from './types';

/**
 * Ghép lời thoại theo kiểu tên; dòng riêng chỉ giữ ngắt sau dòng tên đầu tiên.
 * Worker chưa biết hồ sơ thì bỏ qua kiểu để giữ bố cục gốc cho main xử lý.
 */
export function normalizeOcrText(
  text: string,
  speakerDisplay?: GameProfile['speakerDisplay'],
): string {
  const lines = text
    .split(/\r\n?|\n/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  if (speakerDisplay === undefined) return lines.join('\n');
  if (speakerDisplay === 'separateLine' && lines.length > 1)
    return `${lines[0]}\n${lines.slice(1).join(' ')}`;
  return lines.join(' ');
}
