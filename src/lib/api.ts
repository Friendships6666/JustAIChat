import type { Config, Content, Role, Usage } from '../types';
import { completionEndpoint } from './apiEndpoint.ts';

interface ApiMessage { role: Role | 'system'; content: Content }
interface Chunk {
  id?: string;
  model?: string;
  system_fingerprint?: string;
  choices?: { delta?: { content?: string } }[];
  usage?: Usage;
}

export async function streamCompletion(
  config: Config, messages: ApiMessage[], signal: AbortSignal,
  onContent: (value: string) => void, onUsage: (usage: Usage) => void,
  onStatus: (stage: string, detail: string) => void = () => {}
): Promise<string> {
  const endpoint = completionEndpoint(config.baseUrl, config.relayBaseUrl);
  const body = JSON.stringify({ model: config.model, messages, temperature: config.temperature,
    reasoning_effort: config.reasoningEffort,
    stream: true, stream_options: { include_usage: true } });
  onStatus('握手', 'POST /chat/completions · 等待响应头');
  onStatus('PAYLOAD', `${new TextEncoder().encode(body).byteLength} B · SSE 流式响应`);
  onStatus('ROUTE', config.relayBaseUrl?.trim() ? '使用用户配置的转发服务' : '浏览器直接连接接口');
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey || ''}` },
      body,
      signal
    });
  } catch (error) {
    if (signal.aborted || !(error instanceof TypeError)) throw error;
    throw new Error('请求未能连接。可能是网络、证书或跨域限制，请查看浏览器控制台确认。纯静态页面无法绕过跨域限制；请使用允许本站访问的接口，或手动配置可信转发服务。');
  }
  onStatus('HTTP', `${response.status} ${response.statusText || ''}`.trim());
  onStatus('协商', response.headers.get('content-type') || '未提供 Content-Type');
  for (const [header, label] of [
    ['x-request-id', 'Request ID'],
    ['cf-ray', 'Edge ID'], ['server-timing', 'Server Timing'],
    ['x-ratelimit-remaining-requests', '剩余请求'],
    ['x-ratelimit-remaining-tokens', '剩余 Token']
  ]) {
    const value = response.headers.get(header);
    if (value) onStatus('META', `${label}: ${value}`);
  }
  if (!response.ok) throw new Error(`[HTTP ${response.status}] ${await response.text()}`);
  if (response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new Error('请求地址返回了网页，而不是聊天数据。请确认接口路径正确；转发地址需要真实的后端服务，不能只填写静态页面地址。');
  }
  if (!response.body) throw new Error('响应不支持流式读取');
  onStatus('STREAM', '响应体已连接 · 等待首个数据帧');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let eventLines: string[] = [];
  let firstFrame = true;
  let firstEvent = true;
  const dispatch = () => {
    if (!eventLines.length) return;
    const data = eventLines.join('\n');
    eventLines = [];
    if (data === '[DONE]') return;
    try {
      const chunk = JSON.parse(data) as Chunk;
      if (firstEvent) {
        firstEvent = false;
        onStatus('SSE', '首个事件已解码');
        if (chunk.model) onStatus('MODEL', chunk.model);
        if (chunk.id) onStatus('EVENT', chunk.id);
        if (chunk.system_fingerprint) onStatus('META', `Fingerprint: ${chunk.system_fingerprint}`);
      }
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) { content += delta; onContent(content); }
      if (chunk.usage) onUsage(chunk.usage);
    } catch { /* Ignore malformed server events. */ }
  };
  const consume = (line: string) => {
    if (!line.trim()) dispatch();
    else if (line.startsWith('data:')) eventLines.push(line.slice(5).trimStart());
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstFrame) {
      firstFrame = false;
      onStatus('RX', `首帧 ${value.byteLength} B`);
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.forEach(consume);
  }
  buffer += decoder.decode();
  if (buffer) consume(buffer);
  dispatch();
  return content;
}
