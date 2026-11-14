const $ = (s) => document.querySelector(s);
const say = (t, err = false) => { $("#msg").textContent = t; $("#msg").className = err ? "err" : ""; };
const AUTO = new URLSearchParams(location.search).get("auto") === "1";
let info = null;

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

async function run(forcePick) {
  $("#go").disabled = true;
  try {
    const dir = await chooseFolder(forcePick);
    say("Скачиваю версию " + info.latest + "…");
    const r = await installRelease(dir, info.url);
    await chrome.storage.local.set({ updOk: true });
    say("Готово: обновлено файлов " + r.count + (r.skipped.length ? " (пропущено: " + r.skipped.join(", ") + ")" : "") + ". Перезапускаю расширение…");
    setTimeout(() => chrome.runtime.reload(), 1200);
  } catch (e) {
    const text = e && e.name === "AbortError" ? "Выбор папки отменён." : (e && e.message) || "Не удалось обновить.";
    say(text, true);
    if (AUTO) { chrome.action.setBadgeText({ text: "!" }); }
    $("#go").disabled = false;
    $("#go").hidden = false;
    $("#pick").hidden = false;
  }
}

async function init() {
  $("#ver").textContent = "Сейчас установлена версия " + chrome.runtime.getManifest().version + ".";
  info = await checkUpdate(true);
  if (!info) return say("Не удалось проверить обновления. Проверьте интернет и репозиторий в config.js.", true);
  if (info.pending) {
    say("Версия " + info.latest + " ещё собирается. Жду архив…");
    return setTimeout(init, 10000); // архив прикрепляется через несколько секунд после выхода релиза
  }
  if (!info.newer) return say("У вас последняя версия.");
  $("#manual").href = info.url;
  $("#manual").hidden = false;
  $("#manual").textContent = "Скачать версию " + info.latest + " вручную";
  say("Доступна версия " + info.latest + ".");
  $("#go").hidden = false;
  $("#pick").hidden = false;
  $("#go").onclick = () => run(false);
  $("#pick").onclick = () => run(true);
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
    } else $("#hint").textContent = "В первый раз браузер попросит выбрать папку расширения и разрешить запись в неё.";
  } catch { /* ждём нажатия */ }
}
init();
