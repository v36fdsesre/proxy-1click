// Автообновление через GitHub: "ваш-логин/имя-репозитория".
// minutes: как часто проверять новую версию (не меньше 1).
const UPDATE = { repo: "v36fdsesre/proxy-1click", minutes: 1 };

// Доступ к серверам. Без кода работают только серверы из freeIds, с кодом все.
// В codeHashes лежат не сами коды, а их отпечатки (SHA-256), поэтому коды в файле не видны.
// Чтобы добавить код, в PowerShell выполните (КОД писать заглавными буквами, без пробелов):
// [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("kosmoproxy:КОД"))).Replace("-","").ToLower()
// и вставьте результат в список ниже.
const ACCESS = {
  freeIds: ["CA"],
  codeHashes: ["f427f558c854a91b954ba72ea7f052cf620e5e4e9cfa977b04bfc7c59133dcf9"],
};
