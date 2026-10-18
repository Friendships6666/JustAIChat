import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
const { renderMarkdown } = await import('../src/lib/markdown.ts');

function rendered(source) {
  const root = dom.window.document.createElement('div');
  root.innerHTML = renderMarkdown(source);
  return root;
}

test('renders the reported standalone square-bracket equation', () => {
  const root = rendered('[\nx^2+1=(x-i)(x+i).\n]');
  assert.equal(root.querySelectorAll('.katex-display').length, 1);
  assert.match(root.querySelector('.katex-html').textContent, /x.*2.*\+.*1.*=.*x.*i/);
  assert.equal(root.querySelector('.katex-error'), null);
});

test('renders all supported math delimiters without losing surrounding text', () => {
  for (const source of [
    '$x^2+1$', '\\(x^2+1\\)', '$$x^2+1$$', '\\[x^2+1\\]',
    '\\[\nx^2+1\n\\]', '\\begin{equation}x^2+1\\end{equation}',
    'Before\n[\nx^2+1\n]\nAfter', 'Before \\[x^2+1\\] After'
  ]) {
    const root = rendered(source);
    assert.ok(root.querySelector('.katex-html'), source);
    assert.equal(root.querySelector('.katex-error'), null, source);
    if (source.startsWith('Before')) {
      assert.match(root.textContent, /Before/);
      assert.match(root.textContent, /After/);
    }
  }
});

test('supports multiline equations with blank lines and blockquotes', () => {
  for (const source of ['[\nx^2\n\n+1=(x-i)(x+i)\n]', '> [\n> x^2+1\n> ]']) {
    assert.ok(rendered(source).querySelector('.katex-display'), source);
  }
});

test('leaves ordinary brackets, links, and code unchanged', () => {
  for (const source of [
    '[ordinary text]', '[\nordinary text\n]', '[label](https://example.com)',
    '`[x^2+1]`', '```tex\n[\nx^2+1\n]\n```', '    [\n    x^2+1\n    ]',
    '[\nx^2+1', '[\n\\unknowncommand{x}\n]'
  ]) {
    assert.equal(rendered(source).querySelector('.katex'), null, source);
  }
  assert.equal(rendered('[label](https://example.com)').querySelector('a').href, 'https://example.com/');
});

test('continues sanitizing untrusted content alongside math', () => {
  const root = rendered('<img src="x" onerror="alert(1)"><script>alert(1)</script>\n\n[\nx^2+1\n]');
  assert.equal(root.querySelector('script, [onerror]'), null);
  assert.ok(root.querySelector('.katex-html'));
});
