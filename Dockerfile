# syntax=docker/dockerfile:1
# 第一题·如月车站 赛题容器
# 平台必须注入 GZCTF_FLAG（动态FLAG）。PORT 可选，默认 60001，HOST 建议 0.0.0.0。
FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/nakasakisoyorin99-ship-it/Anon-Chihaya-s-Unbelievable-Week-Level-1-Kisaragi-Station" \
      org.opencontainers.image.title="MyGO Chapter 1 - Kisaragi Station"
WORKDIR /app
RUN addgroup -S mygo && adduser -S mygo -G mygo
# 上游引擎独立成层，章节素材和脚本更新时复用。
COPY 物语引擎/engine/ ./物语引擎/engine/
# server.mjs 以 chapterRoot（/app/五题镜像工程/第一题_如月车站）相对定位资源，保持与仓库一致的目录层级。
COPY 五题镜像工程/第一题_如月车站/赛题服务/服务端源码/论坛服务.mjs ./五题镜像工程/第一题_如月车站/赛题服务/服务端源码/论坛服务.mjs
COPY 五题镜像工程/第一题_如月车站/赛题服务/题目数据/论坛内容.json ./五题镜像工程/第一题_如月车站/赛题服务/题目数据/论坛内容.json
COPY 五题镜像工程/第一题_如月车站/赛题服务/网页资源/ ./五题镜像工程/第一题_如月车站/赛题服务/网页资源/
COPY 物语引擎/assets/ ./物语引擎/assets/
COPY 物语引擎/style/ ./物语引擎/style/
COPY 物语引擎/js/ ./物语引擎/js/
COPY 物语引擎/index.html 物语引擎/manifest.json 物语引擎/service-worker.js 物语引擎/favicon.ico ./物语引擎/
ENV NODE_ENV=production PORT=60001 HOST=0.0.0.0
EXPOSE 60001
USER mygo
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/game/state').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "五题镜像工程/第一题_如月车站/赛题服务/服务端源码/论坛服务.mjs"]
