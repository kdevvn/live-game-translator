import type { AppSettings, CaptureRegion, GameProfile } from './types';

export const PROFILE_INPUT_TOKEN_LIMIT_MIN = 1000;
export const PROFILE_INPUT_TOKEN_LIMIT_MAX = 1000000;

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openRouter',
  ollamaBaseUrl: 'http://localhost:11434/v1',
  ollamaModel: '',
  ollamaSummaryModel: '',
  ollamaProfileModel: '',
  lmStudioBaseUrl: 'http://localhost:1234/v1',
  lmStudioModel: '',
  lmStudioSummaryModel: '',
  lmStudioProfileModel: '',
  theme: 'dark',
  locale: 'vi',
  model: '',
  summaryModel: '',
  profileModel: '',
  profileLearningInterval: 20,
  profileInputTokenLimit: 15000,
  autoTranslate: false,
  duplicateThreshold: 80,
  translateShortcut: 'Ctrl+Alt+T',
  pauseShortcut: 'Ctrl+Alt+P',
  overlayFontSize: 28,
  overlayFullscreen: false,
  overlayFullscreenFontSize: 28,
  overlayOpacity: 0.85,
  overlayDurationSeconds: 5,
};
export const DEFAULT_REGION: CaptureRegion = { x: 0, y: 0.65, width: 1, height: 0.35 };
export const DEFAULT_PROFILE: GameProfile = {
  id: 'general',
  name: 'Chung',
  instructions: '',
  characters: [],
  relationships: [],
  glossary: [],
  revision: 0,
};
/** Nhịp quan sát vùng OCR độc lập với tốc độ video preview. */
export const CAPTURE_INTERVAL_MS = 1000 / 30;
export const PREVIEW_WIDTH = 1920;
export const PREVIEW_HEIGHT = 1080;
export const STABLE_TEXT_MS = 150;
export const QUEUE_LIMIT = 3;
export const API_TIMEOUT_MS = 20000;
export const HISTORY_LIMIT = 12;
export const SUMMARY_INTERVAL = 20;
/** Trần đầu vào chỉ dành cho dịch hội thoại, không áp dụng tác vụ hồ sơ game. */
export const INPUT_TOKEN_LIMIT = 6000;
export const CACHE_LIMIT = 5000;
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TEST_DIALOGUES = [
  'Father, the gate is open.',
  'Stay close to me, son.',
  'I can hear someone on the other side.',
  'We must reach the tower before dawn.',
  'Do you remember the promise you made?',
  'I will not leave you behind.',
];
