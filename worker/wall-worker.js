/**
 * razrad — общая стена. Cloudflare Worker + Workers KV.
 *
 * API:
 *   GET  /api/ping       -> { ok, service, now }
 *   GET  /api/config     -> { ok, rate (сек), maxText, maxPosts }
 *   GET  /api/captcha    -> { ok, svg, token }   ретро-капча, рисуется на лету
 *   GET  /api/posts      -> { ok, posts: [...] } последние сообщения
 *   GET  /api/nick?nick= -> { ok, taken, created }
 *   POST /api/post       -> { ok, id, created, retry }
 *   POST /api/delete     -> { ok, removed }
 *   POST /api/wipe       -> { ok, removed }      удалить все сообщения ника
 *
 * Переменные (Settings -> Variables and Secrets):
 *   WALL         KV namespace
 *   WALL_SECRET  secret для подписи капчи и хранения паролей
 */

const KV_POSTS = "posts";
const MAX_POSTS = 400;
const MAX_TEXT = 300;
const MAX_PASS = 64;
const MIN_NICK = 2;
const MAX_NICK = 20;
const RATE_MS = 15 * 60 * 1000;        /* одно сообщение на ник в 15 минут */
const IP_WINDOW_MS = 60 * 60 * 1000;   /* и не больше IP_MAX с одного адреса */
const IP_MAX = 10;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const FORM_MIN_MS = 3000;              /* форму надо подержать открытой */
const FORM_MAX_MS = 2 * 60 * 60 * 1000;
const CAPTCHA_LEN = 4;
const CAPTCHA_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; /* без 0/O/1/I */
const NEW_NICK_MAX = 5;        /* новых ников с одного адреса в час */
const BAD_MAX = 6;             /* неверных паролей на ник в час */

const enc = new TextEncoder();
const sentAt = new Map();              /* защита от спама внутри одного isolate */

/* ---------------- утилиты ---------------- */

function b64url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function rnd(a, b) { return a + Math.random() * (b - a); }
function rint(a, b) { return Math.floor(rnd(a, b + 1)); }
function randStr(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a);
}
function sameStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function sha256hex(str) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(str)));
  let out = "";
  for (let i = 0; i < d.length; i++) out += (d[i] < 16 ? "0" : "") + d[i].toString(16);
  return out;
}
async function hmacB64(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
function passHash(secret, salt, pass) {
  return sha256hex(salt + "|" + pass + "|" + secret);
}
function clean(str) {
  return String(str == null ? "" : str)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}
function normNick(nick) { return clean(nick).replace(/\s+/g, " ").slice(0, MAX_NICK); }
function nickIdOf(nick) { return nick.toLowerCase(); }
function validNick(nick) {
  return nick.length >= MIN_NICK && /^[\p{L}\p{N} _.\-]+$/u.test(nick);
}
async function readJson(req) {
  try {
    const o = JSON.parse(await req.text());
    return o && typeof o === "object" ? o : {};
  } catch (e) {
    return {};
  }
}

/* ---------------- ответы ---------------- */
/* ---------------- ответы ---------------- */

function withCors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
function json(obj, status) {
  return withCors(new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  }));
}
function fail(error, status, extra) {
  const out = { ok: false, error: error };
  if (extra) for (const k in extra) out[k] = extra[k];
  return json(out, status || 400);
}

/* ---------------- капча (ретро-SVG) ---------------- */

function captchaSvg(text) {
  const W = 168, H = 54, out = [];
  out.push('<rect width="' + W + '" height="' + H + '" fill="#c0c0c0"/>');
  for (let i = 0; i < 240; i++) {                       /* шум точками */
    out.push('<rect x="' + rnd(0, W).toFixed(0) + '" y="' + rnd(0, H).toFixed(0) +
             '" width="1" height="1" fill="' + (i % 3 ? "#a9a9a9" : "#d9d9d9") + '"/>');
  }
  const step = (W - 30) / text.length;
  for (let i = 0; i < text.length; i++) {               /* буквы */
    const cx = 18 + step * i + step / 2;
    const cy = H / 2 + 8 + rnd(-3, 3);
    const rot = Math.round(rnd(-16, 16));
    const size = Math.round(rnd(27, 33));
    const fill = ["#000000", "#191970", "#6b1010", "#0b4a0b"][i % 4];
    out.push('<text class="ch" x="' + cx.toFixed(1) + '" y="' + cy.toFixed(1) +
      '" font-family="Courier New,monospace" font-size="' + size + '" font-weight="bold" fill="' + fill +
      '" text-anchor="middle" transform="rotate(' + rot + " " + cx.toFixed(1) + " " + cy.toFixed(1) + ')">' +
      text.charAt(i) + "</text>");
  }
  for (let i = 0; i < 4; i++) {                          /* линии-скремблы */
    out.push('<path d="M0 ' + rnd(8, H - 8).toFixed(0) + " Q " + rnd(30, W - 30).toFixed(0) + " " +
      rnd(2, H - 2).toFixed(0) + " " + W + " " + rnd(8, H - 8).toFixed(0) +
      '" fill="none" stroke="' + (i % 2 ? "#606060" : "#3f3f3f") + '" stroke-width="1" opacity="0.7"/>');
  }
  out.push('<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) +
           '" fill="none" stroke="#808080"/>');
  out.push('<text x="' + (W - 5) + '" y="11" font-family="monospace" font-size="8" ' +
           'fill="#606060" text-anchor="end">CAPTCHA</text>');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
         '" viewBox="0 0 ' + W + " " + H + '">' + out.join("") + "</svg>";
}

