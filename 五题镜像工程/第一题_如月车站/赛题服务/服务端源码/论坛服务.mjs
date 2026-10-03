import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chapterRoot = resolve(here, '..', '..');
const gameRoot = resolve(chapterRoot, '..', '..', '物语引擎');
const forumRoot = resolve(chapterRoot, '赛题服务', '网页资源');
const content = JSON.parse(readFileSync(resolve(chapterRoot, '赛题服务', '题目数据', '论坛内容.json'), 'utf8'));
const port = Number(process.env.PORT || 60001);
const host = process.env.HOST || '127.0.0.1';
const debugForumAtRoot = process.env.FORUM_DEV_MODE === '1';
const flag = process.env.GZCTF_FLAG || (process.env.NODE_ENV === 'production' ? '' : (process.env.DEV_FLAG || 'flag{local_demo_only}'));
const durationMs = 4 * 60 * 1000;

if (!Number.isInteger(port) || port < 60000 || port > 60999) {
  throw new Error('PORT 必须是 60000–60999 内的五位端口');
}
if (!flag) throw new Error('未设置 GZCTF_FLAG；正式题目容器必须由 GZCTF 注入动态 FLAG');

const sessions = new Map();
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav'
};

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('mygo_kisaragi_sid='))?.slice('mygo_kisaragi_sid='.length);
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    session.lastSeen = Date.now();
    return { session, cookie: null };
  }
  // 容器可由平台重建；限制无效会话增长，避免静态资源请求无限占内存。
  if (sessions.size >= 10000) {
    for (const [key, value] of sessions) {
      if (Date.now() - value.lastSeen > 24 * 60 * 60 * 1000) sessions.delete(key);
    }
    if (sessions.size >= 10000) throw Object.assign(new Error('session_capacity'), { status: 503 });
  }
  const id = randomBytes(24).toString('hex');
  const session = {
    lastSeen: Date.now(),
    generation: 0,
    user: { id: 7, handle: 'ano_reader', displayName: 'ano', bio: '', role: 'member' },
    reportRead: false,
    deadline: null,
    solved: false,
    routeReceipt: randomBytes(24).toString('hex'),
    endingStep: 0,
    endingToken: null,
    endingRequest: null,
    endingResult: null
  };
  sessions.set(id, session);
  return { session, cookie: `mygo_kisaragi_sid=${id}; HttpOnly; SameSite=Lax; Path=/` };
}

function send(res, statusCode, body, type, cookie = null, extra = {}) {
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(statusCode, headers);
  res.end(body);
}

function json(res, code, data, cookie = null) {
  send(res, code, JSON.stringify(data), 'application/json; charset=utf-8', cookie);
}

