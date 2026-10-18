import assert from 'node:assert/strict';
import test from 'node:test';
import { loadExactWorkspace, saveExactWorkspace } from '../src/lib/exactWorkspace.ts';
import { addNode, createSession } from '../src/lib/workspace.ts';

function mockIndexedDB(databases = new Map()) {
  return {
    open(name) {
      if (!databases.has(name)) databases.set(name, new Map());
      const records = databases.get(name);
      const request = {};
      queueMicrotask(() => {
        request.result = {
          createObjectStore() {},
          close() {},
          transaction() {
            const transaction = {
              objectStore() {
                return {
                  put(value, key) {
                    records.set(key, structuredClone(value));
                    queueMicrotask(() => transaction.oncomplete());
                  },
                  get(key) {
                    const result = { result: structuredClone(records.get(key)) };
                    queueMicrotask(() => transaction.oncomplete());
                    return result;
                  }
                };
              }
            };
            return transaction;
          }
        };
        request.onupgradeneeded?.();
        request.onsuccess();
      });
      return request;
    }
  };
}

test('restores exact image and long-text history from IndexedDB', async () => {
  const originalIndexedDB = globalThis.indexedDB;
  const databases = new Map();
  globalThis.indexedDB = mockIndexedDB(databases);

  try {
    const session = createSession();
    const imageData = 'data:image/png;base64,AAAA';
    const longText = 'long text '.repeat(7000);
    addNode(session, 'user', [{ type: 'text', text: longText },
      { type: 'image_url', image_url: { url: imageData } }]);
    const workspace = { version: 1, activeSessionId: session.id, sessions: [session] };
    const saving = saveExactWorkspace(workspace);
    session.nodes[0].content[1].image_url.url = 'changed after save';
    await saving;
    assert.ok(databases.has('justaichat-history'));

    const restored = await loadExactWorkspace();
    assert.equal(restored.sessions[0].nodes[0].content[0].text, longText);
    assert.equal(restored.sessions[0].nodes[0].content[1].image_url.url, imageData);
  } finally {
    globalThis.indexedDB = originalIndexedDB;
  }
});

test('loads legacy IndexedDB history and gives the new database priority after migration', async () => {
  const originalIndexedDB = globalThis.indexedDB;
  const session = createSession();
  addNode(session, 'user', 'Original exact history');
  const legacy = { version: 1, activeSessionId: session.id, sessions: [session] };
  const databases = new Map([['singleaichat-history', new Map([['active', legacy]])]]);
  globalThis.indexedDB = mockIndexedDB(databases);
  try {
    const restored = await loadExactWorkspace();
    assert.deepEqual(restored, legacy);
    restored.sessions[0].title = 'Updated in JustAIChat';
    await saveExactWorkspace(restored);
    assert.deepEqual(await loadExactWorkspace(), restored);
    assert.equal(databases.get('singleaichat-history').get('active').sessions[0].title, legacy.sessions[0].title);
  } finally {
    globalThis.indexedDB = originalIndexedDB;
  }
});
