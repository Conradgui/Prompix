# Prompix Vercel 部署说明（MiniMax 公网可用版）

## 部署目标

- 面试官通过一个公网链接即可直接使用。
- 默认“平台直连（demo）”可用，无需用户输入 Key。
- 保留“自定义 Key”入口（仅高级用户本地或公网自行配置）。

## Vercel 项目配置

1. 在 Vercel 导入仓库。
2. `Root Directory` 选择 `next-web`。
3. Framework Preset 选择 `Next.js`。
4. 构建命令与安装命令保持默认（或分别为 `npm run build` / `npm install`）。

## 必填环境变量

- `NEXT_PUBLIC_RUNTIME_POLICY=public-live`
- `MINIMAX_API_KEY=...`
- `MINIMAX_GROUP_ID=...`

## 可选环境变量

- `MINIMAX_MODEL=MiniMax-M2.5`
- `MINIMAX_BASE_URL=https://api.minimaxi.com/v1/chat/completions`
- `UPSTASH_REDIS_REST_URL=...`
- `UPSTASH_REDIS_REST_TOKEN=...`

## 上线验证清单

1. 公网链接冷启动可访问。
2. 首页上传图片后可进入分析页并产出结构化 Prompt。
3. 聊天、术语库、历史页可用。
4. 刷新页面后历史资料仍保留在同设备浏览器。
5. 如设置为 `public-demo`，自定义 Key 按钮禁用，且后端阻断 `api` 模式调用。

## 回滚步骤

1. 打开 Vercel -> Deployments。
2. 选择最近一个稳定版本。
3. 点击 `Promote to Production`。
4. 若需临时限制公网调用，可将 `NEXT_PUBLIC_RUNTIME_POLICY` 切为 `public-demo`。