async function readJson(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) {
    throw Object.assign(new Error('expected_json'), { status: 415 });
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw Object.assign(new Error('body_too_large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* 交给下面统一返回 */ }
  throw Object.assign(new Error('invalid_json'), { status: 400 });
}

function userView(user) {
  return { id: user.id, handle: user.handle, displayName: user.displayName, bio: user.bio, role: user.role };
}

function gameState(session) {
  const remainingMs = session.deadline === null ? null : Math.max(0, session.deadline - Date.now());
  return { started: session.deadline !== null, expired: remainingMs === 0 && !session.solved, solved: session.solved,
    Reminder120: remainingMs !== null && remainingMs <= 120000,
    Reminder60: remainingMs !== null && remainingMs <= 60000 };
}

function isWithin(root, target) {
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function serveFile(res, root, subpath, cookie) {
  let decoded;
  try { decoded = decodeURIComponent(subpath); } catch { return json(res, 400, { error: 'invalid_path' }, cookie); }
  if (decoded.includes('\0')) return json(res, 400, { error: 'invalid_path' }, cookie);
  const target = resolve(root, `.${decoded.startsWith('/') ? decoded : '/' + decoded}`);
  if (!isWithin(root, target)) return json(res, 404, { error: 'not_found' }, cookie);
  try {
    if (!(await stat(target)).isFile()) throw new Error('not_file');
    const body = await readFile(target);
    return send(res, 200, body, mime[extname(target).toLowerCase()] || 'application/octet-stream', cookie,
      { 'Cache-Control': 'no-store' });
  } catch {
    return json(res, 404, { error: 'not_found' }, cookie);
  }
}

const server = createServer(async (req, res) => {
  let session, cookie, path;
  const method = req.method || 'GET';
  try {
    ({ session, cookie } = getSession(req));
    path = new URL(req.url || '/', 'http://localhost').pathname;
  } catch (error) {
    return json(res, error.status || 400, { error: error.status ? error.message : 'invalid_request' });
  }
  const generation = session.generation;

  try {
    if (path === '/api/forum/me' && method === 'GET') return json(res, 200, userView(session.user), cookie);
    if (path === '/api/forum/me' && method === 'POST') {
      const input = await readJson(req);
      if (generation !== session.generation) return json(res, 409, { error: 'round_changed' }, cookie);
      // 赛题漏洞：资料保存误把 role 当作可由用户修改的普通字段。仅保留此预期漏洞。
      const changes = {};
      for (const key of ['displayName', 'bio', 'role']) {
        if (!Object.hasOwn(input, key)) continue;
        if (typeof input[key] !== 'string') return json(res, 400, { error: 'invalid_field' }, cookie);
        if (key === 'role' && !['member', 'admin'].includes(input[key])) return json(res, 400, { error: 'invalid_role' }, cookie);
        changes[key] = input[key].slice(0, key === 'bio' ? 160 : 40);
      }
      if (gameState(session).expired && Object.hasOwn(changes, 'role')) return json(res, 410, { error: 'train_departed' }, cookie);
      Object.assign(session.user, changes);
      return json(res, 200, userView(session.user), cookie);
    }
    if (path === '/api/forum/threads' && method === 'GET') {
      return json(res, 200, content.threads.map(({ posts, ...thread }) => ({ ...thread, replies: posts.length })), cookie);
    }
    const threadId = path.match(/^\/api\/forum\/threads\/(\d+)$/)?.[1];
    if (threadId && method === 'GET') {
      const thread = content.threads.find(item => item.id === Number(threadId));
      return thread ? json(res, 200, thread, cookie) : json(res, 404, { error: 'thread_not_found' }, cookie);
    }
    if (path === '/api/forum/reports' && method === 'GET') {
      if (session.user.role !== 'admin') return json(res, 403, { error: 'moderator_only' }, cookie);
      // 调度窗口锁：startChallenge 之前报告未同步，提前升权也读不到，防止场景三白拿答案。
      if (session.deadline === null) return json(res, 423, { error: 'challenge_not_started' }, cookie);
      if (gameState(session).expired) return json(res, 410, { error: 'train_departed' }, cookie);
      const { id, threadId, title, author, reason } = content.report;
      return json(res, 200, [{ id, threadId, title, author, reason }], cookie);
    }
    const reportId = path.match(/^\/api\/forum\/reports\/(\d+)$/)?.[1];
    if (reportId && method === 'GET') {
      if (session.user.role !== 'admin') return json(res, 403, { error: 'moderator_only' }, cookie);
      if (session.deadline === null) return json(res, 423, { error: 'challenge_not_started' }, cookie);
      if (gameState(session).expired) return json(res, 410, { error: 'train_departed' }, cookie);
      if (Number(reportId) !== content.report.id) return json(res, 404, { error: 'report_not_found' }, cookie);
      session.reportRead = true;
      return json(res, 200, { ...content.report, proof: session.routeReceipt }, cookie);
    }
    if (path === '/api/game/state' && method === 'GET') return json(res, 200, gameState(session), cookie);
    if (path === '/api/game/start' && method === 'POST') {
      if (session.deadline === null) {
        session.user.role = 'member';
        session.reportRead = false;
        session.deadline = Date.now() + durationMs;
        session.generation++;
      }
      return json(res, 200, gameState(session), cookie);
    }
    if (path === '/api/game/retry' && method === 'POST') {
      if (!gameState(session).expired) return json(res, 409, { error: 'not_expired' }, cookie);
      session.generation++;
      session.user.role = 'member';
      session.reportRead = false;
      session.routeReceipt = randomBytes(24).toString('hex');
      session.endingStep = 0;
      session.endingToken = null;
      session.endingRequest = null;
      session.endingResult = null;
      session.deadline = Date.now() + durationMs;
      return json(res, 200, gameState(session), cookie);
    }
    if (path === '/api/game/submit' && method === 'POST') {
      const state = gameState(session);
      if (!state.started) return json(res, 409, { error: 'challenge_not_started' }, cookie);
      if (state.expired) return json(res, 410, { error: 'train_departed' }, cookie);
      if (session.solved) return json(res, 200, { accepted: true, clue: content.report.route, endingToken: session.endingToken }, cookie);
      const input = await readJson(req);
      if (generation !== session.generation) return json(res, 409, { error: 'round_changed' }, cookie);
      if (session.solved) return json(res, 200, { accepted: true, clue: content.report.route, endingToken: session.endingToken }, cookie);
      if (session.user.role !== 'admin' || !session.reportRead) return json(res, 403, { error: 'report_not_read' }, cookie);
      if (gameState(session).expired) return json(res, 410, { error: 'train_departed' }, cookie);
      if (input.receipt !== session.routeReceipt || String(input.platform).trim() !== content.report.route.platform ||
          String(input.signal).replace(/[\s、，,\-]/g, '') !== content.report.route.signal) {
        return json(res, 422, { accepted: false, error: 'check_the_report' }, cookie);
      }
      session.solved = true;
      session.endingToken = randomBytes(24).toString('hex');
      return json(res, 200, { accepted: true, clue: content.report.route, endingToken: session.endingToken }, cookie);
    }

    if (path === '/api/game/ending' && method === 'GET') {
      if (!session.solved) return json(res, 403, { error: 'route_not_verified' }, cookie);
      return json(res, 200, { step: session.endingStep, token: session.endingToken, complete: session.endingStep === 5 }, cookie);
    }
    if (path === '/api/game/ending' && method === 'POST') {
      const input = await readJson(req);
      if (!session.solved) return json(res, 403, { error: 'route_not_verified' }, cookie);
      if (!Number.isInteger(input.step) || typeof input.token !== 'string' || !/^[a-f0-9]{48}$/.test(input.token)) return json(res, 400, { error: 'invalid_ending_request' }, cookie);
      if (session.endingResult && input.step === session.endingStep && input.token === session.endingRequest) return json(res, 200, session.endingResult, cookie);
      if (input.token !== session.endingToken || input.step !== session.endingStep + 1 || input.step > 5) return json(res, 409, { error: 'ending_out_of_order' }, cookie);
      session.endingStep = input.step;
      session.endingRequest = input.token;
      session.endingToken = randomBytes(24).toString('hex');
      session.endingResult = { step: session.endingStep, token: session.endingToken, complete: session.endingStep === 5 };
      return json(res, 200, session.endingResult, cookie);
    }
    if (path === '/api/game/reward' && method === 'POST') {
      const input = await readJson(req);
      if (!session.solved || session.endingStep !== 5 || input.token !== session.endingToken) return json(res, 403, { error: 'ending_not_completed' }, cookie);
      return json(res, 200, { flag }, cookie);
    }

    if (method !== 'GET' && method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' }, cookie);
    if (path === '/forum' || path === '/forum/') return serveFile(res, forumRoot, '/论坛.html', cookie);
    if (path.startsWith('/forum/assets/')) return serveFile(res, forumRoot, path.slice('/forum/assets'.length), cookie);
    if (path === '/game') return serveFile(res, gameRoot, '/index.html', cookie);
    if (path === '/' && debugForumAtRoot) return serveFile(res, forumRoot, '/论坛.html', cookie);
    if (path === '/') return serveFile(res, gameRoot, '/index.html', cookie);
    const allowed = ['/js/', '/style/', '/engine/core/', '/engine/debug/', '/assets/'];
    if (allowed.some(prefix => path.startsWith(prefix)) || ['/favicon.ico', '/manifest.json', '/service-worker.js'].includes(path)) {
      return serveFile(res, gameRoot, path, cookie);
    }
    return json(res, 404, { error: 'not_found' }, cookie);
  } catch (error) {
    return json(res, error.status || 500, { error: error.status ? error.message : 'internal_error' }, cookie);
  }
});

server.listen(port, host, () => console.log(`论坛与视觉小说： http://${host}:${port}/`));
