const $ = (s) => document.querySelector(s);
const view = $("#view");
const hdr = $("#hdr");

const S = {
  tab: "home", sel: "AUTO", id: null, on: false, busy: false, ip: "", ms: 0, ping: {}, since: 0,
  stats: null, msg: "", err: false, upd: null, q: "", autoStart: true, autoUpdate: true,
  unlocked: false, cmsg: "", cerr: false,
};
const byId = (id) => PROXIES.find((p) => p.id === id);
const canUse = (id) => S.unlocked || ACCESS.freeIds.includes(id);
const allowed = () => PROXIES.filter((p) => canUse(p.id));
const effSel = () => {
  const a = allowed();
  if (S.sel === "AUTO") return a.length > 1 ? "AUTO" : a[0].id;
  return canUse(S.sel) ? S.sel : a[0].id;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

const ICON = {
  grid: `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>`,
  gear: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>`,
  back: `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`,
  power: `<svg viewBox="0 0 24 24"><path d="M12 3v8M6.4 6.6a8 8 0 1 0 11.2 0"/></svg>`,
  rocket: `<svg viewBox="0 0 24 24"><path d="M12 3c3 2 5 5 5 9l-2 4H9l-2-4c0-4 2-7 5-9zM9 16l-2 4 3-1M15 16l2 4-3-1"/><circle cx="12" cy="10" r="1.6"/></svg>`,
  lock: `<svg class="lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
};

const FLAGS = {
  NL: `<rect width="36" height="9" fill="#ae1c28"/><rect y="8.6" width="36" height="9" fill="#fff"/><rect y="17.3" width="36" height="8.7" fill="#21468b"/>`,
  DE: `<rect width="36" height="9" fill="#111"/><rect y="8.6" width="36" height="9" fill="#dd0000"/><rect y="17.3" width="36" height="8.7" fill="#ffce00"/>`,
  CA: `<rect width="36" height="26" fill="#fff"/><rect width="9" height="26" fill="#d52b1e"/><rect x="27" width="9" height="26" fill="#d52b1e"/>
       <polygon points="18,4 20,9 24,8 22,13 25,14 19,16.5 19,21 17,21 17,16.5 11,14 14,13 12,8 16,9" fill="#d52b1e"/>`,
  US: Array.from({ length: 7 }, (_, i) => `<rect y="${(i * 26) / 7}" width="36" height="${26 / 7 + 0.3}" fill="${i % 2 ? "#fff" : "#b22234"}"/>`).join("") +
      `<rect width="16" height="14" fill="#3c3b6e"/>` +
      [3, 8, 13].flatMap((x) => [3, 7, 11].map((y) => `<circle cx="${x}" cy="${y}" r="0.9" fill="#fff"/>`)).join(""),
  KZ: `<rect width="36" height="26" fill="#00afca"/><circle cx="19" cy="11" r="4" fill="#fec50c"/>
       <circle cx="19" cy="11" r="6" fill="none" stroke="#fec50c" stroke-width="1.6" stroke-dasharray="1.4 1.6"/>
       <path d="M12 19c3 2.4 9 2.4 12 0-3 .8-9 .8-12 0z" fill="#fec50c"/><rect x="2" y="2" width="2.5" height="22" fill="#fec50c" opacity=".7"/>`,
};
function flag(id) {
  if (!id) return `<span class="flag-auto">${ICON.rocket}</span>`;
  return `<svg class="flag" viewBox="0 0 36 26" aria-hidden="true">${FLAGS[id] || FLAGS.NL}</svg>`;
}
const level = (ms) => (ms >= 99999 ? 0 : ms < 1200 ? 3 : ms < 2500 ? 2 : 1);
const bars = (ms) => `<span class="bars" data-l="${ms ? level(ms) : 0}" aria-hidden="true"><i></i><i></i><i></i></span>`;
const pingTxt = (ms) => (ms && ms < 99999 ? `${ms} мс` : "— мс");

/* ---------- скорость ---------- */
async function timed(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { cache: "no-store", ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); }
}
async function speedTest() {
  S.stats = { down: null, up: null, loading: true };
  render();
  let down = null, up = null;
  try {
    const t0 = performance.now();
    const b = await (await timed("https://speed.cloudflare.com/__down?bytes=400000", {}, 8000)).arrayBuffer();
    down = (b.byteLength * 8) / 1e6 / ((performance.now() - t0) / 1000);
  } catch { /* покажем прочерк */ }
  try {
    const t1 = performance.now();
    await timed("https://speed.cloudflare.com/__up", { method: "POST", body: new Uint8Array(150000) }, 8000);
    up = (150000 * 8) / 1e6 / ((performance.now() - t1) / 1000);
  } catch { /* покажем прочерк */ }
  S.stats = { down, up, loading: false };
  await sset({ stats: S.stats });
  render();
}
const mbps = (v) => (v == null ? "—" : v.toFixed(1));

