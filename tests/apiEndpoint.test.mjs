import assert from 'node:assert/strict';
import test from 'node:test';
import { completionEndpoint } from '../src/lib/apiEndpoint.ts';

test('connects directly without provider-specific routing', () => {
  assert.equal(completionEndpoint('https://api.example.com/v1'), 'https://api.example.com/v1/chat/completions');
  assert.equal(completionEndpoint('  https://api.example.com/v1/// '), 'https://api.example.com/v1/chat/completions');
});

test('uses a relay only when explicitly configured by the user', () => {
  assert.equal(completionEndpoint('https://api.example.com/v1', ' https://relay.example.com/v1/// '), 'https://relay.example.com/v1/chat/completions');
  assert.equal(completionEndpoint('https://api.example.com/v1', ' '), 'https://api.example.com/v1/chat/completions');
});

test('rejects invalid URLs and credentials in request addresses', () => {
  for (const address of ['', '/local-proxy', 'file:///tmp/api', 'javascript:alert(1)',
    'https://user:password@example.com/v1', 'https://api.example.com/v1?key=secret', 'https://api.example.com/v1#fragment']) {
    assert.throws(() => completionEndpoint(address));
    assert.throws(() => completionEndpoint('https://api.example.com/v1', address || 'invalid'));
  }
});
