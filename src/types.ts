export type Role = 'user' | 'assistant';
export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type Content = string | ContentPart[];
export interface MessageNode { id: string; parentId: string | null; role: Role; content: Content; createdAt: number; references?: unknown[] }
export interface Session { id: string; title: string; createdAt: number; updatedAt: number; activeNodeId: string | null; nodes: MessageNode[]; systemPrompt?: string }
export interface Workspace { version: 1; activeSessionId: string; sessions: Session[] }
export type ReasoningEffort = string;
export interface Config { baseUrl: string; relayBaseUrl?: string; apiKey: string; model: string; systemPrompt: string; temperature: number; reasoningEffort: ReasoningEffort }
export interface Attachment { name: string; size: number; isImage: boolean; data: string; ext: string }
export interface Usage { prompt_tokens: number; completion_tokens: number; total_tokens: number }
