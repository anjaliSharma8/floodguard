export interface ServerSentEvent {
  event: string;
  data: string;
}

export interface AssistantResponsePayload {
  reply: string;
  source: string;
  timestamp?: string;
  aiStatus?: 'available' | 'unavailable';
  errorCategory?: string;
  requestId?: string;
}

export class AssistantRequestError extends Error {
  constructor(
    readonly category: string,
    readonly requestId?: string
  ) {
    super(`Assistant request failed: ${category}`);
    this.name = 'AssistantRequestError';
  }
}

function parseEventBlock(block: string): ServerSentEvent | null {
  let event = 'message';
  const data: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }

  return data.length ? { event, data: data.join('\n') } : null;
}

export async function* readServerSentEvents(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ServerSentEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const event = parseEventBlock(buffer.slice(0, boundary));
        if (event) yield event;
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, '\n');
    const finalEvent = parseEventBlock(buffer);
    if (finalEvent) yield finalEvent;
  } finally {
    reader.releaseLock();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeErrorCategory(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,59}$/i.test(value)
    ? value
    : undefined;
}

function categoryFromStatus(status: number): string {
  if (status === 401) return 'authentication_required';
  if (status === 403) return 'permission_denied';
  if (status === 429) return 'quota_exceeded';
  if (status === 503) return 'provider_unavailable';
  if (status === 504) return 'provider_timeout';
  return status >= 500 ? 'backend_failure' : 'http_error';
}

function isAssistantResponse(value: unknown): value is Record<string, unknown> & {
  reply: string;
  source: string;
} {
  return isRecord(value) &&
    typeof value.reply === 'string' &&
    Boolean(value.reply.trim()) &&
    typeof value.source === 'string' &&
    Boolean(value.source.trim());
}

function parseAssistantPayload(
  value: unknown,
  requestId?: string
): AssistantResponsePayload {
  if (!isAssistantResponse(value)) {
    throw new AssistantRequestError('invalid_response', requestId);
  }

  const source = value.source;
  const inferredUnavailable = /verified.*backend|backend telemetry/i.test(source);
  const aiStatus = value.aiStatus === 'available' || value.aiStatus === 'unavailable'
    ? value.aiStatus
    : inferredUnavailable ? 'unavailable' : undefined;
  const sourceIndicatesMissingKey = /gemini_api_key not configured/i.test(source);

  return {
    reply: value.reply,
    source,
    ...(typeof value.timestamp === 'string' ? { timestamp: value.timestamp } : {}),
    ...(aiStatus ? { aiStatus } : {}),
    ...(safeErrorCategory(value.errorCategory)
      ? { errorCategory: safeErrorCategory(value.errorCategory) }
      : sourceIndicatesMissingKey ? { errorCategory: 'not_configured' } : {}),
    ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : requestId ? { requestId } : {})
  };
}

export async function readAssistantResponse(
  response: Response,
  onDelta: (text: string) => void,
  onReset: () => void = () => undefined
): Promise<AssistantResponsePayload> {
  const requestId = response.headers.get('x-request-id') || undefined;
  const contentType = response.headers.get('content-type')?.toLowerCase() || '';

  if (!response.ok) {
    let payload: unknown;
    if (contentType.includes('application/json')) {
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
    }
    const category = isRecord(payload)
      ? safeErrorCategory(payload.errorCategory) || categoryFromStatus(response.status)
      : categoryFromStatus(response.status);
    throw new AssistantRequestError(category, requestId);
  }

  if (contentType.includes('application/json')) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AssistantRequestError('invalid_response', requestId);
    }
    return parseAssistantPayload(payload, requestId);
  }

  if (!contentType.includes('text/event-stream') || !response.body) {
    throw new AssistantRequestError('invalid_response', requestId);
  }

  let completed: AssistantResponsePayload | undefined;
  for await (const event of readServerSentEvents(response.body)) {
    let data: unknown;
    try {
      data = JSON.parse(event.data);
    } catch {
      throw new AssistantRequestError('invalid_response', requestId);
    }

    if (!isRecord(data)) {
      throw new AssistantRequestError('invalid_response', requestId);
    }
    if (event.event === 'delta' && typeof data.text === 'string') {
      onDelta(data.text);
    } else if (event.event === 'reset') {
      onReset();
    } else if (event.event === 'error') {
      throw new AssistantRequestError(
        safeErrorCategory(data.errorCategory) || 'backend_failure',
        requestId
      );
    } else if (event.event === 'complete') {
      completed = parseAssistantPayload(data, requestId);
    }
  }

  if (!completed) throw new AssistantRequestError('incomplete_response', requestId);
  return completed;
}

export function getAssistantErrorCategory(error: unknown): string {
  if (error instanceof AssistantRequestError) return error.category;
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return 'timeout';
  }
  if (error instanceof TypeError) return 'network_failure';
  return 'client_error';
}
