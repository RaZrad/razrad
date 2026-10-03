/* razrad — скрипт: плеер лайков, стена, счётчик-баннер, рандомные котики, режимы. */

/* ==== список лайкнутых треков (soundcloud) ====
   чтобы обновить — просто добавь/поменяй строки ниже */
var SC_TRACKS = [
  { t: "CUPSIZE - Я Ненавижу Этот Ебучий Дождь",       u: "https://soundcloud.com/w1rten/cupsize-ya-nenavizhu-etot", id: "2278392017" },
  { t: "CUPSIZE - упаду (snippet)",            u: "https://soundcloud.com/linalifonova/ypady-snippet-16-09-26", id: "2401311264" },
  { t: "internetdoublex - kitten club (angeless)",      u: "https://soundcloud.com/internet2x/kitten-club-angeless", id: "1383628255" },
  { t: "Alice - Parade 2025",                           u: "https://soundcloud.com/alicelitter/parade", id: "2209484633" },
  { t: "ONDA ANDAR - one way ticket",    u: "https://soundcloud.com/source-mus/onda-andar-one-way-ticket-1", id: "2402664552" },
  { t: "королевский XVII - l2 hunter",                  u: "https://soundcloud.com/royalxvii/l2-hunter", id: "1600948998" },
  { t: "sqwore - roma2",                                u: "https://soundcloud.com/sqwhore/roma2", id: "2216443505" },
  { t: "CUPSIZE - антидепрессанты (snippet)",  u: "https://soundcloud.com/linalifonova/antidepressanty-snippet-11-07-26", id: "2358846302" },
  { t: "madk1d - злая зая ХД",                 u: "https://soundcloud.com/german-ilin-555497570/zlaya-zaya-xd-madk1d", id: "2272657124" },
  { t: "CUPSIZE - Я Мёртв (snippet)",                   u: "https://soundcloud.com/528950741/cupsize-ya-myortv", id: "1811995290" }
];

/* локальные котики — используются, если интернета нет */
var CAT_LOCAL = [
  "gifs/cat-run.gif", "gifs/cat-angry.gif", "gifs/cat-guitar.gif", "gifs/cat-pixel.gif",
  "gifs/cat-pixel2.gif", "gifs/cat-heart.gif", "gifs/cat-sign.gif", "gifs/cat-face.gif",
  "gifs/cat-globe.gif", "gifs/neko-chibi.gif", "gifs/cat-spooky.gif"
];

var DISCORD_NAME = "razrad_";
var MAIL_ADDR    = "razrad@xyecoc.com";
var HITS_KEY     = "razrad_hits";
var VOL_KEY      = "razrad_vol";
var MODE_KEY     = "razrad_mode";       /* day | night | halloween */

var widget = null;
var ready = false;
var volume = 80;

