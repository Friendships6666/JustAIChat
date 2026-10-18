<script lang="ts">
  import { afterUpdate, mount, onDestroy, unmount } from 'svelte';
  import { Copy, Check } from 'lucide-svelte';
  import CodePreview from './CodePreview.svelte';
  import { renderMarkdown } from '../lib/markdown';
  import { detectPreviewKind } from '../lib/preview';
  import { completedMarkdownOffset } from '../lib/streamingMarkdown';
  import type { Content, Role } from '../types';
  export let role: Role;
  export let content: Content;
  export let streaming = false;
  export let connectionLogs: { elapsed: number; stage: string; detail: string }[] = [];
  export let connectionElapsed = 0;
  export let connectionError = '';
  let copied = false;
  let markdownRoot: HTMLDivElement;
  let previewedRaw = '';
  let previewedStreaming = false;
  let clearPreviews: (() => void)[] = [];
  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      copied = true;
      setTimeout(() => copied = false, 2000);
    });
  }
  $: raw = typeof content === 'string' ? content : content.filter(part => part.type === 'text').map(part => part.text).join('\n');
  $: completedOffset = streaming ? completedMarkdownOffset(raw) : raw.length;
  $: completedMarkdown = raw.slice(0, completedOffset);

  afterUpdate(() => {
    if (role !== 'assistant' || (completedMarkdown === previewedRaw && streaming === previewedStreaming)) return;
    clearPreviews.forEach(clear => clear());
    clearPreviews = [];
    previewedRaw = completedMarkdown;
    previewedStreaming = streaming;
    if (!markdownRoot) return;
    for (const pre of Array.from(markdownRoot.querySelectorAll('pre'))) {
      const code = pre.querySelector('code');
      if (!code) continue;
      const source = code.textContent || '';
      const kind = detectPreviewKind(source, pre.dataset.language || '');
      if (!kind) continue;
      const host = document.createElement('div');
      pre.insertAdjacentElement('afterend', host);
      const component = mount(CodePreview, { target: host, props: { code: source, kind } });
      clearPreviews.push(() => { void unmount(component); host.remove(); });
    }
  });
  onDestroy(() => clearPreviews.forEach(clear => clear()));
</script>

<div class:user={role === 'user'} class="message-row">
  <div class:assistant={role === 'assistant'} class="message-bubble">
    {#if role === 'user'}
      {#if typeof content === 'string'}{content}{:else}
        {#each content as part}
          {#if part.type === 'text'}<div>{part.text}</div>{:else}<img class="message-image" src={part.image_url.url} alt="上传的图片" />{/if}
        {/each}
      {/if}
    {:else}
      {#if streaming}
        {#if raw}
          {#if completedMarkdown}<div bind:this={markdownRoot} class="markdown-body">{@html renderMarkdown(completedMarkdown)}</div>{/if}
          {#if completedOffset < raw.length}<div class:has-completed={completedOffset > 0} class="streaming-body">{raw.slice(completedOffset)}</div>{/if}
        {:else if connectionLogs.length}
          <div class="connection-report">
            <div class="connection-heading">
              <span class:error={!!connectionError} class="connection-indicator"></span>
              <strong>{connectionError ? '连接失败' : '连接中'}</strong>
              <span class="connection-clock">{(connectionElapsed / 1000).toFixed(1)}s</span>
            </div>
            <ol class="connection-lines">
              {#each connectionLogs as entry}
                <li><span class="connection-time">+{(entry.elapsed / 1000).toFixed(3)}s</span><span class="connection-stage">{entry.stage}</span><span class="connection-detail">{entry.detail}</span></li>
              {/each}
            </ol>
            {#if connectionError}<div class="connection-error">{connectionError}</div>
            {:else}<div class="connection-waiting">等待首个内容分块<span class="typing"> ▍</span></div>{/if}
          </div>
        {:else}<span class="typing">▍</span>{/if}
      {:else if raw}<div bind:this={markdownRoot} class="markdown-body">{@html renderMarkdown(raw)}</div>{/if}
      {#if raw}<button class="copy-message icon-button" title={copied ? '已复制' : '复制回复'} aria-label="复制回复" onclick={() => copy(raw)}>{#if copied}<Check size={15}/>{:else}<Copy size={15}/>{/if}</button>{/if}
    {/if}
  </div>
</div>

<style>
  .connection-report {
    width: 100%;
    min-width: 0;
    color: #526174;
    font: 11px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .connection-heading { display: flex; align-items: center; gap: .55rem; padding-bottom: .45rem; border-bottom: 1px solid var(--border); }
  .connection-heading strong { color: var(--accent-hover); font-size: 12px; }
  .connection-indicator { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .connection-indicator.error { background: #ce4659; box-shadow: 0 0 0 3px #fde6e8; }
  .connection-clock { margin-left: auto; color: #768598; font-variant-numeric: tabular-nums; }
  .connection-lines { list-style: none; margin: .5rem 0; padding: 0; max-height: 13rem; overflow-y: auto; }
  .connection-lines li { display: grid; grid-template-columns: 4.6rem 4.7rem minmax(0, 1fr); gap: .45rem; padding: .13rem 0; }
  .connection-time { color: #8b98a8; font-variant-numeric: tabular-nums; }
  .connection-stage { color: var(--accent); font-weight: 700; }
  .connection-detail { min-width: 0; overflow-wrap: anywhere; }
  .connection-waiting { color: #697b8e; padding-top: .25rem; }
  .connection-error { color: #b91c1c; overflow-wrap: anywhere; padding-top: .25rem; }

  .streaming-body {
    line-height: 1.75;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .streaming-body.has-completed { margin-top: .6rem; }

  :global(.typing) { animation: none; }
</style>
