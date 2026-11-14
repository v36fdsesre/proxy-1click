const $ = (s) => document.querySelector(s);
const say = (t, err = false) => { $("#msg").textContent = t; $("#msg").className = err ? "err" : ""; };

async function init() {
  $("#ver").textContent = "Сейчас установлена версия " + chrome.runtime.getManifest().version + ".";
  const info = await checkUpdate(true);
  if (!info) return say("Не удалось проверить обновления. Проверьте интернет и репозиторий в config.js.", true);
  if (info.pending) {
    say("Версия " + info.latest + " ещё собирается. Жду архив…");
    return setTimeout(init, 10000); // архив прикрепляется через несколько секунд после выхода релиза
  }
  if (!info.newer) return say("У вас последняя версия.");
  say("Доступна версия " + info.latest + ". Если помощник установлен, расширение обновится само в течение нескольких минут.");
  $("#manual").href = info.url;
  $("#manual").textContent = "Скачать версию " + info.latest + " вручную";
  $("#manual").hidden = false;
}
init();
