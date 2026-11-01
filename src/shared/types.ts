import { z } from 'zod';
import {
  OVERLAY_FONT_SIZE_MAX,
  PROFILE_INPUT_TOKEN_LIMIT_MIN,
  PROFILE_INPUT_TOKEN_LIMIT_MAX,
} from './defaults';

/** Vùng chữ tương đối so với kích thước nội dung video, trong khoảng 0-1. */
export const regionSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((r) => r.x + r.width <= 1.001 && r.y + r.height <= 1.001);
export type CaptureRegion = z.infer<typeof regionSchema>;

/** Cấu hình người dùng; tuyệt đối không chứa API key dạng rõ. */
const localBaseUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  })
  .transform((value) => value.replace(/\/+$/, ''));

export const settingsSchema = z.object({
  /** Nhà cung cấp dùng chung cho dịch và các tác vụ nền. */
  provider: z.enum(['openRouter', 'lmStudio', 'ollama']),
  /** Base URL HTTP/HTTPS của server local hoặc LAN, bao gồm /v1. */
  lmStudioBaseUrl: localBaseUrlSchema,
  /** Cấu hình Ollama độc lập với LM Studio. */
  ollamaBaseUrl: localBaseUrlSchema,
  ollamaModel: z.string().max(200),
  ollamaSummaryModel: z.string().max(200),
  ollamaProfileModel: z.string().max(200),
  /** Model local độc lập với lựa chọn OpenRouter; chuỗi rỗng là chưa chọn. */
  lmStudioModel: z.string().max(200),
  /** Để trống để dùng model dịch local. */
  lmStudioSummaryModel: z.string().max(200),
  /** Để trống để dùng model dịch local. */
  lmStudioProfileModel: z.string().max(200),
  theme: z.enum(['light', 'dark', 'system']),
  locale: z.enum(['vi', 'en']),
  model: z.string().max(200),
  summaryModel: z.string().max(200),
  profileModel: z.string().max(200),
  /** Số câu dịch thành công mỗi lô học hồ sơ. */
  profileLearningInterval: z.number().int().min(1).max(200),
  /** Trần token đầu vào ước lượng cho tóm tắt, khởi tạo và bổ sung hồ sơ game. */
  profileInputTokenLimit: z
    .number()
    .int()
    .min(PROFILE_INPUT_TOKEN_LIMIT_MIN)
    .max(PROFILE_INPUT_TOKEN_LIMIT_MAX),
  autoTranslate: z.boolean(),
  /** Phần trăm giống nhau để bỏ câu tự động; 0 tắt lọc gần giống. */
  duplicateThreshold: z.number().int().min(0).max(100),
  translateShortcut: z.string().min(1).max(100),
  pauseShortcut: z.string().min(1).max(100),
  overlayFontSize: z.number().int().min(16).max(OVERLAY_FONT_SIZE_MAX),
  /** Chế độ phủ màn hình và cỡ chữ độc lập của chế độ này. */
  overlayFullscreen: z.boolean(),
  overlayFullscreenFontSize: z.number().int().min(16).max(OVERLAY_FONT_SIZE_MAX),
  overlayOpacity: z.number().min(0.4).max(1),
  /** Thời gian hiện sau lần cập nhật caption cuối, tính bằng giây. */
  overlayDurationSeconds: z.number().int().min(1).max(60),
});
export type AppSettings = z.infer<typeof settingsSchema>;

/** Nhân vật và biệt danh do người dùng xác nhận. */
export const characterSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  aliases: z.string().max(500),
});
/** Quan hệ có hướng: người nói tự xưng và gọi người nghe bằng hai từ riêng. */
export const relationshipSchema = z.object({
  speaker: z.string().min(1).max(100),
  listener: z.string().min(1).max(100),
  self: z.string().min(1).max(100),
  address: z.string().min(1).max(100),
});
/** Hồ sơ độc lập với nguồn capture và các phiên hội thoại. */
export const profileSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  instructions: z.string().max(4000),
  characters: z.array(characterSchema).max(100),
  relationships: z.array(relationshipSchema).max(200),
  glossary: z
    .array(z.object({ source: z.string().min(1).max(200), target: z.string().min(1).max(200) }))
    .max(300),
  revision: z.number().int().nonnegative(),
  /** Thiếu ở dữ liệu cũ: main mặc định bật, trừ hồ sơ Chung. */
  aiEnabled: z.boolean().optional(),
});
export type GameProfile = z.infer<typeof profileSchema>;

