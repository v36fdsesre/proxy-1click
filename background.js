importScripts("secrets.js", "config.js", "update.js", "core.js");

const tried = new Set();

// Когда прокси просит логин и пароль, отвечаем сами и окно входа не показываем.
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    const p = details.isProxy && details.challenger ? PROXIES.find((x) => x.host === details.challenger.host) : null;
    if (!p) return callback({});
    if (tried.has(details.requestId)) return callback({ cancel: true }); // неверные данные: не зацикливаемся
    tried.add(details.requestId);
    setTimeout(() => tried.delete(details.requestId), 60000);
    callback({ authCredentials: { username: p.user, password: p.pass } });
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

// Файлы в папке расширения обновляет помощник Windows (если он установлен). Здесь замечаем, что версия
// в manifest.json на диске новее запущенной, и перезапускаем расширение.
async function reloadIfUpdatedOnDisk() {
  if (!(await settings()).autoUpdate) return;
  try {
    const r = await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" });
    const m = await r.json();
    if (m.version && m.version !== chrome.runtime.getManifest().version) chrome.runtime.reload();
  } catch { /* файл как раз копируется, проверим в следующий раз */ }
}

// Проверка новой версии на GitHub: на иконке появляется значок «1».
async function checkAndBadge() {
  const d = await checkUpdate(true);
  const { connFail } = await sget("connFail");
  chrome.action.setBadgeBackgroundColor({ color: "#6d5bff" });
  chrome.action.setBadgeText({ text: d && d.newer ? "1" : connFail ? "!" : "" });
}

// Каждые 5 минут проверяем, что прокси жив. Если нет, переключаемся на другой.
async function watchdog() {
  const { on } = await sget("on");
  if (!on) return;
  try {
    await getIP(8000);
    await sset({ connFail: false });
  } catch {
    try { await connectCore("AUTO"); } catch { await sset({ connFail: true }); chrome.action.setBadgeText({ text: "!" }); }
  }
}

chrome.alarms.create("upd", { periodInMinutes: Math.max(1, UPDATE.minutes || 1) });
chrome.alarms.create("watch", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "upd") reloadIfUpdatedOnDisk().then(checkAndBadge);
  if (a.name === "watch") watchdog();
});

chrome.runtime.onInstalled.addListener(async (d) => {
  await checkAndBadge();
  if (d.reason === "update") {
    // Расширение только что обновилось: отмечаем это значком и открываем окно с новой версией.
    chrome.action.setBadgeBackgroundColor({ color: "#38d39f" });
    chrome.action.setBadgeText({ text: "✓" });
    try { await chrome.action.openPopup(); } catch { /* нет открытого окна браузера */ }
  }
});
chrome.runtime.onStartup.addListener(async () => {
  reloadIfUpdatedOnDisk().then(checkAndBadge);
  const st = await settings();
  if (st.autoStart) {
    try { await connectCore(st.sel); } catch { await sset({ connFail: true }); }
  }
});
