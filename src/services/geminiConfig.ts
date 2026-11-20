export { requiresBackendGrounding } from '../utils/assistantSafety';

export const SUPPORTED_TEXT_MODELS = new Set([
  'gemini-3.8-flash',
  'gemini-3.1-pro-preview',
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'gemini-4-carbon',
  'gemini-4-argon'
]);

export const SUPPORTED_LIVE_MODELS = new Set([
  'gemini-3.8-live',
  'gemini-3.8-live-extended-thinking'
]);

export type GeminiErrorCategory =
  | 'not_configured'
  | 'invalid_api_key'
  | 'permission_denied'
  | 'unsupported_model'
  | 'quota_exceeded'
  | 'timeout'
  | 'provider_timeout'
  | 'network_failure'
  | 'invalid_request'
  | 'tool_call_missing'
  | 'live_api_unavailable'
  | 'provider_unavailable'
  | 'unknown';

export interface GeminiConfiguration {
  apiKey: string;
  textModel: string;
  liveModel: string;
  maxOutputTokens: number;
  timeoutMs: number;
  maxHistoryMessages: number;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function getGeminiConfiguration(
  env: NodeJS.ProcessEnv = process.env
): GeminiConfiguration {
  return {
    apiKey: env.GEMINI_API_KEY?.trim() || '',
    textModel: env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
    liveModel: env.GEMINI_LIVE_MODEL?.trim() || 'gemini-3.8-live',
    maxOutputTokens: boundedInteger(env.GEMINI_MAX_OUTPUT_TOKENS, 2048, 64, 65536),
    timeoutMs: boundedInteger(env.GEMINI_TIMEOUT_MS, 30000, 1000, 120000),
    maxHistoryMessages: boundedInteger(env.GEMINI_MAX_HISTORY_MESSAGES, 20, 0, 100)
  };
}

export function classifyGeminiError(error: unknown): GeminiErrorCategory {
  const status = error && typeof error === 'object' && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (status === 400) return 'invalid_request';
  if (status === 401 || /api.?key.{0,30}(invalid|not valid)|invalid api key|unauthorized/.test(normalized)) {
    return 'invalid_api_key';
  }
  if (status === 403 || /permission denied|forbidden|insufficient permission/.test(normalized)) {
    return 'permission_denied';
  }
  if (status === 404 || /model.{0,30}(not found|unsupported|unknown)/.test(normalized)) {
    return 'unsupported_model';
  }
  if (status === 429 || /quota|rate.?limit|resource exhausted/.test(normalized)) {
    return 'quota_exceeded';
  }
  if (status === 504) return 'provider_timeout';
  if (
    (error instanceof Error && error.name === 'AbortError') ||
    /timed? ?out|timeout|aborted/.test(normalized)
  ) {
    return 'timeout';
  }
  if (/fetch failed|network|econnreset|enotfound|socket/.test(normalized)) {
    return 'network_failure';
  }
  if (status === 503 || status === 502 || /service unavailable|high demand|overloaded/.test(normalized)) {
    return 'provider_unavailable';
  }
  return 'unknown';
}

export function isRetryableGeminiError(error: unknown): boolean {
  const category = classifyGeminiError(error);
  return category === 'provider_unavailable' ||
    category === 'provider_timeout' ||
    category === 'network_failure';
}

export async function withGeminiRetry<T>(
  operation: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds))
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableGeminiError(error)) throw error;
    await wait(400);
    return operation();
  }
}
