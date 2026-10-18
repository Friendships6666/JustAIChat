<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Plus, PanelLeft, Download, Upload, Trash2, Settings, X } from 'lucide-svelte';
  import ChatMessage from './components/ChatMessage.svelte';
  import Composer from './components/Composer.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import { streamCompletion } from './lib/api';
  import { completionEndpoint } from './lib/apiEndpoint';
  import { makeUserContent, readAttachments } from './lib/attachments';
  import { loadExactWorkspace, saveExactWorkspace } from './lib/exactWorkspace';
  import { activeSession, addNode, buildRequestMessages, createId, createSession, exportWorkspace, hasIncompleteHistory, importWorkspace, loadConfig, loadWorkspace, nodePath, saveConfig, saveWorkspace } from './lib/workspace';
  import type { Attachment, Config, Usage, Workspace } from './types';

  let config: Config = loadConfig();
  let workspace: Workspace = loadWorkspace();
  let attachments: Attachment[] = [];
  let usage: Usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let settingsOpen = false;
  let sidebarOpen = true;
  let restoringHistory = true;
  let persistingMessage = false;
  let exactStorageError = false;
  let generating = false;
  let streaming = '';
  let streamingSessionId: string | null = null;
  let streamingMessageId: string | null = null;
  let connectionLogs: { elapsed: number; stage: string; detail: string }[] = [];
  let connectionElapsed = 0;
  let connectionStartedAt = 0;
  let logClock: ReturnType<typeof setInterval> | null = null;
  let requestError: { sessionId: string; message: string; logs: typeof connectionLogs; elapsed: number } | null = null;
  let requestController: AbortController | null = null;
  let importInput: HTMLInputElement;
  let chatBox: HTMLElement;
  $: session = activeSession(workspace);
  $: messages = nodePath(session);
  $: displayedMessages = streamingSessionId === session.id && streamingMessageId && !messages.some(node => node.id === streamingMessageId)
    ? [...messages, { id: streamingMessageId, role: 'assistant' as const, content: streaming }]
    : messages;
  $: sessions = [...workspace.sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  onMount(() => {
    void loadExactWorkspace().then(saved => {
      if (saved) workspace = saved;
      void saveExactWorkspace(workspace).catch(() => exactStorageError = true);
    }).catch(() => exactStorageError = true).finally(() => restoringHistory = false);
    if (matchMedia('(max-width: 899px)').matches) sidebarOpen = false;
    if (!config.baseUrl || !config.model) setTimeout(() => settingsOpen = true, 300);
    const prevent = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => { event.preventDefault(); if (event.dataTransfer?.files.length) addFiles(event.dataTransfer.files); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', drop); requestController?.abort(); stopLogClock(); };
  });
  async function scrollBottom() { await tick(); chatBox?.scrollTo({ top: chatBox.scrollHeight }); }
  function refresh(scroll = false) {
    workspace = { ...workspace };
    saveWorkspace(workspace);
    const saved = saveExactWorkspace(workspace).then(() => { exactStorageError = false; })
      .catch(() => { exactStorageError = true; });
    if (scroll) scrollBottom();
    return saved;
  }
  function stopLogClock() { if (logClock) clearInterval(logClock); logClock = null; }
  function logConnection(stage: string, detail: string) {
    connectionElapsed = Math.round(performance.now() - connectionStartedAt);
    connectionLogs = [...connectionLogs, { elapsed: connectionElapsed, stage, detail }].slice(-16);
  }
  async function addFiles(files: FileList | File[]) {
    try { attachments = [...attachments, ...await readAttachments(files)]; }
    catch (error) { alert(`读取附件失败：${error instanceof Error ? error.message : String(error)}`); }
  }
  function resetUsage() { usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }; }
  function newChat() {
    if (restoringHistory) return;
    workspace.sessions.push(createSession());
    workspace.activeSessionId = workspace.sessions.at(-1)!.id;
    resetUsage(); refresh(true);
    if (matchMedia('(max-width: 899px)').matches) sidebarOpen = false;
  }
  function selectSession(id: string) {
    if (restoringHistory) return;
    workspace.activeSessionId = id; resetUsage(); refresh(true);
    if (matchMedia('(max-width: 899px)').matches) sidebarOpen = false;
  }
  function deleteChat() {
    if (restoringHistory) return;
    if (!confirm(`确认删除“${session.title}”？`)) return;
    if (streamingSessionId === session.id) requestController?.abort();
    workspace.sessions = workspace.sessions.filter(item => item.id !== session.id);
    if (!workspace.sessions.length) workspace.sessions.push(createSession());
    workspace.activeSessionId = workspace.sessions[0].id;
    resetUsage(); refresh(true);
  }
  async function handleImport(file: File) {
    if (restoringHistory) return;
    try { workspace = await importWorkspace(file, workspace); resetUsage(); refresh(true); }
    catch (error) { alert(`导入失败：${error instanceof Error ? error.message : String(error)}`); }
    importInput.value = '';
  }
  async function send(text: string) {
    if (restoringHistory || persistingMessage) return;
    if (!config.baseUrl || !config.model) { settingsOpen = true; return; }
    if (hasIncompleteHistory(session)) return;
    requestError = null;
    const current = session;
    current.systemPrompt ??= config.systemPrompt;
    const content = makeUserContent(text, attachments);
    addNode(current, 'user', content);
    attachments = [];
    persistingMessage = true;
    await refresh(true);
    persistingMessage = false;
    generating = true;
    streaming = '';
    connectionLogs = [];
    connectionElapsed = 0;
    streamingSessionId = current.id;
    const responseId = createId();
    streamingMessageId = responseId;
    requestController = new AbortController();
    const requestMessages = buildRequestMessages(current, current.systemPrompt);
    connectionStartedAt = performance.now();
    let endpoint = '自定义端点';
    try { const url = new URL(completionEndpoint(config.baseUrl, config.relayBaseUrl)); endpoint = `${url.host}${url.pathname}`; }
    catch { /* fetch will report an invalid URL. */ }
    logConnection('TARGET', endpoint);
    logConnection('MODEL', config.model);
    logConnection('CONFIG', `${requestMessages.length} 条消息 · temperature ${config.temperature} · effort ${config.reasoningEffort}`);
    logClock = setInterval(() => connectionElapsed = Math.round(performance.now() - connectionStartedAt), 100);
    try {
      const response = await streamCompletion(config, requestMessages, requestController.signal,
        value => {
          if (!streaming) { connectionLogs = []; stopLogClock(); }
          streaming = value;
        }, value => usage = value,
        (stage, detail) => { if (!streaming) logConnection(stage, detail); });
      addNode(current, 'assistant', response, responseId);
      await refresh();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (streaming) { addNode(current, 'assistant', streaming, responseId); await refresh(); }
      } else {
        requestError = { sessionId: current.id, message: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
          logs: connectionLogs, elapsed: connectionElapsed };
      }
    } finally {
      stopLogClock();
      generating = false;
      streamingSessionId = null;
      streamingMessageId = null;
      requestController = null;
    }
  }
