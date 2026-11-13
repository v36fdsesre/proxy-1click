// Проверка новой версии в GitHub Releases (последний релиз репозитория).
function cmpVersions(a, b) {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function withNewer(d) {
  return { ...d, newer: cmpVersions(d.latest, chrome.runtime.getManifest().version) > 0 };
}

async function checkUpdate(force) {
  if (!UPDATE.repo) return null;
  const { upd } = await chrome.storage.local.get("upd");
  const ttl = Math.max(1, UPDATE.minutes || 1) * 60 * 1000;
  const now = Date.now();
  if (!force && upd && upd.data && now - upd.t < ttl) return withNewer(upd.data);
  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (upd && upd.etag) headers["If-None-Match"] = upd.etag; // ответ 304 не тратит лимит GitHub
    const r = await fetch(`https://api.github.com/repos/${UPDATE.repo}/releases/latest`, { headers, cache: "no-store" });
    if (r.status === 304 && upd && upd.data) {
      await chrome.storage.local.set({ upd: { ...upd, t: now } });
      return withNewer(upd.data);
    }
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    const asset = (j.assets || []).find((a) => /\.zip$/i.test(a.name));
    const data = {
      latest: String(j.tag_name || "").replace(/^v/i, ""),
      url: asset ? asset.browser_download_url : j.html_url,
    };
    await chrome.storage.local.set({ upd: { t: now, etag: r.headers.get("ETag"), data } });
    return withNewer(data);
  } catch {
    return !force && upd && upd.data ? withNewer(upd.data) : null;
  }
}
