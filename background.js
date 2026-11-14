importScripts("secrets.js", "config.js", "update.js", "core.js", "installer.js");

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

// Установка обновления без окон: если браузер помнит доступ к папке, всё делаем в фоне и перезапускаемся.
async function silentInstall(d) {
  const h = await getHandle();
  if (!h) return "nohandle";
  if ((await h.queryPermission({ mode: "readwrite" })) !== "granted") return "noperm";
  await installRelease(h, d.url);
  await sset({ updOk: true });
  chrome.runtime.reload();
  return "done";
}

// Проверка обновлений. Новая версия ставится сама; окно открывается, только если нужно одно нажатие.
async function checkAndBadge() {
  const d = await checkUpdate(true);
  const { connFail, autoTried } = await sget(["connFail", "autoTried"]);
  chrome.action.setBadgeBackgroundColor({ color: "#6d5bff" });
  chrome.action.setBadgeText({ text: d && d.newer ? "1" : connFail ? "!" : "" });
  if (d && d.newer && autoTried !== d.latest && (await settings()).autoUpdate) {
    await sset({ autoTried: d.latest });
    let state = "error";
    try { state = await silentInstall(d); } catch (e) { await sset({ lastUpdError: String((e && e.message) || e) }); }
    if (state === "noperm" || state === "error") {
      chrome.tabs.create({ url: chrome.runtime.getURL("updater.html?auto=1"), active: false });
    }
  }
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
  if (a.name === "upd") checkAndBadge();
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
  checkAndBadge();
  const st = await settings();
  if (st.autoStart) {
    try { await connectCore(st.sel); } catch { await sset({ connFail: true }); }
  }
});