</script>

<div class:sidebar-hidden={!sidebarOpen} class="app-shell">
  <header class="topbar">
    <div class="brand-group"><span class="brand"><img class="brand-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt=""/>JustAIChat</span><span class="model-badge" title={config.model}>{config.model || '未设置模型'}</span><span class="host-badge" title={config.baseUrl}>{config.baseUrl ? `(${config.baseUrl})` : '(无 API 接口)'}</span></div>
    <div class="toolbar">
      <button class="icon-button" title="新建对话" aria-label="新建对话" disabled={restoringHistory} onclick={newChat}><Plus size={18}/></button>
      <button class="icon-button" title="会话列表" aria-label="会话列表" onclick={() => sidebarOpen = !sidebarOpen}><PanelLeft size={18}/></button>
      <button class="icon-button" title="导出记忆" aria-label="导出记忆" disabled={restoringHistory} onclick={() => exportWorkspace(workspace)}><Download size={18}/></button>
      <button class="icon-button" title="导入记忆" aria-label="导入记忆" disabled={restoringHistory} onclick={() => importInput.click()}><Upload size={18}/></button>
      <input bind:this={importInput} type="file" accept="application/json,.json" hidden onchange={event => { if (event.currentTarget.files?.[0]) handleImport(event.currentTarget.files[0]); }} />
      <button class="icon-button danger" title="删除当前对话" aria-label="删除当前对话" disabled={restoringHistory} onclick={deleteChat}><Trash2 size={18}/></button>
      <button class="settings-button" title="配置 API" onclick={() => settingsOpen = true}><Settings size={16}/><span>配置 API</span></button>
    </div>
  </header>
  {#if sidebarOpen}<aside class="sidebar"><div class="sidebar-heading"><span>会话列表</span><button class="icon-button" title="关闭会话列表" aria-label="关闭会话列表" onclick={() => sidebarOpen = false}><X size={17}/></button></div><nav aria-label="会话列表">{#each sessions as item (item.id)}<button class:active={item.id === session.id} disabled={restoringHistory} title={item.title} onclick={() => selectSession(item.id)}>{item.title || '未命名对话'}</button>{/each}</nav></aside>{/if}
  <main bind:this={chatBox} class="chat-box">
    {#if !messages.length && streamingSessionId !== session.id}<div class="welcome"><img class="welcome-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="JustAIChat 标志"/><h1>JustAIChat</h1><button class="primary-button" onclick={() => settingsOpen = true}>立即前往配置 API</button></div>{/if}
    {#each displayedMessages as node (node.id)}<ChatMessage role={node.role} content={node.content} streaming={node.id === streamingMessageId && generating} {connectionLogs} {connectionElapsed}/>{/each}
    {#if requestError?.sessionId === session.id}
      {#if requestError.logs.length}<ChatMessage role="assistant" content="" streaming={true} connectionLogs={requestError.logs} connectionElapsed={requestError.elapsed} connectionError={requestError.message}/>
      {:else}<div class="request-error">{requestError.message}</div>{/if}
    {/if}
    {#if !restoringHistory && hasIncompleteHistory(session)}<div class="request-error">此会话的旧历史有无法还原的截断内容或图片。为保持请求上下文不变，请新建会话。</div>{/if}
    {#if exactStorageError}<div class="request-error">完整会话保存失败，刷新后可能无法恢复原始上下文。</div>{/if}
  </main>
  <Composer {attachments} {usage} {generating} disabled={restoringHistory || persistingMessage || hasIncompleteHistory(session)} {send} stop={() => requestController?.abort()} {addFiles} removeFile={index => attachments = attachments.filter((_, i) => i !== index)}/>
  {#if settingsOpen}<SettingsModal {config} close={() => settingsOpen = false} save={next => { config = next; saveConfig(config); settingsOpen = false; }}/>{/if}
</div>

<style>
  .brand { display: inline-flex; align-items: center; gap: .5rem; }
  .brand-logo { width: 27px; height: 27px; flex: none; }
  .welcome-logo { display: block; width: 80px; height: 80px; margin: 0 auto 1.1rem; filter: drop-shadow(0 8px 14px #c9364f26); }
  @media (max-width: 600px) {
    .model-badge { display: none; }
    .brand { font-size: 13px; }
    .topbar .icon-button { width: 29px; height: 29px; }
  }
  @media (max-width: 360px) {
    .brand { font-size: 12px; }
    .topbar .icon-button { width: 27px; height: 27px; }
  }
</style>