function pad(n, len) {
  var s = String(n);
  while (s.length < len) s = "0" + s;
  return s;
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(ts) {
  var d = new Date(ts);
  return pad(d.getDate(), 2) + "." + pad(d.getMonth() + 1, 2) + "." + d.getFullYear() +
         " " + pad(d.getHours(), 2) + ":" + pad(d.getMinutes(), 2);
}

/* ---------- soundcloud ---------- */
function initPlayer() {
  var list = document.getElementById("tracklist");
  for (var i = 0; i < SC_TRACKS.length; i++) {
    var li = document.createElement("li");
    var a = document.createElement("a");
    a.href = "#";
    a.textContent = SC_TRACKS[i].t;
    a.setAttribute("data-i", i);
    a.onclick = (function (idx) {
      return function (e) { e.preventDefault(); playTrack(idx); return false; };
    })(i);
    li.appendChild(a);
    list.appendChild(li);
  }

  if (window.SC && document.getElementById("sc")) {
    widget = SC.Widget("sc");
    widget.bind(SC.Widget.Events.READY, function () {
      ready = true;
      applyVolume();
      widget.bind(SC.Widget.Events.PLAY, updateNow);
    });
  }

  document.getElementById("randBtn").onclick = function () {
    playTrack(Math.floor(Math.random() * SC_TRACKS.length));
  };
}

function scLoadUrl(tr) { return "https://api.soundcloud.com/tracks/" + tr.id; }

/* ---------- громкость ---------- */
function initVolume() {
  var slider = document.getElementById("vol");
  var out = document.getElementById("volVal");
  if (!slider || !out) return;
  try { var v = parseInt(localStorage.getItem(VOL_KEY), 10); if (!isNaN(v)) volume = v; } catch (e) {}
  slider.value = volume;
  out.textContent = volume;
  slider.oninput = function () {
    volume = parseInt(slider.value, 10);
    out.textContent = volume;
    applyVolume();
    try { localStorage.setItem(VOL_KEY, volume); } catch (e) {}
  };
  applyVolume();
}
function applyVolume() {
  if (widget && ready) widget.setVolume(volume);
}

function highlight(idx) {
  var items = document.querySelectorAll("#tracklist li");
  for (var i = 0; i < items.length; i++) {
    items[i].className = (i === idx) ? "active" : "";
  }
}

function updateNow() {
  if (!widget) return;
  widget.getCurrentSound(function (s) {
    var el = document.getElementById("now");
    if (s && s.title) {
      el.textContent = "▶ " + s.title;
      el.className = "now playing";
    }
  });
}

function playTrack(idx) {
  var track = SC_TRACKS[idx];
  if (!track) return;
  highlight(idx);
  var el = document.getElementById("now");
  el.textContent = "▶ " + track.t;
  el.className = "now playing";

  if (widget) {
    widget.load(scLoadUrl(track), {
      auto_play: true,
      callback: function () { widget.setVolume(volume); widget.play(); }
    });
  } else {
    window.open(track.u, "_blank");
  }
}

/* ---------- стена: общая, через Cloudflare Worker + KV ---------- */
var WALL_API     = "https://razrad-dashboard.vanyokpenok123321.workers.dev";
var WALL_NICK    = "razrad_wall_nick";   /* последний ник — только для подсказки, пароль не храним */
var WALL_RATE    = 900;                 /* сек между сообщениями, уточняется у сервера */
var wallCdUntil  = 0;
var wallOpenedAt = Date.now();
var wallCapToken = "";

function wallNote(text, kind) {
  var el = document.getElementById("wallNote");
  if (!el) return;
  el.textContent = text || "";
  el.className = "wall-note" + (kind ? " " + kind : "");
}

function wallApi(path, body) {
  return fetch(WALL_API + path, body ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  } : undefined).then(function (r) {
    return r.json().catch(function () { return { ok: false, error: "badjson" }; });
  }).catch(function () { return { ok: false, error: "offline" }; });
}

function wallErrorText(d) {
  var e = d && d.error;
  if (e === "captcha") return "капча не совпала — новая картинка уже загружена.";
  if (e === "fast")    return "форма открыта слишком недолго — подожди пару секунд.";
  if (e === "pass")    return "пароль от этого ника не подходит.";
  if (e === "locked")  return "слишком много попыток с неверным паролем. попробуй через час.";
  if (e === "nick")    return "ник не подходит: 2–20 символов, буквы/цифры/._-";
  if (e === "text")    return "сообщение пустое или слишком длинное.";
  if (e === "ip")      return "слишком много попыток с этого устройства. подожди час.";
  if (e === "rate")    return "подожди " + Math.ceil((d.retry || WALL_RATE) / 60) + " мин — одно сообщение в " + Math.ceil(WALL_RATE / 60) + " мин.";
  if (e === "offline") return "не долетел до стены. проверь интернет.";
  if (e === "config")  return "стена ещё не настроена на сервере.";
  return "стена не ответила (" + (e || "ошибка") + ").";
}

function loadCaptcha() {
  return wallApi("/api/captcha").then(function (d) {
    var img = document.getElementById("wallCap");
    if (!img) return;
    if (!d.ok || !d.svg) { img.removeAttribute("src"); return; }
    wallCapToken = d.token;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(d.svg);
  });
}

function renderWall(list) {
  var box = document.getElementById("wall");
  if (!box) return;
  if (!list || !list.length) {
    box.innerHTML = '<div class="wall-empty">пока пусто. будь первым.</div>';
    return;
  }
  var html = "";
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    html += '<div class="wall-entry">' +
              '<span class="when">' + fmt(e.ts) + '</span>' +
              '<span class="who">' + esc(e.nick) + '</span>' +
              '<a href="#" class="wall-del" data-id="' + esc(e.id) + '" data-nick="' +
                esc(e.nick) + '" title="удалить (нужен пароль от ника)">del</a><br>' +
              esc(e.text) +
            '</div>';
  }
  box.innerHTML = html;
}

function refreshWall() {
  return wallApi("/api/posts").then(function (d) {
    if (d.ok) { renderWall(d.posts); return; }
    renderWall([]);
    wallNote(wallErrorText(d), "bad");
  });
}