async function makeCaptcha(env) {
  let text = "";
  for (let i = 0; i < CAPTCHA_LEN; i++) text += CAPTCHA_ABC.charAt(rint(0, CAPTCHA_ABC.length - 1));
  const payload = b64url(enc.encode(JSON.stringify({ t: text, e: Date.now() + CAPTCHA_TTL_MS })));
  const sig = await hmacB64(env.WALL_SECRET, payload);
  return { svg: captchaSvg(text), token: payload + "." + sig };
}

async function checkCaptcha(env, token, answer) {
  if (typeof token !== "string" || typeof answer !== "string") return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  if (!sameStr(await hmacB64(env.WALL_SECRET, payload), token.slice(dot + 1))) return false;
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(unb64url(payload)));
  } catch (e) {
    return false;
  }
  if (!data || typeof data.t !== "string" || typeof data.e !== "number") return false;
  if (Date.now() > data.e) return false;
  return clean(answer).toUpperCase() === data.t;
}

/* ---------------- хранилище ---------------- */

async function getPosts(env) {
  const raw = await env.WALL.get(KV_POSTS);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}
async function putPosts(env, list) {
  await env.WALL.put(KV_POSTS, JSON.stringify(list.slice(0, MAX_POSTS)));
}

function nickKey(nick) { return "nick:" + nickIdOf(nick); }
function rateKey(nick) { return "rl:" + nickIdOf(nick); }

/* сверяет пароль; если ник свободен — занимает его (если не превышен лимит новых ников) */
async function claimNick(env, nick, pass, ip, now) {
  const rec = await env.WALL.get(nickKey(nick), "json");
  if (rec && typeof rec.s === "string" && typeof rec.h === "string") {
    if (!sameStr(await passHash(env.WALL_SECRET, rec.s, pass), rec.h)) return { ok: false };
    return { ok: true, created: false };
  }
  if (!(await newNickLimit(env, ip))) return { ok: false, full: true };
  const salt = randStr(12);
  await env.WALL.put(nickKey(nick), JSON.stringify({
    s: salt, h: await passHash(env.WALL_SECRET, salt, pass), c: now
  }));
  return { ok: true, created: true };
}

/* только сверка пароля, ник не создаётся (для удаления) */
async function checkPass(env, nick, pass) {
  const rec = await env.WALL.get(nickKey(nick), "json");
  if (!rec || typeof rec.s !== "string" || typeof rec.h !== "string") return false;
  return sameStr(await passHash(env.WALL_SECRET, rec.s, pass), rec.h);
}

/* не больше IP_MAX сообщений с одного адреса в час */
async function ipLimit(env, ip) {
  return bumpWindow(env, "ip:", ip, IP_MAX, IP_WINDOW_MS);
}
/* не больше NEW_NICK_MAX новых ников с одного адреса в час (анти-спам по KV-записям) */
async function newNickLimit(env, ip) {
  return bumpWindow(env, "nk:", ip, NEW_NICK_MAX, IP_WINDOW_MS);
}
async function bumpWindow(env, prefix, ip, max, windowMs) {
  const key = prefix + (await sha256hex(env.WALL_SECRET + "|" + (ip || "x"))).slice(0, 24);
  const now = Date.now();
  const raw = await env.WALL.get(key, "json");
  const hits = Array.isArray(raw) ? raw.filter((t) => now - t < windowMs) : [];
  if (hits.length >= max) return false;
  hits.push(now);
  await env.WALL.put(key, JSON.stringify(hits.slice(-max)));
  return true;
}

/* защита от перебора пароля: не больше BAD_MAX попыток на ник в час */
async function badAttempts(env, nick, add) {
  const key = "bad:" + nickIdOf(nick);
  const now = Date.now();
  const raw = await env.WALL.get(key, "json");
  const hits = (Array.isArray(raw) ? raw.filter((t) => now - t < IP_WINDOW_MS) : []);
  if (add) hits.push(now);
  await env.WALL.put(key, JSON.stringify(hits.slice(-20)));
  return hits.length;
}

/* ---------------- отправка сообщения ---------------- */