/** Dữ kiện AI đề nghị; quy tắc dịch ưu tiên chỉ do người dùng nhập, không thuộc output AI. */
export const profileEnrichmentSchema = profileSchema
  .pick({ relationships: true, glossary: true })
  .extend({
    characters: z.array(characterSchema.omit({ id: true })).max(100),
    evidence: z.string().min(1).max(2000),
  });
export type ProfileEnrichment = z.infer<typeof profileEnrichmentSchema>;
/** Đề xuất lưu bền vững; instructions chỉ để đọc dữ liệu cũ, main không phát hoặc chấp nhận mục này. */
export const profileProposalSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  field: z.enum(['instructions', 'characters', 'relationships', 'glossary']),
  key: z.string(),
  before: z.string(),
  after: z.string(),
  evidence: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
});
export type ProfileProposal = z.infer<typeof profileProposalSchema>;
/** Tiến độ tác vụ hồ sơ chỉ chứa trạng thái và mã lỗi công khai. */
export interface ProfileTask {
  profileId: string;
  status: 'waiting' | 'queued' | 'running' | 'completed' | 'cleared' | 'no_data' | 'error';
  error: AppError | null;
}

/** Bản dịch có cấu trúc đã được xác thực trước khi đưa lên overlay. */
export const translationSchema = z.object({
  translation: z.string().min(1).max(12000),
  speaker: z.string().max(100),
  listener: z.string().max(100),
});
/** ID model do metadata API xác nhận, không dùng tên router cấu hình làm bằng chứng. */
export const modelIdSchema = z.string().trim().min(1).max(200);
/** Cache giữ model đã tạo bản dịch; không giữ token/chi phí của request gốc. */
export const translationCacheSchema = translationSchema.extend({
  modelId: modelIdSchema.optional(),
});
/** Token do API báo cho toàn request, gồm prompt/ngữ cảnh và completion có cấu trúc. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}
/** Kết quả đã kiểm tra; usage lấy từ envelope API, tuyệt đối không từ nội dung model. */
export type TranslationResult = z.infer<typeof translationCacheSchema> & {
  usage?: TokenUsage;
  costUsd?: number;
};

/** Một đoạn hội thoại; thời gian đo theo mili giây và thứ tự tăng trong phiên. */
export interface Dialogue {
  id: string;
  sessionId: string;
  sequence: number;
  text: string;
  translation: string;
  speaker: string;
  listener: string;
  status: 'pending' | 'translated' | 'skipped' | 'error' | 'cancelled';
  createdAt: number;
  ocrMs: number;
  apiMs: number;
  /** Thời gian chờ trước khi bắt đầu dịch; không bao gồm OCR, tính bằng ms. */
  queueMs?: number;
  /** Thời gian từ lúc bắt đầu dịch đến chữ bản nháp đầu tiên, tính bằng ms. */
  firstTextMs?: number;
  /** Thiếu khi provider không báo usage hoặc lịch sử cũ chưa lưu token. */
  usage?: TokenUsage;
  /** Chi phí request do OpenRouter báo, tính bằng USD; thiếu không đồng nghĩa miễn phí. */
  costUsd?: number;
  /** Model thực tế của bản dịch; thiếu khi API/lịch sử cũ chưa cung cấp. */
  modelId?: string;
  /** Cache cục bộ không gọi API mới, có token của lần này bằng 0. */
  fromCache?: boolean;
  error?: string;
}
/** Phiên dịch được lưu để tiếp tục hội thoại sau khi khởi động lại. */
export interface StoredSession {
  id: string;
  profileId: string;
  summary: string;
  summarizedThrough: number;
  createdAt: number;
}
/** Nguồn màn hình/cửa sổ có thể chọn trong Electron. */
export interface CaptureSource {
  id: string;
  name: string;
}
/** Model và metadata do server cung cấp; LM Studio có thể thiếu giới hạn/giá. */
export interface ModelOption {
  id: string;
  /** Kiến trúc do LM Studio công bố; thiếu thì giữ format hội thoại mặc định. */
  architecture?: string;
  name: string;
  /** Thiếu khi server không công bố; không xem là context bằng 0. */
  contextLength?: number;
  /** Chỉ true khi giá input, output và mỗi request đều bằng 0 theo API. */
  isFree: boolean;
  /** Model khai báo hỗ trợ structured outputs. */
  supportsStructuredOutputs: boolean;
  /** Giá USD cho một triệu token đầu vào và đầu ra, nếu API cung cấp. */
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
}
/** Lỗi được truyền dưới mã ổn định để giao diện tự chọn bản dịch. */
export type AppError =
  | 'INVALID_INPUT'
  | 'FORBIDDEN'
  | 'INTERNAL'
  | 'API_KEY'
  | 'MODEL'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'RESPONSE'
  | 'CONTEXT_LIMIT'
  | 'CAPTURE'
  | 'OCR'
  | 'SHORTCUT'
  | 'STORAGE'
  | 'PROFILE_CHANGED';
