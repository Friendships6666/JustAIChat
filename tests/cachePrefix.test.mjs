import assert from 'node:assert/strict';
import test from 'node:test';
import { makeUserContent } from '../src/lib/attachments.ts';
import { streamCompletion } from '../src/lib/api.ts';
import { addNode, buildRequestMessages, createSession, exportWorkspace, hasIncompleteHistory, saveWorkspace } from '../src/lib/workspace.ts';

test('later requests preserve the serialized prefix of prior messages', async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response('data: {"choices":[{"delta":{"content":"First answer"}}]}\n\n',
      { headers: { 'content-type': 'text/event-stream' } });
  };

  try {
    const config = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model',
      systemPrompt: 'Stable instructions', temperature: 0.7, reasoningEffort: 'medium' };
    const session = createSession();
    session.systemPrompt = config.systemPrompt;
    const image = { name: 'image.png', size: 3, isImage: true, data: 'data:image/png;base64,AAA', ext: 'png' };
    addNode(session, 'user', makeUserContent('Describe this', [image]));
    const first = await streamCompletion(config, buildRequestMessages(session, session.systemPrompt),
      new AbortController().signal, () => {}, () => {}, () => {});

    addNode(session, 'assistant', first);
    addNode(session, 'user', 'Continue');
    session.title = 'Changed UI title';
    session.updatedAt = Date.now();
    config.systemPrompt = 'Changed global instructions';
    await streamCompletion(config, buildRequestMessages(session, session.systemPrompt),
      new AbortController().signal, () => {}, () => {}, () => {});

    assert.equal(JSON.stringify(bodies[1].messages.slice(0, bodies[0].messages.length)),
      JSON.stringify(bodies[0].messages));
    assert.deepEqual(bodies[1].messages.map(message => message.role),
      ['system', 'user', 'assistant', 'user']);
    assert.equal(bodies[1].messages[0].content, 'Stable instructions');
    assert.equal(bodies[1].messages[1].content[1].image_url.url, image.data);
    assert.equal(hasIncompleteHistory(session), false);
    const oldSession = structuredClone(session);
    oldSession.nodes[0].content[1] = { type: 'text', text: '[图片附件仅在当前会话中可用]' };
    assert.equal(hasIncompleteHistory(oldSession), true);
    assert.deepEqual(Object.keys(bodies[1]),
      ['model', 'messages', 'temperature', 'reasoning_effort', 'stream', 'stream_options']);
    assert.doesNotMatch(JSON.stringify(bodies[1]), /Changed UI title|createdAt|updatedAt|connectionLogs/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('local storage preserves image content without conversion', () => {
  const originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  try {
    const session = createSession();
    const imageData = 'data:image/png;base64,AAAA';
    addNode(session, 'user', [{ type: 'text', text: 'Image' },
      { type: 'image_url', image_url: { url: imageData } }]);
    assert.equal(saveWorkspace({ version: 1, activeSessionId: session.id, sessions: [session] }), true);
    assert.equal(JSON.parse(values.get('justaichat_workspace_v1')).sessions[0].nodes[0].content[1].image_url.url, imageData);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('exports original image content without replacing it with a placeholder', async () => {
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let exportedBlob;
  const link = { click() {} };
  globalThis.document = { createElement: () => link };
  URL.createObjectURL = blob => { exportedBlob = blob; return 'blob:memory'; };
  URL.revokeObjectURL = () => {};
  try {
    const session = createSession();
    const imageData = 'data:image/png;base64,AAAA';
    addNode(session, 'user', [{ type: 'text', text: 'Image' },
      { type: 'image_url', image_url: { url: imageData } }]);
    exportWorkspace({ version: 1, activeSessionId: session.id, sessions: [session] });
    const exported = JSON.parse(await exportedBlob.text());
    assert.equal(exported.format, 'justaichat-memory');
    assert.match(link.download, /^justaichat-memory-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(exported.workspace.sessions[0].nodes[0].content[1].image_url.url, imageData);
    await new Promise(resolve => setTimeout(resolve, 0));
  } finally {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