/* ---------- подключение ---------- */
async function connect() {
  if (S.busy) return;
  S.busy = true; S.err = false; S.msg = "Подбираю сервер…";
  render();
  try {
    const r = await connectCore(S.sel);
    const st = await sget(["since", "ping"]);
    S.on = true; S.id = r.id; S.ip = r.ip; S.ms = r.ms; S.since = st.since; S.ping = st.ping || {};
    S.msg = r.fellBack ? "Выбранный сервер не отвечал, подключён другой." : "";
    S.busy = false;
    render();
    speedTest();
  } catch {
    S.on = false; S.err = true; S.msg = "Серверы не отвечают. Проверьте срок аренды прокси.";
    S.busy = false;
    render();
  }
}

async function disconnect() {
  await clearProxy();
  await sset({ on: false });
  S.on = false; S.ip = ""; S.msg = ""; S.err = false; S.stats = null;
  render();
}

/* ---------- экраны ---------- */
function header(title, mode) {
  if (mode === "home") {
    hdr.innerHTML = `<button class="icon-btn" id="h-list" aria-label="Серверы">${ICON.grid}</button>
      <span class="title"><img src="icons/icon48.png" alt="">${esc(title)}</span>
      <button class="icon-btn" id="h-set" aria-label="Настройки">${ICON.gear}</button>`;
    $("#h-list").onclick = () => { S.tab = "list"; render(); };
    $("#h-set").onclick = () => { S.tab = "settings"; render(); };
  } else {
    hdr.innerHTML = `<button class="icon-btn" id="h-back" aria-label="Назад">${ICON.back}</button>
      <span class="title">${esc(title)}</span><span style="width:38px"></span>`;
    $("#h-back").onclick = () => { S.tab = "home"; render(); };
  }
}

const fmtTime = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

function selectionInfo() {
  if (S.on && S.id) {
    return { id: S.id, name: byId(S.id).name, sub: S.sel === "AUTO" && S.unlocked ? "Выбран автоматически" : "Общий сервер", ms: S.ping[S.id] };
  }
  const e = effSel();
  if (e === "AUTO") return { id: null, name: "Авто", sub: "Самый быстрый сервер", ms: 0 };
  const p = byId(e);
  return { id: p.id, name: p.name, sub: "Общий сервер", ms: S.ping[p.id] };
}

