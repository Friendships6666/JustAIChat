export function completionEndpoint(baseUrl: string, relayBaseUrl = ''): string {
  const base = (relayBaseUrl.trim() || baseUrl.trim()).replace(/\/+$/, '');
  let url: URL;
  try { url = new URL(base); }
  catch { throw new Error('请填写完整的 HTTP 或 HTTPS 接口地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('接口地址必须使用 HTTP 或 HTTPS，且不能包含用户名、密码、查询参数或片段。');
  }
  return `${base}/chat/completions`;
}
