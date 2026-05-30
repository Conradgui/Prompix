# Prompix Next Web 

Prompix 的 Next.js App Router 版本，目标是“公网链接点开即可真实使用”。

## 本地启动

推荐从仓库根目录启动（`npm run start` / `npm run start:dev`），避免与一键启动器混用。

若仅在 `next-web/` 单独开发，可使用：

```bash
npm install
npm run dev
```

默认地址：`http://localhost:4300`

## 核心环境变量

可复制 [.env.example](file:///Users/conrad/Desktop/archive/AI学习/Codex vibe coding/Prompix/next-web/.env.example) 为 `.env.local` 后填写：

- `NEXT_PUBLIC_RUNTIME_POLICY=local | public-live | public-demo`
- `GEMINI_API_KEY`（官方直连 / 降本托管必填）
- `GEMINI_MODEL`（默认 `gemini-2.5-flash`）
- `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`（可选，限流）
- `PROMPIX_DEV_MODE_PASSWORD`（公网开发者调优口令，`local` 可不填）

## 运行策略说明

- `local`：本地开发，支持“平台直连 + 自定义 Key”。
- `public-live`：公网正式可用，默认平台直连，仍保留自定义 Key 入口。
- `public-demo`：公网演示版，强制 `demo`，后端也会阻断 `api` 请求。
- 开发者调优 `/dev-lab`：
  - `local`：设置页可直接进入。
  - `public-live` / `public-demo`：需在设置页输入开发者口令验证后进入。
  - 调优发布仅保存在当前浏览器本地，不做全站同步。

## API 路由

- `POST /api/managed/analyze`
- `POST /api/managed/chat`
- `POST /api/managed/regenerate`
- `POST /api/managed/explain-term`
- `POST /api/managed/translate`
- `GET/POST/DELETE /api/dev-mode/session`

## 页面

- `/` Home + Dropzone
- `/analysis` Analysis 工作台
- `/library` 历史库
- `/wordbank` 术语库
- `/settings` 设置
- `/dev-lab` 开发者调优页（受限入口）

## 测试

```bash
npm run test
npm run test:e2e
npm run test:e2e:public-demo
```