function postToWall(ev) {
  ev.preventDefault();
  var f = document.getElementById("wallForm");
  var nameEl = document.getElementById("wallName");
  var passEl = document.getElementById("wallPass");
  var msgEl = document.getElementById("wallMsg");
  var ansEl = document.getElementById("wallCapAnswer");
  if (!f || !nameEl || !passEl || !msgEl || !ansEl) {
    wallNote("форма стены устарела — обнови страницу (ctrl+F5).", "bad");
    return false;
  }
  var name = nameEl.value.trim();
  var pass = passEl.value;
  var msg  = msgEl.value.trim();
  var ans  = ansEl.value.trim();
  if (!name || !msg || !ans) return false;

  var send = document.getElementById("wallSend");
  send.disabled = true;
  wallNote("отправляю...");

  return wallApi("/api/post", {
    nick: name,
    pass: pass,
    text: msg,
    captcha: wallCapToken,
    answer: ans,
    t0: wallOpenedAt,
    hp: (document.getElementById("wallHp") || {}).value || ""
  }).then(function (d) {
    send.disabled = false;
    if (d.ok) {
      try { localStorage.setItem(WALL_NICK, name); } catch (e) {}
      msgEl.value = "";
      ansEl.value = "";
      wallOpenedAt = Date.now();
      wallNote(d.created
        ? "ник «" + name + "» теперь твой — заходи с этим паролем откуда угодно."
        : "записано!", "good");
      loadCaptcha();
      refreshWall();
      setWallCd((d.retry || WALL_RATE) * 1000);
    } else {
      wallNote(wallErrorText(d), "bad");
      loadCaptcha();
    }
    return false;
  });
}

/* обратный отсчёт до следующего сообщения */
function setWallCd(ms) {
  wallCdUntil = Date.now() + ms;
  var send = document.getElementById("wallSend");
  var note = document.getElementById("wallNote");
  var tick = function () {
    var left = wallCdUntil - Date.now();
    if (left <= 0) {
      send.disabled = false;
      send.textContent = "send";
      if (note && /подожди|следующее/.test(note.textContent)) note.textContent = "";
      return;
    }
    var min = Math.ceil(left / 60000);
    send.disabled = true;
    send.textContent = "⏳ " + min + " мин";
    wallNote("следующее сообщение можно оставить через " + min + " мин.");
    setTimeout(tick, 5000);
  };
  tick();
}

function initWall() {
  var btn = document.getElementById("wallClear");
  if (btn) btn.onclick = function (e) { e.preventDefault(); refreshWall(); return false; };

  /* клик по картинке — новая капча */
  var cap = document.getElementById("wallCap");
  if (cap) {
    cap.onclick = function () {
      document.getElementById("wallCapAnswer").value = "";
      loadCaptcha();
    };
  }

  /* удаление своего поста: спрашиваем пароль */
  var box = document.getElementById("wall");
  if (box) {
    box.onclick = function (e) {
      var a = e.target;
      if (!a || !a.classList || !a.classList.contains("wall-del")) return;
      e.preventDefault();
      var nick = a.getAttribute("data-nick");
      var id = a.getAttribute("data-id");
      var pass = window.prompt("пароль от ника «" + nick + "»:");
      if (!pass) return;
      wallNote("удаляю...");
      wallApi("/api/delete", { id: id, nick: nick, pass: pass }).then(function (d) {
        if (d.ok) { wallNote("удалено", "good"); refreshWall(); }
        else wallNote(wallErrorText(d), "bad");
      });
    };
  }

  /* подставляем прошлый ник (пароль не храним) */
  try {
    var last = localStorage.getItem(WALL_NICK);
    if (last) {
      var nameEl = document.getElementById("wallName");
      if (nameEl && !nameEl.value) nameEl.value = last;
    }
  } catch (e) {}

  /* лимиты с сервера + стартовое состояние */
  wallApi("/api/config").then(function (d) {
    if (d.ok && d.rate) WALL_RATE = d.rate;
  });
  loadCaptcha();
  refreshWall();
}

/* ---------- баннер: счётчик заходов ---------- */
function initCounter() {
  var BASE = 1337;
  var hits;
  try {
    hits = parseInt(localStorage.getItem(HITS_KEY), 10);
    if (isNaN(hits) || hits < BASE) hits = BASE;
    hits = hits + 1;
    localStorage.setItem(HITS_KEY, hits);
  } catch (e) { hits = BASE; }

  var box = document.getElementById("odometer");
  if (!box) return;
  var s = pad(hits, 6);
  var html = "";
  for (var i = 0; i < s.length; i++) html += "<i>" + s.charAt(i) + "</i>";
  box.innerHTML = html;
}

