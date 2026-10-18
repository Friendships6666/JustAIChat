import assert from 'node:assert/strict';
import test from 'node:test';
import { completedMarkdownOffset } from '../src/lib/streamingMarkdown.ts';

test('completes paragraphs at blank lines and headings at line endings', () => {
  assert.equal(completedMarkdownOffset('First line\nsecond line'), 0);
  assert.equal(completedMarkdownOffset('First paragraph\n\nNext'), 'First paragraph\n\n'.length);
  assert.equal(completedMarkdownOffset('# Heading\nNext'), '# Heading\n'.length);
});

test('keeps fenced code together, including internal blank lines', () => {
  const open = 'Before\n\n```js\nconst x = 1;\n\nconst y = 2;\n';
  assert.equal(completedMarkdownOffset(open), 'Before\n\n'.length);
  assert.equal(completedMarkdownOffset(`${open}\n\`\`\``), open.length + '\n```'.length);
});

test('finishes preceding text when a code fence starts', () => {
  assert.equal(completedMarkdownOffset('Intro\n```js\ncode'), 'Intro\n'.length);
});

test('keeps display math together across blank lines and completes at its closing delimiter', () => {
  for (const [opening, closing] of [['[', ']'], ['\\[', '\\]'], ['$$', '$$']]) {
    const prefix = 'Intro\n\n';
    const formula = `${opening}\nx^2 + 1\n\n= (x-i)(x+i).\n`;
    assert.equal(completedMarkdownOffset(prefix + formula), prefix.length);
    const complete = prefix + formula + closing;
    assert.equal(completedMarkdownOffset(complete), complete.length);
    assert.equal(completedMarkdownOffset(complete + '\nNext'), complete.length + 1);
  }
});

test('does not interpret math delimiters inside fenced code', () => {
  const source = '```text\n[\nx^2\n]\n\n';
  assert.equal(completedMarkdownOffset(source), 0);
  assert.equal(completedMarkdownOffset(source + '```'), source.length + 3);
});