function renderList() {
  header("Выбор сервера", "sub");
  const q = S.q.trim().toLowerCase();
  const items = PROXIES.filter((p) => !q || p.name.toLowerCase().includes(q));
  const e = effSel();
  const showAuto = S.unlocked && (!q || "авто".includes(q));
  view.innerHTML = `
    <input id="q" class="search" type="search" placeholder="Поиск страны" value="${esc(S.q)}">
    ${showAuto ? `<div class="section">Рекомендуем</div><ul class="rows"><li data-id="AUTO" class="${e === "AUTO" ? "sel" : ""}" tabindex="0">
      ${flag(null)}<span class="name">Авто<small>Самый быстрый сервер, подбирается сам</small></span><span class="dot"></span></li></ul>` : ""}
    <div class="section">Все серверы</div>
    <ul class="rows">${items.map((p) => canUse(p.id)
      ? `<li data-id="${p.id}" class="${e === p.id ? "sel" : ""}" tabindex="0">${flag(p.id)}<span class="name">${esc(p.name)}</span>${bars(S.ping[p.id])}<span class="ping">${pingTxt(S.ping[p.id])}</span><span class="dot"></span></li>`
      : `<li data-id="${p.id}" class="locked" tabindex="0">${flag(p.id)}<span class="name">${esc(p.name)}<small>Нужен код доступа</small></span>${ICON.lock}</li>`).join("")
      || `<li style="justify-content:center;cursor:default">Ничего не найдено</li>`}</ul>`;
  $("#q").addEventListener("input", (ev) => { S.q = ev.target.value; render(); const el = $("#q"); el.focus(); el.setSelectionRange(S.q.length, S.q.length); });
  view.querySelectorAll("li[data-id]").forEach((li) => {
    const go = async () => {
      const id = li.dataset.id;
      if (id !== "AUTO" && !canUse(id)) {
        S.tab = "settings"; S.cmsg = `Введите код доступа, чтобы открыть сервер «${byId(id).name}».`; S.cerr = false; return render();
      }
      S.sel = id; await sset({ sel: id }); S.tab = "home"; S.q = ""; connect();
    };
    li.onclick = go;
    li.onkeydown = (ev) => { if (ev.key === "Enter") go(); };
  });
}

function renderSettings() {
  header("Настройки", "sub");
  const opt = (id, title, text, on) => `<button class="opt" id="${id}" role="switch" aria-checked="${on}">
    <span class="t"><b>${title}</b><span>${text}</span></span><span class="track"><span class="knob"></span></span></button>`;
  const code = S.unlocked
    ? `<div class="codebox"><b>Код доступа</b><span class="d ok-text">Код принят, все серверы открыты.</span>
         <div class="crow"><button class="btn small ghost" id="b-reset">Удалить код</button></div></div>`
    : `<div class="codebox"><b>Код доступа</b><span class="d">Без кода работает только Канада. Введите код, чтобы открыть все серверы.</span>
         <div class="crow"><input id="code" type="text" placeholder="XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false"><button class="btn small" id="b-code">Применить</button></div>
         <p class="hint ${S.cerr ? "err" : ""}" role="status">${esc(S.cmsg)}</p></div>`;
  view.innerHTML = `<div class="settings">
    ${code}
    ${opt("o-start", "Включать при запуске браузера", "Прокси подключится сам", S.autoStart)}
    ${opt("o-upd", "Обновляться автоматически", "Новые версии ставятся сами", S.autoUpdate)}
    <p class="info">Версия: <b>${chrome.runtime.getManifest().version}</b><br>Сервер: <b>${S.id ? esc(byId(S.id).host + ":" + byId(S.id).port) : "не подключён"}</b></p>
    <button class="btn" id="b-upd">Проверить обновления</button>
    <p class="hint ${S.err ? "err" : ""}" role="status">${esc(S.msg || "Если прокси перестанет отвечать, расширение само переключится на другой сервер.")}</p>
    <p class="warn">Не отправляйте папку расширения другим людям: в ней логины и пароли прокси.</p></div>`;

  const apply = async () => {
    const v = normCode($("#code").value);
    if (!v) return;
    const h = await sha(v);
    if (ACCESS.codeHashes.includes(h)) {
      await sset({ codeHash: h });
      S.unlocked = true; S.cerr = false; S.cmsg = "";
    } else {
      S.cerr = true; S.cmsg = "Неверный код.";
    }
    render();
  };
  if ($("#b-code")) {
    $("#b-code").onclick = apply;
    $("#code").addEventListener("keydown", (ev) => { if (ev.key === "Enter") apply(); });
  }
  if ($("#b-reset")) {
    $("#b-reset").onclick = async () => {
      await sset({ codeHash: null });
      S.unlocked = false; S.cmsg = "";
      if (S.on && S.id && !canUse(S.id)) await disconnect();
      render();
    };
  }
  $("#o-start").onclick = async () => { S.autoStart = !S.autoStart; await sset({ autoStart: S.autoStart }); render(); };
  $("#o-upd").onclick = async () => { S.autoUpdate = !S.autoUpdate; await sset({ autoUpdate: S.autoUpdate }); render(); };
  $("#b-upd").onclick = async () => {
    if (!UPDATE.repo) { S.err = true; S.msg = "Впишите репозиторий GitHub в файле config.js."; return render(); }
    S.err = false; S.msg = "Проверяю обновления…"; render();
    const d = await checkUpdate(true);
    S.upd = d; S.err = !d;
    S.msg = !d ? "Не удалось проверить обновления." : d.pending ? `Версия ${d.latest} ещё собирается. Повторите через минуту.` : d.newer ? `Есть новая версия ${d.latest}. Откройте главный экран.` : "У вас последняя версия.";
    render();
  };
}