/* ---------- кнопки-копировалки (discord / mail) ---------- */
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
    return;
  }
  var ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
}
function bindCopy(id, value, label) {
  var btn = document.getElementById(id);
  if (!btn) return;
  btn.onclick = function (e) {
    e.preventDefault();
    copyText(value);
    var note = document.getElementById("copied");
    note.textContent = label + " скопирован: " + value;
    setTimeout(function () { note.textContent = ""; }, 3000);
    return false;
  };
}
/* ---------- рандомные котики ---------- */
function initCats() {
  var img  = document.getElementById("catImg");
  var btn  = document.getElementById("catBtn");
  var note = document.getElementById("catNote");
  if (!img || !btn) return;

  var lastLocal = -1;

  function localCat() {
    var i;
    do { i = Math.floor(Math.random() * CAT_LOCAL.length); }
    while (CAT_LOCAL.length > 1 && i === lastLocal);
    lastLocal = i;
    img.src = CAT_LOCAL[i];
  }

  /* проверяем, что картинка реально грузится, только потом показываем */
  function showUrl(url, srcName) {
    return new Promise(function (resolve, reject) {
      var probe = new Image();
      probe.onload  = function () { img.src = url; note.textContent = "источник: " + srcName; resolve(); };
      probe.onerror = function () { reject(new Error("no image")); };
      probe.src = url;
    });
  }

  function newCat() {
    note.textContent = "ищу котика...";
    var bust = "&t=" + Date.now();

    /* 1) TheCatAPI — без ключа, CORS разрешён */
    fetch("https://api.thecatapi.com/v1/images/search?limit=1" + bust)
      .then(function (r) { return r.json(); })
      .then(function (d) { return showUrl(d[0].url, "thecatapi.com"); })
      .catch(function () {
        /* 2) резервный сервис */
        return fetch("https://some-random-api.com/animal/cat?t=" + Date.now())
          .then(function (r) { return r.json(); })
          .then(function (d) { return showUrl(d.image, "some-random-api.com"); });
      })
      .catch(function () {
        /* 3) локальная коллекция */
        localCat();
        note.textContent = "нет сети — котик из локальной коллекции";
      });
  }

  btn.onclick = newCat;
  localCat();               /* на старте — тихо, без сети */
  note.textContent = "";
}

/* ---------- pop it: окно в стиле сапера, поле 32×32 без бомб и флажков ---------- */
var POP_SIZE = 32;
var POP_TOTAL = POP_SIZE * POP_SIZE;
var POP_SOUND = "sounds/pop.wav";
var POP_POOL = [];        /* несколько копий звука, чтобы клики не резались */
var popPoolIdx = 0;
var popGridBuilt = false;

/* короткий приятный «пузырёк»: высокий питч -> низкий, чем ниже клетка по ряду */
function playPop(row) {
  initPopSound();
  var a = POP_POOL[popPoolIdx];
  popPoolIdx = (popPoolIdx + 1) % POP_POOL.length;
  var rate = 1.32 - (row / (POP_SIZE - 1)) * 0.62;   /* сверху звончее, снизу глуше */
  try {
    a.pause();
    a.currentTime = 0;
    a.playbackRate = rate;
    a.volume = Math.max(0, Math.min(1, volume / 100));
    var p = a.play();
    if (p && p.catch) p.catch(function () {});
  } catch (e) {}
}

/* обратное «вдувание»: тот же звук, но ниже и тише */
function playInflate() {
  initPopSound();
  var a = POP_POOL[popPoolIdx];
  popPoolIdx = (popPoolIdx + 1) % POP_POOL.length;
  try {
    a.pause();
    a.currentTime = 0;
    a.playbackRate = 0.72 + Math.random() * 0.1;
    a.volume = Math.max(0, Math.min(1, volume / 100)) * 0.55;
    var p = a.play();
    if (p && p.catch) p.catch(function () {});
  } catch (e) {}
}

function initPopSound() {
  if (POP_POOL.length) return;
  for (var i = 0; i < 6; i++) {
    var a = new Audio(POP_SOUND);
    a.preload = "auto";
    try { a.load(); } catch (e) {}
    POP_POOL.push(a);
  }
}

function buildPopGrid() {
  if (popGridBuilt) return;
  var grid = document.getElementById("popGrid");
  if (!grid) return;
  var html = "";
  for (var i = 0; i < POP_TOTAL; i++) {
    html += '<div class="pop-cell" data-i="' + i + '"></div>';
  }
  grid.innerHTML = html;
  popGridBuilt = true;
}

