cd ~/cst-rmm-portal
node -e '
const fs = require("fs");
let code = fs.readFileSync("server.js", "utf8");
if (!code.includes("const estacoes")) {
  code = code.replace(/const administradoresTI\s*=/, "const estacoes = [];\nconst administradoresTI =");
}
const antes = code;
code = code.replace(
  /res\.render\(\s*["\x27]admin-dashboard["\x27]\s*,\s*\{\s*usuario:\s*req\.session\.user\s*\}\s*\)/,
  "res.render(\x27admin-dashboard\x27, { usuario: req.session.user, estacoes })"
);
if (antes === code) {
  console.error("AVISO: A linha res.render não foi alterada.");
  process.exit(1);
}
fs.writeFileSync("server.js", code);
console.log("Ficheiro server.js atualizado com sucesso!");
'