function renderHome() {
  header("Космопрокси", "home");
  const info = selectionInfo();
  const pill = S.busy
    ? `<span class="pill wait"><i></i>Подключение…</span>`
    : S.on
      ? `<span class="pill ok"><i></i>Подключено</span>`
      : `<span class="pill"><i></i>Не подключено</span>`;
  const updBanner = S.upd && S.upd.newer
    ? `<a class="upd" href="updater.html" target="_blank">Доступна версия ${esc(S.upd.latest)}. Обновить</a>` : "";
  const top = S.on
    ? `<div class="stats">
         <div class="stat"><b>${S.stats && S.stats.loading ? "…" : mbps(S.stats && S.stats.down)}</b><span>Мбит/с вниз</span></div>
         <div class="stat"><b>${S.stats && S.stats.loading ? "…" : mbps(S.stats && S.stats.up)}</b><span>Мбит/с вверх</span></div>
         <div class="stat"><b>${S.ms || "—"}</b><span>Пинг, мс</span></div></div>
       <div class="timer" id="timer">${fmtTime(Date.now() - S.since)}</div>`
    : "";
  view.innerHTML = `<div class="home ${S.on ? "on" : ""} ${S.busy ? "busy" : ""}">
    ${updBanner}${top}${pill}
    <p class="sub ${S.err ? "err" : ""}" role="status">${esc(S.msg || (S.on ? `Ваш IP: ${S.ip}` : ""))}</p>
    <div class="rings"><i class="r1"></i><i class="r2"></i><i class="r3"></i>
      <button class="power" id="power" aria-label="${S.on ? "Выключить" : "Включить"}">${S.on || S.busy ? ICON.power : ICON.rocket}</button></div>
    <button class="loc" id="loc">${flag(info.id)}<span class="meta"><b>${esc(info.name)}</b><span>${esc(info.sub)}</span></span><span class="change">Сменить ›</span></button>
  </div>`;
  $("#power").onclick = () => (S.busy ? null : S.on ? disconnect() : connect());
  $("#loc").onclick = () => { S.tab = "list"; render(); };
}

function render() {
  if (S.tab === "list") return renderList();
  if (S.tab === "settings") return renderSettings();
  renderHome();
}

setInterval(() => {
  const t = $("#timer");
  if (t && S.on) t.textContent = fmtTime(Date.now() - S.since);
}, 1000);

(async function init() {
  const st = await sget(["sel", "id", "on", "since", "ping", "stats", "autoStart", "autoUpdate"]);
  S.sel = st.sel || "AUTO";
  S.ping = st.ping || {};
  S.autoStart = st.autoStart !== false;
  S.autoUpdate = st.autoUpdate !== false;
  S.unlocked = await unlocked();
  render();
  checkUpdate(false).then((d) => { S.upd = d; if (S.tab === "home") render(); });

  const v = (await readProxy()).value;
  const active = v && v.mode === "fixed_servers" && v.rules && v.rules.singleProxy
    ? PROXIES.find((p) => p.host === v.rules.singleProxy.host) : null;
  if (active) {
    if (!canUse(active.id)) { await disconnect(); return; } // код сняли, а прокси остался: отключаем
    S.on = true; S.id = active.id; S.since = st.since || Date.now(); S.stats = st.stats || null;
    render();
    try {
      const t0 = performance.now();
      S.ip = await getIP(8000);
      S.ms = Math.round(performance.now() - t0);
      if (!S.stats) speedTest();
    } catch { S.err = true; S.msg = "Прокси сейчас не отвечает."; }
    render();
  }
})();
