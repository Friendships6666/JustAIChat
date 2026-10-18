export function completedMarkdownOffset(text: string): number {
  let completed = 0;
  let offset = 0;
  let fence: { marker: string; length: number } | null = null;
  let mathClosing: string | null = null;

  while (offset < text.length) {
    const newline = text.indexOf('\n', offset);
    const end = newline < 0 ? text.length : newline + 1;
    const line = text.slice(offset, newline < 0 ? end : newline);
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];

    if (fence) {
      if (marker && marker[0] === fence.marker && marker.length >= fence.length
        && line.slice(line.indexOf(marker) + marker.length).trim() === '') {
        fence = null;
        completed = end;
      }
    } else if (mathClosing) {
      if (line.trim() === mathClosing) {
        mathClosing = null;
        completed = end;
      }
    } else if (marker) {
      completed = offset;
      fence = { marker: marker[0], length: marker.length };
    } else if (['[', '\\[', '$$'].includes(line.trim())) {
      completed = offset;
      mathClosing = line.trim() === '[' ? ']' : line.trim() === '\\[' ? '\\]' : '$$';
    } else if (newline >= 0 && (line.trim() === '' || /^ {0,3}#{1,6}(?:\s|$)/.test(line))) {
      completed = end;
    }

    offset = end;
  }

  return completed;
}