/** Trạng thái duy nhất của main, không chứa dữ liệu bí mật hoặc ảnh capture. */
export interface SessionSnapshot {
  /** Danh sách model đã tải hoặc được khôi phục từ cache. */
  modelOptions?: ModelOption[];
  settings: AppSettings;
  resolvedTheme: 'light' | 'dark';
  hasApiKey: boolean;
  /** Chỉ báo token LM Studio đã lưu, không chứa bí mật. */
  hasLmStudioToken?: boolean;
  /** Chỉ báo token Ollama đã lưu, không chứa bí mật. */
  hasOllamaToken?: boolean;
  profiles: GameProfile[];
  sessions: StoredSession[];
  session: StoredSession | null;
  status: 'idle' | 'starting' | 'running' | 'paused' | 'error';
  dialogues: Dialogue[];
  ocrText: string;
  error: AppError | null;
  overlayEditing: boolean;
  /** Caption còn trong thời gian hiển thị; main xóa khi hết hạn hoặc dừng. */
  overlayText: string;
  generation: number;
  /** Generation của stream/peer, giữ nguyên khi chỉ bật OCR trên preview hiện tại. */
  previewGeneration?: number;
  sourceId: string;
  sourceName: string;
  region: CaptureRegion;
  /** Có tác vụ tóm tắt đang chạy cho phiên hiện tại. */
  summaryLoading?: boolean;
  profileTasks?: ProfileTask[];
  profileProposals?: ProfileProposal[];
}
/** Lệnh điều khiển capture chỉ được gửi đến cửa sổ capture nội bộ. */
export type CaptureCommand =
  | { action: 'preview'; sourceId: string; generation: number }
  | {
      action: 'start';
      sourceId: string;
      generation: number;
      region: CaptureRegion;
      previewGeneration?: number;
    }
  | { action: 'stop' }
  | { action: 'recognize' };
/** Chọn nguồn video trực tiếp; mã chủ sở hữu ngăn cleanup cũ đóng nguồn mới. */
export const previewSourceSchema = z.object({
  sourceId: z.string().min(1).max(200).nullable(),
  id: z.string().uuid(),
});
/** Chỉ trao đổi SDP nội bộ qua IPC; video đi trực tiếp giữa hai renderer bằng WebRTC. */
export const previewSignalSchema = z.object({
  generation: z.number().int().nonnegative(),
  id: z.string().uuid(),
  message: z.discriminatedUnion('type', [
    z.object({ type: z.literal('request') }).strict(),
    z.object({ type: z.literal('close') }),
    z.object({ type: z.literal('unavailable') }),
    z.object({ type: z.literal('offer'), sdp: z.string().min(1).max(65536) }),
    z.object({ type: z.literal('answer'), sdp: z.string().min(1).max(65536) }),
  ]),
});
export type PreviewSignal = z.infer<typeof previewSignalSchema>;
/** Kết quả IPC có phân biệt thành công/thất bại, không rò stack hoặc secret. */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: AppError };
/** Một lần gọi server model chỉ tồn tại trong bộ nhớ khi chạy debug. */
export interface DebugEntry {
  id: number;
  startedAt: number;
  path: string;
  request: string;
  response: string;
  status: 'pending' | 'success' | 'error';
  httpStatus?: number;
  error?: string;
}

