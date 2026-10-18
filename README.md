# JustAIChat

基于 Svelte、TypeScript 和 Vite 的浏览器聊天应用

公式支持 `$...$`、`$$...$$`、`\(...\)`、`\[...\]`，以及独占行的 `[` / `]` 公式块。回复生成和结束时不会自动跳到底部；发送消息和切换会话时仍会定位到最新消息。



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

