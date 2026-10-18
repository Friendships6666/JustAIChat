<script lang="ts">
  import { Play, RotateCcw, X } from 'lucide-svelte';
  import { compilePreview, type PreviewKind } from '../lib/preview';
  export let code: string;
  export let kind: PreviewKind;
  let running = false;
  let loading = false;
  let output = '';
  let error = '';
  let generation = 0;
  async function run() {
    const current = ++generation;
    running = true;
    loading = true;
    output = '';
    error = '';
    try {
      const result = await compilePreview(code, kind);
      if (current === generation) output = result;
    } catch (cause) {
      if (current === generation) error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (current === generation) loading = false;
    }
  }
  function close() { generation += 1; running = false; output = ''; }
</script>

<div class="preview-tool">
  <div class="preview-bar"><span>{kind.toUpperCase()} 预览</span><div class="preview-actions">
    {#if running}<button title="重新运行" aria-label="重新运行" onclick={run}><RotateCcw size={15}/></button><button title="关闭预览" aria-label="关闭预览" onclick={close}><X size={15}/></button>
    {:else}<button class="run-button" title="运行代码" aria-label="运行代码" onclick={run}><Play size={15}/>运行</button>{/if}
  </div></div>
  {#if running}
    {#if loading}<div class="preview-status">正在编译...</div>
    {:else if error}<div class="preview-status preview-error">{error}</div>
    {:else if output}{#key generation}<div class="preview-canvas"><iframe title={`${kind.toUpperCase()} 运行预览`} sandbox="allow-scripts" srcdoc={output}></iframe></div>{/key}{/if}
  {/if}
</div>

<style>
  .preview-tool { margin: .5rem 0 1rem; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: #fff; }
  .preview-bar { min-height: 36px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 .5rem 0 .75rem; background: var(--surface-soft); color: #526174; font: 11px ui-monospace, monospace; }
  .preview-actions { display: flex; align-items: center; gap: 3px; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 27px; height: 27px; border: 0; border-radius: 4px; background: transparent; color: #526174; font: 11px ui-monospace, monospace; cursor: pointer; }
  button:hover { background: var(--accent-soft); color: var(--accent-hover); }
  .run-button { padding: 0 7px; color: var(--accent-hover); }
  .preview-canvas { height: 320px; min-height: 160px; resize: vertical; overflow: auto; background: #fff; border-top: 1px solid var(--border); }
  .preview-status { padding: 1rem; border-top: 1px solid var(--border); color: #64748b; font-size: 12px; }
  .preview-error { color: #b91c1c; white-space: pre-wrap; overflow-wrap: anywhere; }
  iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
</style>