/** API tối thiểu được preload công bố; subscription trả hàm cleanup. */
export interface AppBridge {
  /** Lấy log debug; null khi ứng dụng không chạy ở chế độ debug. */
  debugLogs(): Promise<ApiResult<DebugEntry[] | null>>;
  /** Theo dõi thay đổi log debug. */
  onDebugLogs(callback: (entries: DebugEntry[]) => void): () => void;
  /** Xóa log debug trong bộ nhớ. */
  clearDebugLogs(): Promise<ApiResult<void>>;
  /** Lấy trạng thái công khai ban đầu; không có key hoặc đường dẫn dữ liệu. */
  snapshot(): Promise<ApiResult<SessionSnapshot>>;
  /** Theo dõi snapshot mới và trả hàm hủy listener khi unmount. */
  subscribe(callback: (snapshot: SessionSnapshot) => void): () => void;
  /** Liệt kê mã và tên cửa sổ capture được, không chụp ảnh thu nhỏ. */
  sources(): Promise<ApiResult<CaptureSource[]>>;
  /** Mở preview không chạy OCR; null chỉ đóng preview thuộc đúng mã chủ sở hữu. */
  previewSource(sourceId: string | null, id: string): Promise<ApiResult<number>>;
  /** Lưu vùng chữ hợp lệ cho hồ sơ. */
  setProfileRegion(profileId: string, region: CaptureRegion): Promise<ApiResult<void>>;
  /** Lưu cấu hình đã kiểm tra; đổi model tạm dừng pipeline hiện tại. */
  settings(value: AppSettings): Promise<ApiResult<void>>;
  /** Gửi secret một chiều để mã hóa riêng theo provider; mặc định OpenRouter, rỗng để xóa. */
  saveKey(key: string, provider?: AppSettings['provider']): Promise<ApiResult<void>>;
  /** Tải model hỗ trợ structured outputs; không tự chọn model. */
  models(): Promise<ApiResult<ModelOption[]>>;
  /** Lưu hồ sơ nguyên tử và tăng revision tại main. */
  saveProfile(profile: GameProfile): Promise<ApiResult<void>>;
  /** Xóa dữ kiện hồ sơ theo revision, giữ quy tắc và các phiên hội thoại. */
  clearProfile(id: string, revision: number): Promise<ApiResult<void>>;
  /** Xóa hồ sơ và các phiên liên quan. */
  deleteProfile(id: string): Promise<ApiResult<void>>;
  /** Thử lại khởi tạo hoặc lô học chưa hoàn thành của hồ sơ. */
  retryProfile(id: string): Promise<ApiResult<void>>;
  /** Duyệt một đề xuất; main kiểm tra dữ liệu gốc trước khi áp dụng. */
  resolveProfileProposal(id: string, action: 'accept' | 'reject'): Promise<ApiResult<void>>;
  /** Tạo phiên mới hoặc tiếp tục phiên cùng hồ sơ; chưa bắt đầu capture. */
  session(profileId: string, resumeId?: string): Promise<ApiResult<void>>;
  /** Mở phiên rỗng cho cùng hồ sơ, giữ lịch sử phiên trước. */
  reset(): Promise<ApiResult<void>>;
  /** Bắt đầu theo dõi nguồn và vùng chữ chuẩn hóa người dùng đã chọn. */
  start(sourceId: string, region: CaptureRegion): Promise<ApiResult<void>>;
  /** Dừng, tạm dừng/tiếp tục hoặc yêu cầu OCR và dịch ngay. */
  control(action: 'stop' | 'pause' | 'translate'): Promise<ApiResult<void>>;
  /** Sửa trường hội thoại cho phép; main giữ mã phiên, thứ tự và thời điểm gốc. */
  editDialogue(dialogue: Dialogue): Promise<ApiResult<void>>;
  /** Tạo lượt dịch mới từ text của đoạn cũ, áp dụng ngữ cảnh hiện tại. */
  retry(id: string): Promise<ApiResult<void>>;
  /** Bật/tắt chỉnh vị trí overlay; tắt sẽ bật click-through và lưu vị trí. */
  overlay(editing: boolean): Promise<ApiResult<void>>;
  /** Cho phép nút đóng overlay nhận chuột hoặc khôi phục nhấp xuyên. */
  overlayPointer(active: boolean): Promise<ApiResult<void>>;
  /** Tắt chế độ overlay toàn màn hình. */
  closeFullscreenOverlay(): Promise<ApiResult<void>>;
  /** Mở nguồn phụ đề tổng hợp để kiểm tra capture mà không cần PS Remote Play. */
  testSource(): Promise<ApiResult<void>>;
  /** Gửi signaling đến capture hiện tại; main kiểm tra vai trò và generation. */
  preview(signal: PreviewSignal): void;
  /** Nhận signaling preview; subscription luôn có cleanup. */
  onPreview(callback: (signal: PreviewSignal) => void): () => void;
}
declare global {
  interface Window {
    app: AppBridge;
  }
}
