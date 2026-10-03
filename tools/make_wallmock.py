"""Собирает _wallmock.html из index.html: подменяет адрес стены на локальный
мок-воркер (тот же код, что уедет в Cloudflare) и прогоняет сценарий отправки."""
import io
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = io.open(os.path.join(root, 'index.html'), encoding='utf-8').read()

proxy = """<script type="module">
import wall from "../worker/wall-worker.js";
const store = new Map();
const env = {
  WALL_SECRET: "mock-secret",
  WALL: {
    async get(k, t) { const v = store.get(k); if (v === undefined) return null;
      if (t === "json") { try { return JSON.parse(v); } catch (e) { return null; } } return v; },
    async put(k, v) { store.set(k, String(v)); },
    async delete(k) { store.delete(k); }
  }
};
const _fetch = window.fetch;
window.fetch = function (input, init) {
  const u = typeof input === "string" ? input : input.url;
  if (u.indexOf("/mock") === 0) {
    const r = (typeof input === "string") ? new Request(input, init) : input;
    const u2 = new URL(r.url);
    const sub = new Request("https://mock.test" + u2.pathname.replace("/mock", "") + u2.search, r);
    return wall.fetch(sub, env, {});
  }
  return _fetch(input, init);
};
</script>"""

test = """<script>
(function () {
  var L = [];
  function log(s) {
    L.push(s);
    var o = document.getElementById("log");
    if (o) o.textContent = L.join("\\n");
  }
  window.addEventListener("error", function (e) {
    window.__errs = window.__errs || [];
    window.__errs.push(e.message);
  });
  function el(id) { return document.getElementById(id); }
  function answerOf(svg) {
    return (svg.match(/<text class="ch"[^>]*>[^<]*<\\/text>/g) || [])
      .map(function (c) { return c.replace(/<[^>]+>/g, ""); }).join("").toUpperCase();
  }
  function entries() { return document.querySelectorAll(".wall-entry").length; }
  function note() { var n = el("wallNote"); return n ? n.textContent : "?"; }
  async function submit(nick, pass, text, opts) {
    opts = opts || {};
    var cap = await (await fetch("/mock/api/captcha")).json();
    wallCapToken = cap.token;
    wallOpenedAt = Date.now() - 6000;
    el("wallName").value = nick;
    el("wallPass").value = pass;
    el("wallMsg").value = text;
    el("wallCapAnswer").value = opts.badAnswer || answerOf(cap.svg);
    el("wallHp").value = opts.hp || "";
    await postToWall({ preventDefault: function () {} });
  }

  setTimeout(function () {
    try {
      log("разметка: форма=" + !!el("wallForm") + " ник=" + !!el("wallName") +
          " пароль=" + !!el("wallPass") + " капча=" + !!el("wallCap") + " hp=" + !!el("wallHp"));
      log("капча в img: " + (el("wallCap").src.indexOf("data:image/svg+xml") === 0));
      log("WALL_RATE=" + WALL_RATE + " (ожидаем 900)");

      /* прокручиваем к стене, чтобы её было видно на скриншоте */
      var section = document.getElementById("wallForm");
      if (section && new URLSearchParams(location.search).get('shot')) section.scrollIntoView();

      (async function () {
        try {
          /* модуль с перехватом fetch грузится позже onload — перезапрашиваем капчу */
          await loadCaptcha();
          log("капча после догрузки: " + (el("wallCap").src.indexOf("data:image/svg+xml") === 0));

          await submit("razrad", "testpass", "привет со стены");
          log("1) отправка: \\"" + note() + "\\"");
          log("   постов=" + entries() + " del-ссылок=" + document.querySelectorAll(".wall-del").length);
          log("   кнопка send заблокирована: " + el("wallSend").disabled);

          await submit("razrad", "testpass", "второе сообщение");
          log("2) повтор сразу: \\"" + note() + "\\"");

          await submit("другой", "pw2", "привет от другого ника");
          log("3) другой ник: \\"" + note() + "\\" постов=" + entries());

          await submit("третий", "pw3", "с плохой капчей", { badAnswer: "ZZZZ" });
          log("4) плохая капча: \\"" + note() + "\\"");

          await submit("бот", "pw4", "спам", { hp: "http://spam.example" });
          log("5) honeypot: \\"" + note() + "\\" постов=" + entries());

          await submit("четвёртый", "wrong", "чужой ник");
          log("6) неверный пароль: \\"" + note() + "\\"");

          log("ошибки JS: " + ((window.__errs || []).length ? window.__errs.join("|") : "нет"));
          document.title = "DONE";
        } catch (e) {
          log("ИСКЛЮЧЕНИЕ: " + ((e && e.stack) || e));
          document.title = "DONE-ERR";
        }
      })();
    } catch (e) {
      log("ИСКЛЮЧЕНИЕ (вне): " + ((e && e.stack) || e));
      document.title = "DONE-ERR";
    }
  }, 1200);
})();
</script>"""

log_box = ('<pre id="log" style="position:fixed;right:0;top:0;z-index:9999;background:#fff;'
           'color:#000;font:11px monospace;padding:4px;border:1px solid #000;max-width:460px;'
           'white-space:pre-wrap">…</pre>')

marker = '<script src="script.js"></script>'
assert marker in html, "маркер script.js не найден"
# script.js объявляет var WALL_API, поэтому переопределяем ПОСЛЕ его загрузки,
# но ДО window.onload (initWall вызывается там)
html = html.replace(marker, proxy + marker + '<script>WALL_API = "/mock";</script>' + test)
html = html.replace('<body>', '<body>\n' + log_box, 1)

out = os.path.join(root, '_wallmock.html')
io.open(out, 'w', encoding='utf-8').write(html)
print('written', out)