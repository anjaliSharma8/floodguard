import test from 'node:test';
import assert from 'node:assert/strict';
import { readServerSentEvents } from '../services/assistantStream';
import { decodePcm16Audio, encodePcm16Audio } from '../services/geminiLiveAudio';

test('SSE reader parses events split across arbitrary network chunks', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('event: delta\ndata: {"text":"Hello'),
    encoder.encode(' "}\n\nevent: complete\ndata: {"aiStatus":"available"}\n\n')
  ];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    }
  });
  const events = [];
  for await (const event of readServerSentEvents(stream)) events.push(event);

  assert.deepEqual(events, [
    { event: 'delta', data: '{"text":"Hello "}' },
    { event: 'complete', data: '{"aiStatus":"available"}' }
  ]);
});

test('SSE reader handles CRLF line endings split between network chunks', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('event: complete\r'),
    encoder.encode('\ndata: {"reply":"ready"}\r\n\r\n')
  ];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    }
  });
  const events = [];
  for await (const event of readServerSentEvents(stream)) events.push(event);

  assert.deepEqual(events, [{ event: 'complete', data: '{"reply":"ready"}' }]);
});

test('PCM audio encoder resamples and decoder preserves signed little-endian samples', () => {
  const source = new Float32Array([0.75, 0.75, -0.75, -0.75]);
  const encoded = encodePcm16Audio(source, 32000, 16000);
  const decoded = decodePcm16Audio(encoded);

  assert.equal(decoded.length, 2);
  assert.ok(decoded[0] > 0.74 && decoded[0] <= 0.75);
  assert.ok(decoded[1] < -0.74 && decoded[1] >= -0.75);
});

test('PCM decoder rejects malformed odd-byte payloads', () => {
  assert.throws(() => decodePcm16Audio(btoa('\x01')), /malformed PCM audio/);
});
