import assert from 'node:assert/strict';
import test from 'node:test';
import { addNode, createSession, importWorkspace, loadConfig, loadWorkspace, saveConfig } from '../src/lib/workspace.ts';

function workspaceWithMessage() {
  const session = createSession();
  addNode(session, 'user', 'Original conversation');
  return { version: 1, activeSessionId: session.id, sessions: [session] };
}

test('migrates old configuration and workspace without losing data', () => {
  const originalStorage = globalThis.localStorage;
  const workspace = workspaceWithMessage();
  const config = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  const values = new Map([
    ['stupidchat_config', JSON.stringify(config)],
    ['stupidchat_workspace_v1', JSON.stringify(workspace)]
  ]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    assert.equal(loadConfig().apiKey, config.apiKey);
    assert.deepEqual(loadWorkspace(), workspace);
    assert.deepEqual(JSON.parse(values.get('justaichat_config')), config);
    assert.deepEqual(JSON.parse(values.get('justaichat_workspace_v1')), workspace);
    saveConfig({ ...loadConfig(), model: 'new-model', relayBaseUrl: 'https://relay.example.com/v1' });
    assert.equal(loadConfig().model, 'new-model');
    assert.equal(loadConfig().relayBaseUrl, 'https://relay.example.com/v1');
    const newerWorkspace = workspaceWithMessage();
    values.set('justaichat_workspace_v1', JSON.stringify(newerWorkspace));
    assert.deepEqual(loadWorkspace(), newerWorkspace);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('legacy configuration remains readable when migration cannot write storage', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => key === 'stupidchat_config' ? '{"model":"legacy-model"}' : null,
    setItem() { throw new Error('Quota exceeded'); }
  };
  try { assert.equal(loadConfig().model, 'legacy-model'); }
  finally { globalThis.localStorage = originalStorage; }
});

test('imports both JustAIChat memory and legacy memory formats', async () => {
  const original = workspaceWithMessage();
  for (const format of ['justaichat-memory', 'singleaichat-memory', 'stupidchat-memory']) {
    const file = new File([JSON.stringify({ format, workspace: original })], 'memory.json');
    const imported = await importWorkspace(file, workspaceWithMessage());
    assert.equal(imported.sessions.length, 2);
    assert.equal(imported.sessions[1].nodes[0].content, 'Original conversation');
    assert.notEqual(imported.sessions[1].id, original.sessions[0].id);
  }
});

test('a completed response preserves its streaming message identity', () => {
  const session = createSession();
  addNode(session, 'user', 'Question');
  const node = addNode(session, 'assistant', 'Answer', 'streaming-response');
  assert.equal(node.id, 'streaming-response');
  assert.equal(session.activeNodeId, node.id);
  assert.equal(session.nodes.length, 2);
});
