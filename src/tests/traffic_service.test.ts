import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearTrafficCache,
  getSegmentTrafficSpeed,
  getTrafficFeedStatus
} from '../services/trafficService';

test('TomTom status reflects successful responses and traffic coordinates stay latitude-longitude', async () => {
  const originalFetch = globalThis.fetch;
  const previousTomTomKey = process.env.TOMTOM_API_KEY;
  const previousTrafficKey = process.env.TRAFFIC_API_KEY;
  let requestedUrl = '';

  delete process.env.TOMTOM_API_KEY;
  delete process.env.TRAFFIC_API_KEY;
  clearTrafficCache();

  try {
    assert.equal(getTrafficFeedStatus().isLiveActive, false);

    process.env.TOMTOM_API_KEY = 'test-key';
    assert.equal(getTrafficFeedStatus().isLiveActive, false, 'A configured key alone is not live traffic');

    globalThis.fetch = async input => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        flowSegmentData: {
          currentSpeed: 22,
          freeFlowSpeed: 40,
          confidence: 0.9
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const liveSpeed = await getSegmentTrafficSpeed(
      'TEST_ROAD',
      'primary',
      40,
      [[18.5, 73.85]]
    );
    assert.equal(liveSpeed.isLive, true);
    assert.equal(new URL(requestedUrl).searchParams.get('point'), '18.5,73.85');
    assert.equal(getTrafficFeedStatus().isLiveActive, true);
    assert.ok(getTrafficFeedStatus().lastSuccessfulUpdate);

    clearTrafficCache();
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    const fallback = await getSegmentTrafficSpeed(
      'FAILED_ROAD',
      'primary',
      40,
      [[18.5, 73.85]]
    );
    assert.equal(fallback.isLive, false);
    assert.equal(getTrafficFeedStatus().isLiveActive, false);
    assert.ok(getTrafficFeedStatus().lastChecked);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousTomTomKey === undefined) delete process.env.TOMTOM_API_KEY;
    else process.env.TOMTOM_API_KEY = previousTomTomKey;
    if (previousTrafficKey === undefined) delete process.env.TRAFFIC_API_KEY;
    else process.env.TRAFFIC_API_KEY = previousTrafficKey;
    clearTrafficCache();
  }
});