async function apiPost(env, req) {
  const b = await readJson(req);
  const nick = normNick(b.nick);
  const pass = clean(b.pass);
  const text = clean(b.text).slice(0, MAX_TEXT);
  const now = Date.now();
  const ip = req.headers.get("CF-Connecting-IP");

  if (!validNick(nick)) return fail("nick", 400);
  if (!pass || pass.length > MAX_PASS) return fail("pass", 400);

  /* honeypot: скрытое поле заполняют только боты */
  if (clean(b.hp)) return fail("spam", 200);

  const opened = Number(b.t0);
  if (!opened || now - opened < FORM_MIN_MS || now - opened > FORM_MAX_MS) return fail("fast", 429);

  if (!(await checkCaptcha(env, b.captcha, b.answer))) return fail("captcha", 400);

  /* слишком много попыток угадать пароль — стоп */
  if (await badAttempts(env, nick, false) >= BAD_MAX) {
    return fail("locked", 429, { retry: Math.ceil(IP_WINDOW_MS / 1000) });
  }

  /* пароль проверяем ДО задержки 15 минут, иначе опечатка выглядит как «жди 15 минут» */
  const auth = await claimNick(env, nick, pass, ip, now);
  if (!auth.ok) {
    if (auth.full) return fail("ip", 429, { retry: Math.ceil(IP_WINDOW_MS / 1000) });
    await badAttempts(env, nick, true);
    return fail("pass", 403);
  }

  /* и только теперь задержка 15 минут на ник */
  const last = parseInt((await env.WALL.get(rateKey(nick))) || "0", 10) || 0;
  const cached = sentAt.get(nickIdOf(nick)) || 0;
  const wait = Math.max(last ? RATE_MS - (now - last) : 0, cached ? RATE_MS - (now - cached) : 0);
  if (wait > 0) return fail("rate", 429, { retry: Math.ceil(wait / 1000) });

  if (!(await ipLimit(env, ip))) return fail("ip", 429, { retry: Math.ceil(IP_WINDOW_MS / 1000) });

  if (!text) return fail("text", 400);

  const post = {
    id: now.toString(36) + randStr(4).replace(/[^a-zA-Z0-9]/g, "").slice(0, 6),
    nick: nick,
    text: text,
    ts: now
  };

  const list = await getPosts(env);
  list.unshift(post);
  await putPosts(env, list);
  await env.WALL.put(rateKey(nick), String(now));
  sentAt.set(nickIdOf(nick), now);

  return json({ ok: true, id: post.id, created: !!auth.created, retry: Math.ceil(RATE_MS / 1000) });
}

async function apiDelete(env, req, all) {
  const b = await readJson(req);
  const nick = normNick(b.nick);
  const pass = clean(b.pass);
  if (!validNick(nick) || !pass) return fail("nick", 400);
  if (!(await ipLimit(env, req.headers.get("CF-Connecting-IP")))) {
    return fail("ip", 429, { retry: Math.ceil(IP_WINDOW_MS / 1000) });
  }

  if (!(await checkPass(env, nick, pass))) return fail("pass", 403);

  const list = await getPosts(env);
  const id = clean(b.id);
  const nid = nickIdOf(nick);
  const next = all
    ? list.filter((p) => nickIdOf(normNick(p.nick)) !== nid)
    : list.filter((p) => !(p.id === id && nickIdOf(normNick(p.nick)) === nid));
  const removed = list.length - next.length;
  if (removed) await putPosts(env, next);
  return json({ ok: true, removed: removed });
}

/* ---------------- роутер ---------------- */

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

    const path = new URL(req.url).pathname.replace(/\/+$/, "") || "/";
    try {
      if (!env.WALL || !env.WALL_SECRET) {
        return json({ ok: false, error: "config", msg: "нет биндингов WALL и WALL_SECRET" }, 500);
      }

      if (path === "/" || path === "/api/ping") {
        return json({ ok: true, service: "razrad-wall", now: Date.now() });
      }
      if (path === "/api/config") {
        return json({
          ok: true, rate: Math.ceil(RATE_MS / 1000), maxText: MAX_TEXT,
          maxPosts: MAX_POSTS, captchaTtl: Math.ceil(CAPTCHA_TTL_MS / 1000)
        });
      }
      if (path === "/api/captcha") {
        const c = await makeCaptcha(env);
        return json({ ok: true, svg: c.svg, token: c.token });
      }
      if (path === "/api/posts" && req.method === "GET") {
        return json({ ok: true, posts: await getPosts(env) });
      }
      if (path === "/api/nick") {
        const nick = normNick(new URL(req.url).searchParams.get("nick"));
        if (!validNick(nick)) return fail("nick", 400);
        const rec = await env.WALL.get(nickKey(nick), "json");
        return json({ ok: true, taken: !!rec, created: rec && rec.c ? rec.c : 0 });
      }
      if (path === "/api/post" && req.method === "POST") return apiPost(env, req);
      if (path === "/api/delete" && req.method === "POST") return apiDelete(env, req, false);
      if (path === "/api/wipe" && req.method === "POST") return apiDelete(env, req, true);

      return fail("notfound", 404);
    } catch (e) {
      return json({ ok: false, error: "server", msg: String((e && e.message) || e) }, 500);
    }
  }
};
