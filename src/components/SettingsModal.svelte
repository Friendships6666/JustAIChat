<script lang="ts">
  import { X } from 'lucide-svelte';
  import { completionEndpoint } from '../lib/apiEndpoint';
  import type { Config } from '../types';
  export let config: Config;
  export let close: () => void;
  export let save: (config: Config) => void;
  let draft: Config = { ...config, relayBaseUrl: config.relayBaseUrl || '' };
  function submit() {
    const baseUrl = draft.baseUrl.trim().replace(/\/+$/, '');
    const model = draft.model.trim();
    const relayBaseUrl = draft.relayBaseUrl?.trim().replace(/\/+$/, '') || '';
    if (!baseUrl || !model) { alert('请至少填写 API Base URL 与模型名称！'); return; }
    if (!draft.reasoningEffort.trim()) { alert('请填写思考程度！'); return; }
    try { completionEndpoint(baseUrl); if (relayBaseUrl) completionEndpoint(relayBaseUrl); }
    catch (error) { alert(error instanceof Error ? error.message : String(error)); return; }
    save({ ...draft, baseUrl, relayBaseUrl, model, apiKey: draft.apiKey.trim(), systemPrompt: draft.systemPrompt.trim(),
      reasoningEffort: draft.reasoningEffort.trim(), temperature: Number(draft.temperature) });
  }
</script>

<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) close(); }}>
  <div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="modal-header"><h2 id="settings-title">自定义 API 接口配置</h2><button class="icon-button" title="关闭" aria-label="关闭" onclick={close}><X size={18}/></button></div>
    <form onsubmit={(event) => { event.preventDefault(); submit(); }}>
      <label>接口 Base URL <span class="required">*</span><input type="url" bind:value={draft.baseUrl} placeholder="https://api.example.com/v1" required /></label>
      <p class="connection-hint">默认由浏览器直连。接口必须允许本站跨域访问；纯静态页面无法自行解除跨域限制。</p>
      <label>转发服务 Base URL（可选）<input type="url" bind:value={draft.relayBaseUrl} placeholder="留空直连，或填写自建转发服务地址" /></label>
      <p class="connection-hint">填写后，密钥和对话会发送到该地址。请仅使用可信服务，并预先将其配置为转发到上方接口。若与本站不同源，转发服务也需允许跨域。此设置不会自动部署后端。</p>
      <label>访问密钥<input type="password" bind:value={draft.apiKey} placeholder="填写接口访问密钥" /></label>
      <label>模型名称 <span class="required">*</span><input bind:value={draft.model} placeholder="填写接口支持的模型标识" required /></label>
      <label>System Prompt<textarea rows="3" bind:value={draft.systemPrompt} placeholder="系统指令..."></textarea></label>
      <label>思考程度<input list="reasoning-effort-options" bind:value={draft.reasoningEffort} placeholder="例如: ultra" required /></label>
      <datalist id="reasoning-effort-options"><option value="low"></option><option value="medium"></option><option value="high"></option><option value="max"></option><option value="ultra"></option></datalist>
      <label>Temperature: <strong>{draft.temperature}</strong><input type="range" min="0" max="2" step="0.1" bind:value={draft.temperature} /></label>
      <button class="primary-button" type="submit">保存配置</button>
    </form>
  </div>
</div>

<style>
  .settings-modal { max-height: calc(100dvh - 2rem); overflow-y: auto; }
  .connection-hint { margin: -.2rem 0 0; color: var(--accent-hover); font-size: 12px; line-height: 1.6; }
</style>
