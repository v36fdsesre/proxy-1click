// Установка новой версии: общий код для страницы обновления и фоновой части. Окон здесь нет.
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
const SKIP = [/^secrets(\.|$)/, /^\.git/, /\.(md|txt)$/i]; // свои прокси и служебные файлы не трогаем
// Файлы, без которых расширение не работает. Если запись другого файла не удалась, он просто пропускается.
const ESSENTIAL = /^(manifest\.json|[a-z]+\.(js|html|css)|icons\/[A-Za-z0-9._-]+)$/i;
const NAME_OK = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const cleanName = (n) => n.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
const withTimeout = (p, ms, msg) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
const errText = (e) => (e && e.message) || String(e);

function prepareFiles(all) {
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
  return { list, skipped };
}

// Существующий файл открываем без create: браузер запрещает «создавать» файлы *.js, а перезаписывать разрешает.
async function getOrCreate(d, name) {
  try {
    return { fh: await d.getFileHandle(name), existed: true };
  } catch (e) {
    if (e && e.name === "NotFoundError") return { fh: await d.getFileHandle(name, { create: true }), existed: false };
    throw e;
  }
}
async function openFile(dir, name) {
  const parts = name.split("/");
  let d = dir;
  for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
  return getOrCreate(d, parts[parts.length - 1]);
}

// Перед записью проверяем, что браузер вообще пускает в папку и принимает все имена. Если нет, ничего не трогаем.
async function probeWrite(dir, list) {
  try {
    const fh = await dir.getFileHandle("zz-write-test.tmp", { create: true });
    const w = await fh.createWritable();
    await w.write("ok");
    await w.close();
    await dir.removeEntry("zz-write-test.tmp");
  } catch (e) {
    throw new Error("Браузер не разрешает записывать файлы в эту папку (" + errText(e) + "). Ничего не записано. Скачайте архив вручную и распакуйте его поверх папки.");
  }
  const bad = [];
  const reasons = {};
  for (const f of list) {
    try {
      const { fh, existed } = await openFile(dir, f.name);
      if (existed && /\.js$/i.test(f.name)) {
        // Пробная перезапись тем же содержимым: так видно заранее, что браузер разрешит записать этот файл.
        const same = await (await fh.getFile()).arrayBuffer();
        const w = await fh.createWritable();
        await w.write(same);
        await w.close();
      }
    } catch (e) { bad.push(f.name); reasons[f.name] = errText(e); }
  }
  const must = bad.filter((n) => ESSENTIAL.test(n));
  if (must.length) {
    throw new Error("Браузер не разрешает записать файлы: " + must.join(", ") + " (" + reasons[must[0]] + "). Ничего не записано, файлы не тронуты. " +
      "Если это новые файлы .js, браузер не даёт создавать их сам: поставьте эту версию вручную из архива.");
  }
  return bad;
}

async function writeFiles(dir, all, onStep = () => {}) {
  const { list, skipped } = prepareFiles(all);
  onStep("Проверяю доступ к папке… Если браузер спросит про изменения в папке, разрешите их.");
  const bad = await withTimeout(probeWrite(dir, list), 25000,
    "Браузер не отвечает при проверке записи. Посмотрите, не показал ли он окно с вопросом о доступе к папке, разрешите изменения и повторите.");
  const todo = list.filter((f) => !bad.includes(f.name));
  for (let i = 0; i < todo.length; i++) {
    const f = todo[i];
    onStep("Записываю файлы: " + (i + 1) + " из " + todo.length + "…");
    try {
      await withTimeout((async () => {
        const { fh } = await openFile(dir, f.name);
        const w = await fh.createWritable();
        await w.write(f.data);
        await w.close();
      })(), 20000, "запись зависла");
    } catch (e) {
      throw new Error("Не удалось записать файл «" + f.name + "»: " + errText(e));
    }
  }
  return { count: todo.length, skipped: skipped.concat(bad) };
}

/* ---------- скачать архив релиза и записать файлы ---------- */
async function readManifest(dir) {
  return JSON.parse(await (await (await dir.getFileHandle("manifest.json")).getFile()).text());
}

// Страница обновления и фоновая часть не должны ставить обновление одновременно.
async function installRelease(dir, url, onStep = () => {}) {
  const { updLock } = await chrome.storage.local.get("updLock");
  if (updLock && Date.now() - updLock < 90000) throw new Error("Обновление уже идёт в фоне. Подождите минуту и откройте окно расширения снова.");
  await chrome.storage.local.set({ updLock: Date.now() });
  try {
    const mf = await readManifest(dir);
    if (mf.name !== chrome.runtime.getManifest().name) throw new Error("В выбранной папке нет расширения «" + chrome.runtime.getManifest().name + "».");
    onStep("Скачиваю архив…");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    let buf;
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error("Не удалось скачать архив (" + res.status + ").");
      buf = await res.arrayBuffer();
    } catch (e) {
      if (e && e.name === "AbortError") throw new Error("Архив не скачался за 30 секунд. GitHub может быть недоступен напрямую: включите прокси и повторите или скачайте архив вручную.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
    const h = new Uint8Array(buf.slice(0, 4));
    if (!(h[0] === 0x50 && h[1] === 0x4b)) throw new Error("По ссылке лежит не архив: релиз ещё собирается. Повторите через минуту.");
    return await writeFiles(dir, await unzip(buf), onStep);
  } finally {
    await chrome.storage.local.set({ updLock: 0 });
  }
}
