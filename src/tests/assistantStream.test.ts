import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AssistantRequestError,
  getAssistantErrorCategory,
  readAssistantResponse
} from '../services/assistantStream';

test('assistant response reader accepts a complete Gemini SSE response', async () => {
  const response = new Response(
    'event: delta\ndata: {"text":"Live "}\n\n' +
    'event: complete\ndata: {"reply":"Live answer","source":"Gemini AI","aiStatus":"available"}\n\n',
    {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Request-ID': 'request-123'
      }
    }
  );
  const deltas: string[] = [];

  const result = await readAssistantResponse(response, text => deltas.push(text));

  assert.deepEqual(deltas, ['Live ']);
  assert.equal(result.reply, 'Live answer');
  assert.equal(result.source, 'Gemini AI');
  assert.equal(result.aiStatus, 'available');
  assert.equal(result.requestId, 'request-123');
});

test('assistant response reader accepts complete legacy JSON backend fallback', async () => {
  const response = new Response(JSON.stringify({
    reply: 'Verified backend telemetry',
    source: 'Live Backend Telemetry (GEMINI_API_KEY not configured)',
    timestamp: '2026-01-01T00:00:00.000Z'
  }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

  const result = await readAssistantResponse(response, () => undefined);

  assert.equal(result.reply, 'Verified backend telemetry');
  assert.equal(result.aiStatus, 'unavailable');
  assert.equal(result.errorCategory, 'not_configured');
});

test('assistant response reader preserves categorized backend fallback as non-AI data', async () => {
  const response = new Response(
    'event: complete\ndata: {"reply":"Verified telemetry","source":"Verified SanketSetu backend telemetry (not an AI-generated answer)","aiStatus":"unavailable","errorCategory":"timeout"}\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } }
  );

  const result = await readAssistantResponse(response, () => undefined);

  assert.equal(result.aiStatus, 'unavailable');
  assert.equal(result.errorCategory, 'timeout');
  assert.equal(result.source, 'Verified SanketSetu backend telemetry (not an AI-generated answer)');
});

test('assistant response reader preserves HTTP 503 and 504 error categories', async () => {
  for (const [status, category] of [[503, 'provider_unavailable'], [504, 'provider_timeout']] as const) {
    const response = new Response('{}', { status });
    await assert.rejects(
      readAssistantResponse(response, () => undefined),
      error => error instanceof AssistantRequestError && error.category === category
    );
  }
});

test('assistant response reader rejects incomplete or malformed responses', async () => {
  const incompleteStream = new Response('event: delta\ndata: {"text":"partial"}\n\n', {
    headers: { 'Content-Type': 'text/event-stream' }
  });
  const malformedJson = new Response('{"reply":"answer"}', {
    headers: { 'Content-Type': 'application/json' }
  });

  await assert.rejects(
    readAssistantResponse(incompleteStream, () => undefined),
    error => error instanceof AssistantRequestError && error.category === 'incomplete_response'
  );
  await assert.rejects(
    readAssistantResponse(malformedJson, () => undefined),
    error => error instanceof AssistantRequestError && error.category === 'invalid_response'
  );
});

test('assistant client errors distinguish network failures from timeouts', () => {
  assert.equal(getAssistantErrorCategory(new TypeError('fetch failed')), 'network_failure');
  assert.equal(getAssistantErrorCategory(new DOMException('request timed out', 'TimeoutError')), 'timeout');
});
