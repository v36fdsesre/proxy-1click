const $ = (s) => document.querySelector(s);
const say = (t, err = false) => { $("#msg").textContent = t; $("#msg").className = err ? "err" : ""; };

/* ---------- запоминаем выбранную папку расширения ---------- */
const openDb = () => new Promise((res, rej) => {
  const r = indexedDB.open("updater", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("h");
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function getHandle() {
  const d = await openDb();
  return new Promise((res) => {
    const q = d.transaction("h").objectStore("h").get("dir");
    q.onsuccess = () => res(q.result || null);
    q.onerror = () => res(null);
  });
}
async function putHandle(h) {
  const d = await openDb();
  return new Promise((res, rej) => {
    const t = d.transaction("h", "readwrite");
    t.objectStore("h").put(h, "dir");
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}

async function chooseFolder(forcePick) {
  let h = forcePick ? null : await getHandle();
  if (h) {
    let p = await h.queryPermission({ mode: "readwrite" });
    if (p !== "granted") p = await h.requestPermission({ mode: "readwrite" });
    if (p === "granted") return h;
  }
  say("Выберите папку, из которой загружено расширение (в ней лежит manifest.json).");
  h = await showDirectoryPicker({ mode: "readwrite" });
  await putHandle(h);
  return h;
}

/* ---------- распаковка zip ---------- */
async function unzip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Архив повреждён.");
  const count = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("Архив повреждён.");
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const off = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name.endsWith("/")) continue;
    const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
    let data = u8.subarray(start, start + csize);
    if (method === 8) {
      data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    } else if (method !== 0) {
      throw new Error("Неизвестный способ сжатия в архиве.");
    }
    out.push({ name, data });
  }
  return out;
}

/* ---------- запись файлов в папку расширения ---------- */
const SKIP = [/^secrets\.js$/, /^\.git/, /\.(md|txt)$/i]; // свои прокси и служебные файлы не трогаем
const NAME_OK = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const cleanName = (n) => n.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");

async function writeFiles(dir, all) {
  let files = all.map((f) => ({ ...f, name: cleanName(f.name) }));
  // Если весь архив лежит в одной общей папке, убираем её.
  const top = files.length ? files[0].name.split("/")[0] : "";
  if (top && files.every((f) => f.name.startsWith(top + "/")) && !files.some((f) => f.name === "manifest.json")) {
    files = files.map((f) => ({ ...f, name: f.name.slice(top.length + 1) }));
  }
  const skipped = [];
  const list = files
    .filter((f) => {
      if (SKIP.some((r) => r.test(f.name)) || f.name.includes("..")) return false;
      if (!NAME_OK.test(f.name)) { skipped.push(f.name); return false; } // странные имена не пишем
      return true;
    })
    .sort((a, b) => (a.name === "manifest.json") - (b.name === "manifest.json")); // manifest.json последним
  if (!list.some((f) => f.name === "manifest.json")) throw new Error("В архиве нет manifest.json.");
  for (const f of list) {
    try {
      const parts = f.name.split("/");
      let d = dir;
      for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
      const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(f.data);
      await w.close();
    } catch (e) {
      throw new Error("Не удалось записать файл «" + f.name + "»: " + ((e && e.message) || e));
    }
  }
  return { count: list.length, skipped };
}

/* ---------- основной ход ---------- */
let info = null;
const AUTO = new URLSearchParams(location.search).get("auto") === "1";

async function run(forcePick) {
  $("#go").disabled = true;
  try {
    const dir = await chooseFolder(forcePick);
    const mf = JSON.parse(await (await (await dir.getFileHandle("manifest.json")).getFile()).text());
    if (mf.name !== chrome.runtime.getManifest().name) throw new Error("В этой папке нет расширения «" + chrome.runtime.getManifest().name + "».");
    say("Скачиваю версию " + info.latest + "…");
    const res = await fetch(info.url, { cache: "no-store" });
    if (!res.ok) throw new Error("Не удалось скачать архив (" + res.status + ").");
    say("Устанавливаю…");
    const r = await writeFiles(dir, await unzip(await res.arrayBuffer()));
    await chrome.storage.local.set({ updOk: true });
    say("Готово: обновлено файлов " + r.count + (r.skipped.length ? " (пропущено: " + r.skipped.join(", ") + ")" : "") + ". Перезапускаю расширение…");
    setTimeout(() => chrome.runtime.reload(), 1200);
  } catch (e) {
    const text = e && e.name === "AbortError" ? "Выбор папки отменён." : (e && e.message) || "Не удалось обновить.";
    say(text, true);
    if (AUTO) { chrome.action.setBadgeText({ text: "!" }); setTimeout(() => window.close(), 2500); }
    $("#go").disabled = false;
    $("#go").hidden = false;
    $("#pick").hidden = false;
  }
}

(async function init() {
  $("#ver").textContent = "Сейчас установлена версия " + chrome.runtime.getManifest().version + ".";
  info = await checkUpdate(true);
  if (!info) return say("Не удалось проверить обновления. Проверьте интернет и репозиторий в config.js.", true);
  if (!info.newer) return say("У вас последняя версия.");
  $("#manual").href = info.url;
  $("#manual").hidden = false;
  $("#manual").textContent = "Скачать версию " + info.latest + " вручную";
  say("Доступна версия " + info.latest + ".");
  $("#go").hidden = false;
  $("#pick").hidden = false;
  $("#go").addEventListener("click", () => run(false));
  $("#pick").addEventListener("click", () => run(true));
  // Если доступ к папке уже выдан, обновляемся сразу, без нажатий.
  try {
    const h = await getHandle();
    if (h && (await h.queryPermission({ mode: "readwrite" })) === "granted") run(false);
    else if (AUTO) {
      // Браузер просит подтвердить доступ к папке: выводим эту вкладку вперёд, нужно одно нажатие.
      chrome.action.setBadgeText({ text: "↑" });
      say("Доступна версия " + info.latest + ". Нажмите «Обновить сейчас» один раз.");
      chrome.tabs.getCurrent((t) => {
        if (t) { chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.windowId, { focused: true }); }
      });
    }
    else $("#hint").textContent = "В первый раз браузер попросит выбрать папку расширения и разрешить запись в неё.";
  } catch { /* ждём нажатия */ }
})();
