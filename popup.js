const $ = (s) => document.querySelector(s);
const view = $("#view");
const hdr = $("#hdr");

const S = { tab: "home", id: PROXIES[0].id, on: false, busy: false, ip: "", ms: 0, ping: {}, upd: null, msg: "", err: false };
const AD = ADS.length ? ADS[Math.floor(Math.random() * ADS.length)] : null;
const cur = () => PROXIES.find((p) => p.id === S.id) || PROXIES[0];

const applyProxy = (p) =>
  new Promise((r) =>
    chrome.proxy.settings.set(
      {
        value: {
          mode: "fixed_servers",
          rules: {
            singleProxy: { scheme: "http", host: p.host, port: p.port },
            bypassList: ["localhost", "127.0.0.1", "<local>", "api.github.com", "github.com", "*.github.com", "*.githubusercontent.com"],
          },
        },
        scope: "regular",
      },
      r
    )
  );
const clearProxy = () => new Promise((r) => chrome.proxy.settings.clear({ scope: "regular" }, r));
const readProxy = () => new Promise((r) => chrome.proxy.settings.get({ incognito: false }, r));
const saveState = () => chrome.storage.local.set({ id: S.id, ping: S.ping });

async function getIP(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal, cache: "no-store" });
    return (await res.json()).ip;
  } finally {
    clearTimeout(t);
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

async function check() {
  const t0 = performance.now();
  S.ip = await getIP(10000);
  S.ms = Math.round(performance.now() - t0);
  S.ping[S.id] = S.ms;
  saveState();
}

async function connect(id) {
  if (S.busy) return;
  if (id) S.id = id;
  saveState();
  S.busy = true;
  S.err = false;
  S.msg = "Подключаюсь…";
  render();
  await applyProxy(cur());
  try {
    await check();
    S.on = true;
    S.msg = "";
  } catch {
    await clearProxy();
    S.on = false;
    S.err = true;
    S.msg = "Прокси не отвечает. Проверьте срок аренды или выберите другую страну.";
  }
  S.busy = false;
  render();
}

async function disconnect() {
  await clearProxy();
  S.on = false;
  S.ip = "";
  S.msg = "";
  S.err = false;
  render();
}

function flag(id) {
  const body =
    id === "CA"
      ? `<rect width="36" height="26" fill="#fff"/><rect width="9" height="26" fill="#d52b1e"/><rect x="27" width="9" height="26" fill="#d52b1e"/>
         <polygon points="18,4 20,9 24,8 22,13 25,14 19,16.5 19,21 17,21 17,16.5 11,14 14,13 12,8 16,9" fill="#d52b1e"/>`
      : `<rect width="36" height="9" fill="#ae1c28"/><rect y="8.6" width="36" height="9" fill="#fff"/><rect y="17.3" width="36" height="8.7" fill="#21468b"/>`;
  return `<svg class="flag" viewBox="0 0 36 26" aria-hidden="true">${body}</svg>`;
}

const pingText = (id) => (S.ping[id] ? `<span class="ping ${S.ping[id] < 1200 ? "good" : ""}">${S.ping[id]} мс</span>` : `<span class="ping">— мс</span>`);

const ICON = {
  back: `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`,
  gear: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>`,
  power: `<svg viewBox="0 0 24 24"><path d="M12 3v8M6.4 6.6a8 8 0 1 0 11.2 0"/></svg>`,
  chev: `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
  check: `<svg class="check" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>`,
};

function adHtml() {
  if (!AD) return "";
  const inner = `<span class="ad-tag">Реклама</span><b>${esc(AD.title)}</b><span>${esc(AD.text || "")}</span>`;
  return AD.url
    ? `<a class="ad" href="${esc(AD.url)}" target="_blank" rel="noopener sponsored">${inner}</a>`
    : `<div class="ad">${inner}</div>`;
}

function updHtml() {
  return S.upd && S.upd.newer
    ? `<a class="upd" href="updater.html" target="_blank">Доступна версия ${esc(S.upd.latest)}. Обновить</a>`
    : "";
}

function renderHeader(titleText, withBack) {
  hdr.innerHTML = withBack
    ? `<button class="icon-btn" id="back" aria-label="Назад">${ICON.back}</button><span class="title">${esc(titleText)}</span>`
    : `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#3f9d5b"/><path d="M16 8v8M11.5 11a6.5 6.5 0 1 0 9 0" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>
       <span class="title">${esc(titleText)}</span><button class="icon-btn" id="gear" aria-label="О прокси">${ICON.gear}</button>`;
  const back = $("#back");
  if (back) back.addEventListener("click", () => { S.tab = "home"; render(); });
  const gear = $("#gear");
  if (gear) gear.addEventListener("click", () => { S.tab = "settings"; render(); });
}

function render() {
  const p = cur();

  if (S.tab === "list") {
    renderHeader("Выбор страны", true);
    view.innerHTML = `<ul class="rows">${PROXIES.map((x) => `
      <li data-id="${x.id}" class="${x.id === S.id ? "sel" : ""}" tabindex="0">
        ${flag(x.id)}<span class="name">${esc(x.name)}</span>${pingText(x.id)}${x.id === S.id ? ICON.check : ""}
      </li>`).join("")}</ul>`;
    view.querySelectorAll("li").forEach((li) => {
      const go = () => { S.tab = "home"; connect(li.dataset.id); };
      li.addEventListener("click", go);
      li.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
    return;
  }

  if (S.tab === "settings") {
    renderHeader("О прокси", true);
    view.innerHTML = `
      <div class="settings">
        <p class="stat">Версия: <b>${chrome.runtime.getManifest().version}</b></p>
        <p class="stat">Страна: <b>${esc(p.name)}</b></p>
        <p class="stat">Сервер: <b>${esc(p.host)}:${p.port}</b></p>
        <p class="stat">Состояние: <b>${S.on ? "подключён" : "выключен"}</b>${S.on && S.ms ? ` · ответ ${S.ms} мс` : ""}</p>
        <button class="btn" id="test" ${S.busy ? "disabled" : ""}>Проверить соединение</button>
        <button class="btn" id="upd" style="background:var(--card);color:var(--ink)">Проверить обновления</button>
        <p class="hint ${S.err ? "err" : ""}" role="status">${esc(S.msg || "Логины и пароли лежат в файле background.js внутри папки расширения.")}</p>
        <p class="warn">Не отправляйте папку расширения другим людям: в ней логины и пароли прокси. Серверы общие, ими пользуются до 3 человек.</p>
      </div>`;
    $("#test").addEventListener("click", async () => {
      if (!S.on) return connect();
      S.msg = "Проверяю…"; render();
      try { await check(); S.err = false; S.msg = `Работает. Ваш IP: ${S.ip}`; } catch { S.err = true; S.msg = "Прокси не отвечает."; }
      render();
    });
    $("#upd").addEventListener("click", async () => {
      if (!UPDATE.repo) { S.err = true; S.msg = "Впишите репозиторий GitHub в файле config.js."; return render(); }
      S.err = false; S.msg = "Проверяю обновления…"; render();
      const d = await checkUpdate(true);
      S.upd = d;
      S.err = !d;
      S.msg = !d ? "Не удалось проверить. Проверьте имя репозитория и наличие релиза." : d.newer ? `Есть новая версия ${d.latest}.` : "У вас последняя версия.";
      render();
    });
    return;
  }

  renderHeader("Прокси в 1 клик", false);
  const state = S.busy ? "ПОДКЛЮЧЕНИЕ" : S.on ? "ПОДКЛЮЧЕНО" : "ОТКЛЮЧЕНО";
  const sub = S.msg || (S.on ? `Ваш IP: ${S.ip}` : "Нажмите, чтобы включить");
  view.innerHTML = `
    <div class="home ${S.on ? "on" : ""} ${S.busy ? "busy" : ""}">
      <div class="state">${state}</div>
      <p class="sub ${S.err ? "err" : ""}" role="status">${esc(sub)}</p>
      <button class="power" id="power" aria-label="${S.on ? "Выключить" : "Включить"}">${ICON.power}</button>
      ${updHtml()}${adHtml()}
      <button class="loc" id="loc">
        ${flag(p.id)}
        <span class="meta"><b>${esc(p.name)}</b><span>Общий сервер</span></span>
        ${pingText(p.id)}${ICON.chev}
      </button>
    </div>`;
  $("#power").addEventListener("click", () => (S.busy ? null : S.on ? disconnect() : connect()));
  $("#loc").addEventListener("click", () => { S.tab = "list"; render(); });
}

(async function init() {
  const saved = await new Promise((r) => chrome.storage.local.get(["id", "ping"], r));
  if (saved.id && PROXIES.some((p) => p.id === saved.id)) S.id = saved.id;
  if (saved.ping) S.ping = saved.ping;
  render();
  checkUpdate(false).then((d) => { S.upd = d; if (S.tab === "home") render(); });
  const v = (await readProxy()).value;
  const active = v && v.mode === "fixed_servers" && v.rules && v.rules.singleProxy
    ? PROXIES.find((p) => p.host === v.rules.singleProxy.host) : null;
  if (active) {
    S.id = active.id;
    S.on = true;
    render();
    try { await check(); } catch { S.err = true; S.msg = "Прокси сейчас не отвечает."; }
    render();
  }
})();