function popCount() {
  var grid = document.getElementById("popGrid");
  return grid ? grid.querySelectorAll(".pop-cell.popped").length : 0;
}
function updatePopStat() {
  var el = document.getElementById("popStat");
  if (el) el.textContent = "попнуто: " + popCount() + " / " + POP_TOTAL;
}

function clearPopField() {
  var grid = document.getElementById("popGrid");
  if (!grid) return;
  var cells = grid.querySelectorAll(".pop-cell");
  for (var i = 0; i < cells.length; i++) {
    cells[i].className = "pop-cell";
  }
  updatePopStat();
}

function openPopModal() {
  var m = document.getElementById("popModal");
  if (!m) return;
  buildPopGrid();
  initPopSound();
  m.hidden = false;
  updatePopStat();
}

function closePopModal() {
  var m = document.getElementById("popModal");
  if (m) m.hidden = true;
}

function initPop() {
  var btn = document.getElementById("popBtn");
  if (!btn) return;

  btn.onclick = function () {
    if (document.getElementById("popModal").hidden) openPopModal();
    else closePopModal();
  };

  document.getElementById("popClose").onclick = closePopModal;
  document.getElementById("popReset").onclick = clearPopField;

  /* клик по фону окна тоже закрывает */
  document.getElementById("popModal").onclick = function (e) {
    if (e.target === this) closePopModal();
  };

  /* правая кнопка мыши / долгое нажатие на тач — «вдуть обратно» */
  var holdTimer = null;

  function inflateIfPopped(e) {
    var cell = e.target;
    if (!cell || !cell.classList || !cell.classList.contains("pop-cell")) return false;
    if (!cell.classList.contains("popped")) return false;
    cell.className = "pop-cell";
    playInflate();
    updatePopStat();
    return true;
  }

  document.addEventListener("contextmenu", function (e) {
    if (!e.target || !e.target.classList || !e.target.classList.contains("pop-cell")) return;
    e.preventDefault();
    inflateIfPopped(e);
  });

  document.addEventListener("pointerdown", function (e) {
    var cell = e.target;
    if (!cell || !cell.classList || !cell.classList.contains("pop-cell")) return;
    if (e.button === 2) {                 /* правая кнопка — отмена */
      e.preventDefault();
      inflateIfPopped(e);
      return;
    }

    if (cell.classList.contains("popped")) return;   /* по лопнувшей — ничего */

    var i = parseInt(cell.getAttribute("data-i"), 10);
    cell.className = "pop-cell popped";
    playPop(Math.floor(i / POP_SIZE));
    updatePopStat();

    /* на тач-экранах долгое нажатие по лопнувшей клетке её «вдувает» */
    if (e.pointerType === "touch") {
      var target = cell;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        holdTimer = null;
        if (target.classList.contains("popped")) {
          target.className = "pop-cell";
          playInflate();
          updatePopStat();
        }
      }, 600);
    }
  });

  document.addEventListener("pointerup", function () { clearTimeout(holdTimer); });
  document.addEventListener("pointercancel", function () { clearTimeout(holdTimer); });

  /* Esc закрывает */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePopModal();
  });
}

/* ---------- режимы: день / ночь / хеллоуин ---------- */
function initModes() {
  var nightBtn = document.getElementById("night");
  var pumpBtn  = document.getElementById("pumpkin");
  if (!nightBtn || !pumpBtn) return;

  function apply(night, pump) {
    document.body.classList.toggle("night", night);
    document.body.classList.toggle("halloween", pump);
    nightBtn.classList.toggle("on", night);
    pumpBtn.classList.toggle("on", pump);
    try {
      localStorage.setItem(MODE_KEY, night ? "night" : (pump ? "halloween" : "day"));
    } catch (e) {}
  }

  nightBtn.onclick = function () {
    apply(!document.body.classList.contains("night"), false);
  };
  pumpBtn.onclick = function () {
    apply(false, !document.body.classList.contains("halloween"));
  };

  var saved = "day";
  try { saved = localStorage.getItem(MODE_KEY) || "day"; } catch (e) {}
  apply(saved === "night", saved === "halloween");
}

/* ---------- старт ---------- */
window.onload = function () {
  initCounter();
  initWall();
  bindCopy("discordBtn", DISCORD_NAME, "ник в discord");
  bindCopy("mailBtn", MAIL_ADDR, "e-mail");
  initModes();
  initVolume();
  initPlayer();
  initCats();
  initPop();
};
