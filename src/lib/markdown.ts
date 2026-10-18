import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

const md: MarkdownIt = new MarkdownIt({
  html: true, breaks: true, linkify: true,
  highlight(str, lang): string {
    const language = md.utils.escapeHtml(lang || '');
    if (lang && hljs.getLanguage(lang)) {
      try { return `<pre class="hljs" data-language="${language}"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`; }
      catch { /* Fall back to escaped text. */ }
    }
    return `<pre class="hljs" data-language="${language}"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  }
}).use(texmath, { engine: katex, delimiters: ['dollars', 'brackets', 'beg_end'], katexOptions: { throwOnError: false } });

md.block.ruler.before('fence', 'bracket_math_block', (state, startLine, endLine, silent) => {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const opening = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine]).trim();
  if (opening !== '[' && opening !== '\\[') return false;
  const closing = opening === '[' ? ']' : '\\]';
  const lines: string[] = [];
  for (let line = startLine + 1; line < endLine; line++) {
    const source = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    if (source.trim() !== closing) { lines.push(source); continue; }
    const formula = lines.join('\n').trim();
    if (!formula || (opening === '[' && !/[\\^_=+*/<>-]/.test(formula))) return false;
    if (opening === '[') {
      try { katex.renderToString(formula, { displayMode: true, throwOnError: true }); }
      catch { return false; }
    }
    if (silent) return true;
    const token = state.push('bracket_math_block', 'math', 0);
    token.block = true;
    token.content = formula;
    token.map = [startLine, line + 1];
    state.line = line + 1;
    return true;
  }
  return false;
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

md.renderer.rules.bracket_math_block = (tokens, index) =>
  `<section>${katex.renderToString(tokens[index].content, { displayMode: true, throwOnError: false })}</section>\n`;

md.inline.ruler.before('escape', 'bracket_math_inline_display', (state, silent) => {
  if (!state.src.startsWith('\\[', state.pos)) return false;
  const end = state.src.indexOf('\\]', state.pos + 2);
  if (end < 0 || end + 2 > state.posMax) return false;
  if (!silent) {
    const token = state.push('bracket_math_inline_display', 'math', 0);
    token.content = state.src.slice(state.pos + 2, end);
  }
  state.pos = end + 2;
  return true;
});

md.renderer.rules.bracket_math_inline_display = (tokens, index) =>
  katex.renderToString(tokens[index].content, { displayMode: true, throwOnError: false });

export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(md.render(text));
}
