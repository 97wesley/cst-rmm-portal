cd ~/cst-rmm-portal
node -e '
const fs = require("fs");
let code = fs.readFileSync("server.js", "utf8");
if (!/\b(let|const|var)\s+estacoes\b/.test(code)) {
  code = "let estacoes = [];\n" + code;
}
code = code.replace(
  /res\.render\(\s*(["\x27])admin-dashboard\1\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/,
  (match, q, props) => {
    const clean = (props || "").trim().replace(/,$/, "");
    if (/\bestacoes\b/.test(clean)) return match;
    return clean
      ? `res.render("admin-dashboard", { ${clean}, estacoes })`
      : `res.render("admin-dashboard", { estacoes })`;
  }
);
fs.writeFileSync("server.js", code);
'
sed -n '108,118p' server.js
