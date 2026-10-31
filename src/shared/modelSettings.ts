import type { AppSettings } from './types';

/** Lấy model hiệu lực theo nhà cung cấp và tác vụ; tác vụ nền kế thừa model dịch. */
export function effectiveModel(
  settings: AppSettings,
  purpose: 'translation' | 'summary' | 'profile' = 'translation',
): string {
  if (settings.provider === 'ollama') {
    return (
      (purpose === 'summary'
        ? settings.ollamaSummaryModel
        : purpose === 'profile'
          ? settings.ollamaProfileModel
          : '') || settings.ollamaModel
    );
  }
  if (settings.provider === 'lmStudio') {
    return (
      (purpose === 'summary'
        ? settings.lmStudioSummaryModel
        : purpose === 'profile'
          ? settings.lmStudioProfileModel
          : '') || settings.lmStudioModel
    );
  }
  return (
    (purpose === 'summary'
      ? settings.summaryModel
      : purpose === 'profile'
        ? settings.profileModel
        : '') || settings.model
  );
}

/** LM Studio có thể chạy không token; OpenRouter bắt buộc key đã lưu. */
export function hasProviderAccess(settings: AppSettings, hasApiKey: boolean): boolean {
  return settings.provider !== 'openRouter' || hasApiKey;
}

/** Phân biệt server để danh sách model và cache không dùng chéo nhà cung cấp. */
export function providerIdentity(settings: AppSettings): string {
  return settings.provider === 'lmStudio'
    ? `lmStudio:${settings.lmStudioBaseUrl}`
    : settings.provider === 'ollama'
      ? `ollama:${settings.ollamaBaseUrl}`
      : 'openRouter';
}
