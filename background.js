importScripts("secrets.js", "config.js", "update.js");

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

// Проверка новой версии: на иконке расширения появляется значок «1».
async function checkAndBadge() {
  const d = await checkUpdate(true);
  chrome.action.setBadgeBackgroundColor({ color: "#3f9d5b" });
  chrome.action.setBadgeText({ text: d && d.newer ? "1" : "" });
}
chrome.alarms.create("upd", { periodInMinutes: Math.max(1, UPDATE.minutes || 1) });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "upd") checkAndBadge(); });
chrome.runtime.onStartup.addListener(checkAndBadge);
chrome.runtime.onInstalled.addListener(checkAndBadge);
