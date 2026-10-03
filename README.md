# GZCTF 平台部署说明（第一题·如月车站）

## 镜像

- 地址：`ghcr.io/nakasakisoyorin99-ship-it/anon-chihaya-s-unbelievable-week-level-1-kisaragi-station:latest`
- 架构：linux/amd64
- 平台「拉取镜像」填以上地址即可。

## 必需环境变量

- `GZCTF_FLAG`：动态 FLAG，由 GZCTF 注入。缺失时容器拒绝启动，防止静态 FLAG 泄露。

## 可选环境变量

- `PORT`：默认 `60001`（GZCTF 通常注入自己的端口，保持默认即可）。
- `HOST`：默认 `0.0.0.0`。

## 端口与入口

- 容器监听 `0.0.0.0:$PORT`，HTTP。
- `/`：视觉小说（第一关）。
- `/forum/`：题目论坛（同源，游戏内 iframe 引用 `/forum/#thread/26`）。
- `/api/*`：题目与游戏接口。

## 流程与判分

- 解题主线：观察资料请求 → `POST /api/forum/me` 提交 `{"role":"admin"}` → 读 `GET /api/forum/reports/71` → 用报告 `proof`（路线回执）＋站台 `B7`＋提示音 `三短一长` 调 `POST /api/game/submit`。
- 提交通过后走完五个结局检查点，最后 `POST /api/game/reward` 才返回比赛 FLAG，玩家再提交到 GZCTF 计分。
- FLAG 不出现在报告、提交回执或前端；重试会更换回执。

## 会话与限制

- 会话保存在容器内存：容器重建后进度清空，属预期行为。
- 内部文档（WP、状态机设计等）不在本镜像内，勿将其放入公开资源。

## 本地验证

```bash
docker run --rm -p 60001:60001 -e GZCTF_FLAG='flag{test}' <镜像地址>
# 打开 http://127.0.0.1:60001/
```
