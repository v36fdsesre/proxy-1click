// Общие функции для окна расширения и фоновой части.
const BYPASS = ["localhost", "127.0.0.1", "<local>", "api.github.com", "github.com", "*.github.com", "*.githubusercontent.com"];
const DEFAULTS = { autoStart: true, autoUpdate: true, sel: "AUTO" };

const sget = (k) => new Promise((r) => chrome.storage.local.get(k, r));
const sset = (o) => new Promise((r) => chrome.storage.local.set(o, r));
async function settings() {
  return { ...DEFAULTS, ...(await sget(["autoStart", "autoUpdate", "sel"])) };
}

const applyProxy = (p) =>
  new Promise((r) =>
    chrome.proxy.settings.set(
      {
        value: {
          mode: "fixed_servers",
          rules: { singleProxy: { scheme: "http", host: p.host, port: p.port }, bypassList: BYPASS },
        },
        scope: "regular",
      },
      r
    )
  );
const clearProxy = () => new Promise((r) => chrome.proxy.settings.clear({ scope: "regular" }, r));
const readProxy = () => new Promise((r) => chrome.proxy.settings.get({ incognito: false }, r));

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

// Подключение. sel: "AUTO" (самый быстрый) или код страны. Если выбранный сервер не отвечает, берём следующий.
async function connectCore(sel) {
  const ping = (await sget("ping")).ping || {};
  if (sel === "AUTO") {
    for (const p of PROXIES) {
      if (ping[p.id] != null) continue;
      await applyProxy(p);
      const t0 = performance.now();
      try { await getIP(6000); ping[p.id] = Math.round(performance.now() - t0); } catch { ping[p.id] = 99999; }
    }
  }
  let order;
  if (sel === "AUTO") order = [...PROXIES].sort((a, b) => (ping[a.id] ?? 1e9) - (ping[b.id] ?? 1e9));
  else {
    const first = PROXIES.find((p) => p.id === sel) || PROXIES[0];
    order = [first, ...PROXIES.filter((p) => p !== first)];
  }
  for (const p of order) {
    await applyProxy(p);
    const t0 = performance.now();
    try {
      const ip = await getIP(8000);
      const ms = Math.round(performance.now() - t0);
      ping[p.id] = ms;
      await sset({ on: true, id: p.id, since: Date.now(), ping, stats: null, connFail: false });
      return { id: p.id, ip, ms, fellBack: sel !== "AUTO" && p.id !== sel };
    } catch { /* пробуем следующий */ }
  }
  await clearProxy();
  await sset({ on: false, ping });
  throw new Error("none");
}
