import type { Config, Content, MessageNode, ReasoningEffort, Role, Session, Workspace } from '../types';

const CONFIG_KEY = 'justaichat_config';
const HISTORY_KEY = 'stupidchat_history';
const WORKSPACE_KEY = 'justaichat_workspace_v1';
const TRUNCATED_CONTENT = '[内容过长，已在本地历史中截断]';
const MISSING_IMAGE = '[图片附件仅在当前会话中可用]';

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
  catch { return fallback; }
}

function readMigratedJson<T>(key: string, legacyKey: string, fallback: T): T {
  const current = readJson<T | null>(key, null);
  if (current !== null) return current;
  const legacy = readJson<T | null>(legacyKey, null);
  if (legacy === null) return fallback;
  try { localStorage.setItem(key, JSON.stringify(legacy)); }
  catch {}
  return legacy;
}

export function createId(): string {
  return `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}
export function createSession(title = '新对话'): Session {
  const now = Date.now();
  return { id: createId(), title, createdAt: now, updatedAt: now, activeNodeId: null, nodes: [] };
}
export function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Workspace>;
  return data.version === 1 && Array.isArray(data.sessions) && data.sessions.length > 0;
}
export function loadWorkspace(): Workspace {
  const saved = readMigratedJson<unknown>(WORKSPACE_KEY, 'stupidchat_workspace_v1', null);
  if (isWorkspace(saved)) return saved;
  const legacy = readJson<{ role: Role; content: Content }[]>(HISTORY_KEY, []);
  const session = createSession(legacy.length ? '已迁移对话' : '新对话');
  for (const item of legacy) addNode(session, item.role, item.content);
  return { version: 1, activeSessionId: session.id, sessions: [session] };
}
export function loadConfig(): Config {
  const config = { baseUrl: '', apiKey: '', model: '', systemPrompt: '', temperature: 0.7,
    reasoningEffort: 'medium' as ReasoningEffort, ...readMigratedJson<Partial<Config>>(CONFIG_KEY, 'stupidchat_config', {}) };
  if (typeof config.reasoningEffort !== 'string' || !config.reasoningEffort.trim()) config.reasoningEffort = 'medium';
  return config;
}
export function saveConfig(config: Config): void { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
export function activeSession(workspace: Workspace): Session {
  let session = workspace.sessions.find(item => item.id === workspace.activeSessionId);
  if (!session) {
    session = workspace.sessions[0] || createSession();
    if (!workspace.sessions.length) workspace.sessions.push(session);
    workspace.activeSessionId = session.id;
  }
  return session;
}
export function nodePath(session: Session): MessageNode[] {
  const nodes = new Map(session.nodes.map(node => [node.id, node]));
  const path: MessageNode[] = [];
  const seen = new Set<string>();
  let node = session.activeNodeId ? nodes.get(session.activeNodeId) : undefined;
  while (node && !seen.has(node.id)) {
    path.unshift(node);
    seen.add(node.id);
    node = node.parentId ? nodes.get(node.parentId) : undefined;
  }
  return path;
}
export function buildRequestMessages(session: Session, systemPrompt: string): { role: Role | 'system'; content: Content }[] {
  const messages: { role: Role | 'system'; content: Content }[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push(...nodePath(session).map(node => ({ role: node.role, content: node.content })));
  return messages;
}
export function hasIncompleteHistory(session: Session): boolean {
  return nodePath(session).some(node => {
    const parts = typeof node.content === 'string' ? [node.content] : node.content
      .filter(part => part.type === 'text').map(part => part.text);
    return parts.some(text => text.includes(TRUNCATED_CONTENT) || text === MISSING_IMAGE);
  });
}
export function addNode(session: Session, role: Role, content: Content, id = createId()): MessageNode {
  const node: MessageNode = { id, parentId: session.activeNodeId, role, content, createdAt: Date.now() };
  session.nodes.push(node);
  session.activeNodeId = node.id;
  session.updatedAt = node.createdAt;
  if (role === 'user' && session.title === '新对话') {
    const source = typeof content === 'string' ? content : content.find(part => part.type === 'text')?.text || '图片对话';
    session.title = source.replace(/\s+/g, ' ').slice(0, 28) || '新对话';
  }
  return node;
}
export function saveWorkspace(workspace: Workspace): boolean {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
    localStorage.removeItem(HISTORY_KEY);
    return true;
  } catch { return false; }
}
export function exportWorkspace(workspace: Workspace): void {
  const data = { format: 'justaichat-memory', version: 1, exportedAt: new Date().toISOString(), workspace };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `justaichat-memory-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export async function importWorkspace(file: File, workspace: Workspace): Promise<Workspace> {
  const data: unknown = JSON.parse(await file.text());
  const wrapped = data as { format?: string; workspace?: unknown };
  const source = ['justaichat-memory', 'singleaichat-memory', 'stupidchat-memory'].includes(wrapped?.format || '') ? wrapped.workspace : data;
  if (!isWorkspace(source)) throw new Error('文件格式不正确');
  if (!source.sessions.every(item => Array.isArray(item.nodes))) throw new Error('文件格式不正确');
  const sessions = source.sessions.map(old => {
    const ids = new Map(old.nodes.map(node => [node.id, createId()]));
    const session = createSession(String(old.title || '导入对话').slice(0, 80));
    session.systemPrompt = typeof old.systemPrompt === 'string' ? old.systemPrompt : undefined;
    session.nodes = old.nodes.filter(node => node.role === 'user' || node.role === 'assistant').map(node => ({
      id: ids.get(node.id)!, parentId: node.parentId ? ids.get(node.parentId) || null : null,
      role: node.role, content: node.content, createdAt: Number(node.createdAt) || Date.now(),
      references: Array.isArray(node.references) ? node.references : []
    }));
    session.activeNodeId = old.activeNodeId ? ids.get(old.activeNodeId) || null : null;
    session.activeNodeId ||= session.nodes.at(-1)?.id || null;
    session.createdAt = Number(old.createdAt) || Date.now();
    session.updatedAt = Number(old.updatedAt) || Date.now();
    return session;
  });
  return { ...workspace, activeSessionId: sessions.at(-1)!.id, sessions: [...workspace.sessions, ...sessions] };
}
