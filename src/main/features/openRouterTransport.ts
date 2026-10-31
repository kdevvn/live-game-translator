import { Agent } from 'undici';

const KEEP_ALIVE_TIMEOUT_MS = 60000;
const MAX_CONNECTIONS = 2;

/** Transport HTTP nội bộ của main; không cung cấp URL hoặc socket cho renderer. */
export interface OpenRouterTransport {
  fetch: typeof fetch;
  /** Đóng các kết nối do transport sở hữu khi thoát ứng dụng. */
  dispose(): Promise<void>;
}

/** Pool riêng tối đa hai socket, giữ kết nối rỗi tối đa 60 giây; server có thể đóng sớm hơn. */
export function createOpenRouterTransport(connections = MAX_CONNECTIONS): OpenRouterTransport {
  const agent = new Agent({
    keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
    keepAliveMaxTimeout: KEEP_ALIVE_TIMEOUT_MS,
    connections,
    pipelining: 1,
  });
  let disposal: Promise<void> | null = null;
  /** Giữ nguyên fetch/Response của Node, chỉ chỉ định pool riêng; không đổi dispatcher toàn cục. */
  function fetchWithKeepAlive(
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> {
    if (disposal) return Promise.reject(new Error('NETWORK'));
    const options: RequestInit & { dispatcher: Agent } = { ...init, dispatcher: agent };
    return fetch(input, options);
  }
  /** Hủy cả request đang chạy khi thoát; gọi nhiều lần vẫn dùng cùng promise cleanup. */
  function dispose(): Promise<void> {
    disposal ??= agent.destroy();
    return disposal;
  }
  return { fetch: fetchWithKeepAlive, dispose };
}
