cd ~/cst-rmm-portal
node -e '
const fs = require("fs");
let code = fs.readFileSync("server.js", "utf8");
if (!code.includes("const estacoes")) {
  code = code.replace("const administradoresTI =", "const estacoes = [];\nconst administradoresTI =");
}
code = code.replace(
  "res.render(\x27admin-dashboard\x27, { usuario: req.session.user });",
  "res.render(\x27admin-dashboard\x27, { usuario: req.session.user, estacoes });"
);
fs.writeFileSync("server.js", code);
'
pm2 restart cst-portal
