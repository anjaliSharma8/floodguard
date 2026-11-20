import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGeminiError,
  getGeminiConfiguration,
  requiresBackendGrounding,
  withGeminiRetry
} from '../services/geminiConfig';

test('Gemini configuration reads model and bounded request settings without exposing defaults as secrets', () => {
  const config = getGeminiConfiguration({
    GEMINI_API_KEY: 'server-only-key',
    GEMINI_MODEL: 'gemini-3.8-flash',
    GEMINI_LIVE_MODEL: 'gemini-3.8-live',
    GEMINI_MAX_OUTPUT_TOKENS: '1024',
    GEMINI_TIMEOUT_MS: '15000',
    GEMINI_MAX_HISTORY_MESSAGES: '8'
  });

  assert.equal(config.apiKey, 'server-only-key');
  assert.equal(config.textModel, 'gemini-3.8-flash');
  assert.equal(config.liveModel, 'gemini-3.8-live');
  assert.equal(config.maxOutputTokens, 1024);
  assert.equal(config.timeoutMs, 15000);
  assert.equal(config.maxHistoryMessages, 8);

  const invalidLimits = getGeminiConfiguration({
    GEMINI_MAX_OUTPUT_TOKENS: '0',
    GEMINI_TIMEOUT_MS: 'not-a-number',
    GEMINI_MAX_HISTORY_MESSAGES: '200'
  });
  assert.equal(invalidLimits.maxOutputTokens, 2048);
  assert.equal(invalidLimits.timeoutMs, 30000);
  assert.equal(invalidLimits.maxHistoryMessages, 20);
});

test('Gemini provider errors map to safe, actionable categories', () => {
  assert.equal(classifyGeminiError(Object.assign(new Error('Invalid request'), { status: 400 })), 'invalid_request');
  assert.equal(classifyGeminiError(Object.assign(new Error('Unauthorized'), { status: 401 })), 'invalid_api_key');
  assert.equal(classifyGeminiError(Object.assign(new Error('Permission denied'), { status: 403 })), 'permission_denied');
  assert.equal(classifyGeminiError(Object.assign(new Error('Not found'), { status: 404 })), 'unsupported_model');
  assert.equal(classifyGeminiError(Object.assign(new Error('Quota exhausted'), { status: 429 })), 'quota_exceeded');
  assert.equal(classifyGeminiError(Object.assign(new Error('currently high demand'), { status: 503 })), 'provider_unavailable');
  assert.equal(classifyGeminiError(Object.assign(new Error('Gateway timeout'), { status: 504 })), 'provider_timeout');
  assert.equal(classifyGeminiError(Object.assign(new Error('request timed out'), { name: 'AbortError' })), 'timeout');
  assert.equal(classifyGeminiError(new Error('fetch failed')), 'network_failure');
});

test('Gemini retries one transient failure but does not retry credential or model failures', async () => {
  let attempts = 0;
  const result = await withGeminiRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('Temporary service issue'), { status: 503 });
    return 'ok';
  }, async () => undefined);
  assert.equal(result, 'ok');
  assert.equal(attempts, 2);

  attempts = 0;
  await assert.rejects(() => withGeminiRetry(async () => {
    attempts += 1;
    throw Object.assign(new Error('Invalid API key'), { status: 401 });
  }, async () => undefined));
  assert.equal(attempts, 1);
});

test('Gemini does not retry local timeouts or exhausted quota responses', async () => {
  let attempts = 0;
  await assert.rejects(() => withGeminiRetry(async () => {
    attempts += 1;
    throw Object.assign(new Error('request timed out'), { name: 'TimeoutError' });
  }, async () => undefined));
  assert.equal(attempts, 1);

  attempts = 0;
  await assert.rejects(() => withGeminiRetry(async () => {
    attempts += 1;
    throw Object.assign(new Error('Quota exhausted'), { status: 429 });
  }, async () => undefined));
  assert.equal(attempts, 1);
});

test('flood-safety and local-condition questions are marked for backend grounding', () => {
  assert.equal(requiresBackendGrounding('Are roads closed in Pune right now?'), true);
  assert.equal(requiresBackendGrounding('क्या पुणे में बारिश हो रही है?'), true);
  assert.equal(requiresBackendGrounding('Hello, how are you?'), false);
});
