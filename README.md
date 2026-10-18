# JustAIChat

一个采用红色主题、基于 Svelte、TypeScript 和 Vite 的浏览器聊天应用，支持自定义兼容接口、会话本地保存与导入导出，以及 Markdown、公式和代码高亮。AI 回复中的 HTML、SVG、Typst 和 LaTeX 代码块可以点击运行预览。

公式支持 `$...$`、`$$...$$`、`\(...\)`、`\[...\]`，以及独占行的 `[` / `]` 公式块。回复生成和结束时不会自动跳到底部；发送消息和切换会话时仍会定位到最新消息。

旧版本的本地配置、完整会话和记忆导出文件仍可迁移或导入。新导出文件使用 `justaichat-memory` 名称。

## 本地运行

需要 Node.js 22。

```bash
npm ci
npm run dev
```

打开终端显示的本地地址，在“配置 API”中填写接口地址、密钥和模型。配置与会话保存在当前浏览器的本地存储中。浏览器需要能够跨域访问所填写的 API。

## 构建与部署

```bash
npm run check
npm test
npm run build
```

GitHub Pages 部署使用 `/JustAIChat/` 路径，远程仓库也需改名为 `JustAIChat`。如果部署域名改变，浏览器存储不会跨域迁移，请先在旧地址导出记忆，并在新地址重新填写 API 配置。
