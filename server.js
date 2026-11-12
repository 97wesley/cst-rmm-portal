cd ~/cst-rmm-portal
node -e '
const fs = require("fs");
let code = fs.readFileSync("server.js", "utf8");
if (!code.includes("const estacoes")) {
  code = code.replace("const administradoresTI =", "const estacoes = [];\nconst administradoresTI =");
}
code = code.replace(
  /res\.render\s*\(\s*["\x27]admin-dashboard["\x27]\s*,\s*\{[^}]*\}\s*\)/,
  "res.render(\x27admin-dashboard\x27, { usuario: req.session.user.login, estacoes })"
);
fs.writeFileSync("server.js", code);
'
grep -n -C 2 "admin-dashboard" server.js
