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
var WALL_KEY     = "razrad_wall_2";     /* сменил ключ — старая стена очищена */
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

/* ---------- стена ---------- */
function getWall() {
  try { return JSON.parse(localStorage.getItem(WALL_KEY)) || []; }
  catch (e) { return []; }
}
function saveWall(list) {
  try { localStorage.setItem(WALL_KEY, JSON.stringify(list)); } catch (e) {}
}
function postToWall(ev) {
  ev.preventDefault();
  var name = document.getElementById("wallName").value.trim();
  var msg = document.getElementById("wallMsg").value.trim();
  if (!name || !msg) return false;

  var list = getWall();
  list.unshift({ name: name, msg: msg, ts: Date.now() });
  if (list.length > 100) list = list.slice(0, 100);
  saveWall(list);
  renderWall();
  document.getElementById("wallForm").reset();
  return false;
}
function renderWall() {
  var box = document.getElementById("wall");
  if (!box) return;
  var list = getWall();
  if (!list.length) {
    box.innerHTML = '<div class="wall-empty">пока пусто. будь первым.</div>';
    return;
  }
  var html = "";
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    html += '<div class="wall-entry">' +
              '<span class="when">' + fmt(e.ts) + '</span>' +
              '<span class="who">' + esc(e.name) + '</span><br>' + esc(e.msg) +
            '</div>';
  }
  box.innerHTML = html;
}
function initWallClear() {
  var btn = document.getElementById("wallClear");
  if (!btn) return;
  btn.onclick = function (e) {
    e.preventDefault();
    if (!window.confirm("очистить всю стену?")) return false;
    saveWall([]);
    renderWall();
    return false;
  };
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
  renderWall();
  initWallClear();
  bindCopy("discordBtn", DISCORD_NAME, "ник в discord");
  bindCopy("mailBtn", MAIL_ADDR, "e-mail");
  initModes();
  initVolume();
  initPlayer();
  initCats();
};
