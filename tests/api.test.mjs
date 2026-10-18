import assert from 'node:assert/strict';
import test from 'node:test';
import { streamCompletion } from '../src/lib/api.ts';

test('reports observable connection stages and response metadata', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    'data: {"id":"evt-1","model":"test-model","choices":[{"delta":{"content":"Hello"}}]}\n\n',
    { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req-123' } }
  );
  const statuses = [];
  const contents = [];
  try {
    const result = await streamCompletion(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret-key', model: 'test-model',
        systemPrompt: '', temperature: 0.7, reasoningEffort: 'medium' },
      [{ role: 'user', content: 'Hi' }], new AbortController().signal,
      value => contents.push(value), () => {}, (stage, detail) => statuses.push(`${stage} ${detail}`)
    );
    assert.equal(result, 'Hello');
    assert.deepEqual(contents, ['Hello']);
    assert.match(statuses.join('\n'), /握手.*等待响应头/);
    assert.match(statuses.join('\n'), /PAYLOAD \d+ B · SSE 流式响应/);
    assert.match(statuses.join('\n'), /HTTP 200/);
    assert.match(statuses.join('\n'), /text\/event-stream/);
    assert.match(statuses.join('\n'), /Request ID: req-123/);
    assert.match(statuses.join('\n'), /首帧/);
    assert.match(statuses.join('\n'), /MODEL test-model/);
    assert.doesNotMatch(statuses.join('\n'), /secret-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sends ultra and model-specific reasoning effort names unchanged', async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response('data: [DONE]\n\n');
  };
  try {
    for (const reasoningEffort of ['ultra', 'model-specific-level']) {
      await streamCompletion(
        { baseUrl: 'https://example.test/v1', apiKey: '', model: 'test-model',
          systemPrompt: '', temperature: 0.7, reasoningEffort },
        [{ role: 'user', content: 'Hi' }], new AbortController().signal,
        () => {}, () => {}
      );
    }
    assert.deepEqual(sent.map(body => body.reasoning_effort), ['ultra', 'model-specific-level']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses only the explicitly configured relay and preserves the request payload', async () => {
  const originalFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, options };
    return new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n');
  };
  try {
    const config = { baseUrl: 'https://api.example.com/v1', relayBaseUrl: 'https://relay.example.com/v1/',
      apiKey: 'test-secret', model: 'test-model', systemPrompt: '', temperature: 0.7, reasoningEffort: 'medium' };
    const messages = [{ role: 'user', content: 'Hi' }];
    const statuses = [];
    const result = await streamCompletion(config, messages, new AbortController().signal,
      () => {}, () => {}, (stage, detail) => statuses.push(`${stage} ${detail}`));
    assert.equal(result, 'OK');
    assert.equal(sent.url, 'https://relay.example.com/v1/chat/completions');
    assert.equal(sent.options.headers.Authorization, 'Bearer test-secret');
    assert.deepEqual(JSON.parse(sent.options.body).messages, messages);
    assert.match(statuses.join('\n'), /用户配置的转发/);
    assert.doesNotMatch(statuses.join('\n'), /test-secret/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('explains ambiguous network failures without automatically retrying through another service', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    throw new TypeError('Failed to fetch');
  };
  try {
    await assert.rejects(streamCompletion(
      { baseUrl: 'https://api.example.com/v1', apiKey: '', model: 'test-model', systemPrompt: '',
        temperature: 0.7, reasoningEffort: 'medium' },
      [{ role: 'user', content: 'Hi' }], new AbortController().signal, () => {}, () => {}
    ), /可能是网络、证书或跨域限制/);
    assert.deepEqual(requests, ['https://api.example.com/v1/chat/completions']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preserves cancellation instead of misreporting it as a network failure', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const aborted = new DOMException('Stopped', 'AbortError');
  globalThis.fetch = async () => { controller.abort(); throw aborted; };
  try {
    await assert.rejects(streamCompletion(
      { baseUrl: 'https://api.example.com/v1', apiKey: '', model: 'test-model', systemPrompt: '',
        temperature: 0.7, reasoningEffort: 'medium' },
      [{ role: 'user', content: 'Hi' }], controller.signal, () => {}, () => {}
    ), error => error === aborted);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects static HTML fallback pages rather than treating them as an empty chat response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!doctype html><title>Static page</title>',
    { headers: { 'content-type': 'text/html; charset=utf-8' } });
  try {
    await assert.rejects(streamCompletion(
      { baseUrl: 'https://api.example.com/v1', relayBaseUrl: 'https://relay.example.com/v1',
        apiKey: '', model: 'test-model', systemPrompt: '', temperature: 0.7, reasoningEffort: 'medium' },
      [{ role: 'user', content: 'Hi' }], new AbortController().signal, () => {}, () => {}
    ), /真实的后端服务/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
