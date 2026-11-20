import test from 'node:test';
import assert from 'node:assert/strict';
import { submitSosRequest } from '../services/sosService';

test('SOS fallback never claims transmission when no backend is configured', async () => {
  const result = await submitSosRequest({
    idempotencyKey: 'voice-sos-test',
    transcript: 'Emergency',
    requestedAt: new Date().toISOString(),
    location: { latitude: 18.5, longitude: 73.8, accuracyM: 25 }
  });
  assert.deepEqual(result, {
    status: 'unavailable',
    message: 'SOS has not been transmitted because this app has no SOS submission endpoint. Please call an emergency service directly.'
  });
});
