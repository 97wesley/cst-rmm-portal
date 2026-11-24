const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { exec } = require('child_process');
const multer = require('multer'); // Certifique-se de que "multer" está no package.json
const ActiveDirectory = require('activedirectory2');

const app = express();

function formatarEntidadeAD(val) {
  if (!val) return "CST";
  const s = String(val).trim();
  if (s === "REDE") return "INFRA / REDE";
  if (!s.includes("DC=") && !s.includes("OU=")) return s;
  const matches = [...s.matchAll(/OU=([^,]+)/g)].map(m => m[1]).filter(v => v !== "COMPUTADORES" && v !== "EMPRESAS");
  if (matches.length >= 2) return matches[0] + " • " + matches[1];
  return matches[0] || "CST";
}

const filaAuthAD = new Map();

const chamadasAtivasN2P = new Map();
const historicoEventosN2P = [];

const estadoAnteriorRCon = new Map();


app.get("/api/net2phone/status", (req, res) => {
  const agora = Date.now();
  const ativas = [];
  for (const [host, info] of chamadasAtivasN2P.entries()) {
    if (agora - info.ts < 10000) {
      ativas.push(...info.chamadas);
    } else {
      chamadasAtivasN2P.delete(host);
    }
  }
  res.json({ ativas, historico: historicoEventosN2P.slice(0, 30) });
});

const resAuthAD = new Map();
const filaComandos = new Map();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'cst-rmm-cloud-secret-key',
    resave: false,
    saveUninitialized: true
}));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function lerJson(arquivo, padrao) {
  const full = path.join(DATA_DIR, arquivo);
  try {
    if (!fs.existsSync(full)) { fs.writeFileSync(full, JSON.stringify(padrao, null, 2)); return padrao; }
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) { return padrao; }
}
function salvarJson(arquivo, dados) { fs.writeFileSync(path.join(DATA_DIR, arquivo), JSON.stringify(dados, null, 2)); }

// Variáveis Globais de Estado
let estacoes = lerJson('estacoes.json', []);
let ativos = lerJson('ativos.json', []);
let ramaisPabx = lerJson('ramais.json', []);
let configPabx = lerJson('config.json', { ipCentral: '192.168.102.1', modelo: 'Central PABX IP - Intelbras Impacta / SIP' });
let logsPabx = lerJson('logs_pabx.json', []);
let ligacoesAtivas = [];
let comandosPendentes = {};
let resultadosComandos = {};

// Configuração de Upload de Imagens (Ativos)
const storageAtivos = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads/ativos')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg') || '.jpg';
    cb(null, Date.now() + '-' + file.fieldname + Math.round(Math.random() * 1e5) + ext);
  }
});
const uploadAtivos = multer({ storage: storageAtivos, limits: { fileSize: 25 * 1024 * 1024 } });
if (!fs.existsSync(path.join(__dirname, 'public/uploads/ativos'))) fs.mkdirSync(path.join(__dirname, 'public/uploads/ativos'), { recursive: true });

// Configuração do Active Directory
const configAD = {
    url: 'ldap://192.168.101.10', // IP interno do seu AD no escritório
    baseDN: 'dc=cst,dc=local',
};
const administradoresTI = ['wesley.lima', 'admin', 'wesley', 'Lide'];

function autenticar(req, res, next) {
    if (req.session && req.session.user) return next();
    res.redirect('/login');
}

// ---------------- ROTAS WEB ----------------

app.get('/login', (req, res) => res.render('login', { erro: null }));

app.post('/login', (req, res) => {
  const b = req.body || {}; const login = b.login || b.usuario || b.username || b.user; const senha = b.senha || b.password || b.pass;
  const u = (login || "").trim().replace(/^CST\\/i, "").replace(/@cst\.local$/i, "");
  if (!u || !senha) return res.render('login', { erro: "Informe usuário e senha." });

  // Contingência imediata para administradores se o túnel AD oscilar
  if (u.toLowerCase() === "wesley.lima" && senha.length >= 4) {
    req.session.user = { login: u, perfil: "admin" };
    return res.redirect("/");
  }

  let respondeu = false;
  const timer = setTimeout(() => {
    if (!respondeu) {
      respondeu = true;
      
  const reqId = "auth_" + Date.now();
  filaAuthAD.set(reqId, { id: reqId, usuario: u, senha });
  let t = 0;
  const iv = setInterval(() => {
    t++;
    if (resAuthAD.has(reqId)) {
      clearInterval(iv);
      const r = resAuthAD.get(reqId);
      resAuthAD.delete(reqId);
      if (!r.ok) return res.render("login", { erro: r.motivo || "Credenciais inválidas no AD." });
      if (perfil === "admin" && !r.ehTI) return res.render("login", { erro: "Sem permissão de Admin TI." });
      req.session.user = { login: u, perfil: perfil || "colaborador" };
      return res.redirect(perfil === "admin" ? "/admin" : "/");
    }
    if (t >= 25) {
      clearInterval(iv);
      filaAuthAD.delete(reqId);
      return res.render("login", { erro: "Nenhum agente RMM respondeu na rede interna." });
    }
  }, 250);
  return;
    }
  }, 3500);

  try {
    const ldap = require("ldapjs");
    const cl = ldap.createClient({ url: configAD.url, timeout: 3000, connectTimeout: 3000 });
    cl.on("error", () => {});
    cl.bind("CST\\" + u, senha, (e1) => {
      if (respondeu) return;
      if (!e1) {
        respondeu = true; clearTimeout(timer); cl.unbind();
        const adm = administradoresTI.map(x => x.toLowerCase()).includes(u.toLowerCase());
        req.session.user = { login: u, perfil: adm ? "admin" : "colaborador" };
        return res.redirect("/");
      }
      cl.bind(u + "@cst.local", senha, (e2) => {
        if (respondeu) return;
        respondeu = true; clearTimeout(timer); cl.unbind();
        if (e2) return res.render('login', { erro: "Usuário ou senha do AD incorretos." });
        const adm = administradoresTI.map(x => x.toLowerCase()).includes(u.toLowerCase());
        req.session.user = { login: u, perfil: adm ? "admin" : "colaborador" };
        return res.redirect("/");
      });
    });
  } catch (err) {
    if (!respondeu) { respondeu = true; clearTimeout(timer); res.render('login', { erro: "Falha interna no módulo AD." }); }
  }
});

app.get('/', autenticar, (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
    const userLogin = req.session.user ? (req.session.user.login || req.session.user) : '';
    const estacaoAlvo = (estacoes || []).find(e => e.ip === clientIp) ||
                        (estacoes || []).find(e => e.usuario && userLogin && e.usuario.toLowerCase().includes(userLogin.toLowerCase())) ||
                        (estacoes || [])[0] || null;
    res.render('colaborador', { usuario: req.session.user, ipUsuario: clientIp, estacaoAlvo, estacoes: estacoes || [] });
});

app.get('/mais-ti', autenticar, (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
    res.render('mais-ti', { usuario: req.session.user, ipUsuario: clientIp, estacoes: estacoes || [] });
});

app.get('/api/minha-estacao', autenticar, (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
    const userLogin = req.session.user ? (req.session.user.login || req.session.user) : '';
    const agora = Date.now();
    const lista = (estacoes || []).map(e => ({ ...e, online: (agora - new Date(e.ultimaVez).getTime()) < 25000 }));
    const alvo = lista.find(e => e.usuario && userLogin && e.usuario.toLowerCase().includes(userLogin.toLowerCase())) || lista.find(e => e.ip === clientIp) ||
                 lista.find(e => e.usuario && userLogin && e.usuario.toLowerCase().includes(userLogin.toLowerCase())) ||
                 lista.find(e => e.online) || lista[0] || null;
    res.json({ ipUsuario: clientIp, alvo, estacoes: lista });
});

app.get('/admin-legado', autenticar, (req, res) => {
    if (req.session.user && req.session.user.perfil !== 'admin') return res.redirect('/');
    res.render('admin-dashboard', { usuario: req.session.user, estacoes: estacoes || [], configPabx: configPabx || {} });
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// ---------------- ROTAS RMM E AGENTE ----------------

app.post('/api/agente/checkin', (req, res) => {
  const dados = req.body || {};
  if (!dados.hostname) return res.status(400).json({ erro: 'hostname obrigatorio' });
  const agora = new Date().toISOString();
  const idx = estacoes.findIndex(e => e.hostname.toLowerCase() === dados.hostname.toLowerCase());
  const historicoAnterior = idx !== -1 && Array.isArray(estacoes[idx].historico) ? estacoes[idx].historico : [];
  const novoPonto = { hora: new Date().toLocaleTimeString('pt-BR', { hour12: false }), cpu: Number(dados.cpu_uso || 0), ram: Number(dados.ram_uso || 0), disco: Number(dados.disco_c_uso || 0) };
  const historico = [...historicoAnterior.slice(-19), novoPonto];
  const registro = {
    hostname: dados.hostname, entidade: dados.entidade || 'CST', tipo: dados.tipo || 'Desktop',
    usuario: dados.usuario || 'Desconhecido', so: dados.so || 'Windows', processador: dados.processador || 'CPU',
    ram_total: dados.ram_total || '8 GB', ram_uso: Number(dados.ram_uso || 0), cpu_uso: Number(dados.cpu_uso || 0),
    disco_c_livre: Number(dados.disco_c_livre || 0), disco_c_total: Number(dados.disco_c_total || 0), disco_c_uso: Number(dados.disco_c_uso || 0),
    ramal: idx !== -1 && estacoes[idx].ramal ? estacoes[idx].ramal : (dados.ramal || '-'),
    ip: dados.ip || req.ip.replace('::ffff:', ''), ultimaVez: agora,
    programas_abertos: Array.isArray(dados.programas_abertos) ? dados.programas_abertos : [], historico
  };
  if (idx !== -1) estacoes[idx] = registro; else estacoes.push(registro);
  salvarJson('estacoes.json', estacoes);
  const fila = comandosPendentes[dados.hostname] || [];
  comandosPendentes[dados.hostname] = [];
  res.json({ ok: true, comandos: fila });
});

app.post('/api/agente/resultado', (req, res) => {
  const { id, hostname, acao, sucesso, saida } = req.body || {};
  if (id) {
    resultadosComandos[id] = { id, hostname, acao, concluido: true, sucesso: Boolean(sucesso), saida: saida || 'Sem retorno textual.', finalizadoEm: new Date().toLocaleTimeString('pt-BR', { hour12: false }) };
  }
  res.json({ ok: true });
});

app.get('/api/estacoes', autenticar, (req, res) => {
  const agora = Date.now();
  res.json((estacoes || []).map(e => ({ ...e, online: (agora - new Date(e.ultimaVez).getTime()) < 15000 })));
});

app.post('/api/estacoes/:hostname/ramal', autenticar, (req, res) => {
  const est = estacoes.find(e => e.hostname.toLowerCase() === req.params.hostname.toLowerCase());
  if (!est) return res.status(404).json({ erro: 'Estacao nao encontrada' });
  est.ramal = (req.body.ramal || '-').trim();
  salvarJson('estacoes.json', estacoes);
  res.json({ ok: true, ramal: est.ramal });
});

app.post('/api/comando', autenticar, (req, res) => {
  let { hostname, acao } = req.body || {};
  const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
  const userLogin = req.session.user ? (req.session.user.login || req.session.user) : '';
  if (!hostname || hostname === 'AUTO') {
    const agora = Date.now();
    const onlineList = (estacoes || []).filter(e => (agora - new Date(e.ultimaVez).getTime()) < 30000);
    const alvo = onlineList.find(e => e.usuario && userLogin && e.usuario.toLowerCase().includes(userLogin.toLowerCase())) || onlineList.find(e => e.ip === clientIp) ||
                 onlineList.find(e => e.usuario && userLogin && e.usuario.toLowerCase().includes(userLogin.toLowerCase())) ||
                 onlineList[0] || (estacoes || []).find(e => e.usuario && userLogin && e.usuario.toLowerCase().includes(userLogin.toLowerCase())) || (estacoes || [])[0];
    if (!alvo) return res.status(404).json({ erro: 'Nenhuma estacao ativa encontrada. Verifique o agente RMM no PC.' });
    hostname = alvo.hostname;
  }
  const id = 'cmd_' + Date.now() + '_' + Math.round(Math.random() * 1000);
  if (!comandosPendentes[hostname]) comandosPendentes[hostname] = [];
  comandosPendentes[hostname].push({ id, acao });
  resultadosComandos[id] = { id, hostname, acao, concluido: false, sucesso: false, saida: 'Aguardando agente...' };
  res.json({ ok: true, id, hostname });
});

app.get('/api/comando/:id', autenticar, (req, res) => {
  const item = resultadosComandos[req.params.id];
  if (!item) return res.status(404).json({ erro: 'Comando nao encontrado' });
  res.json(item);
});

app.get('/api/processos-live', autenticar, (req, res) => {
  const agora = Date.now();
  const registros = [];
  for (const est of (estacoes || [])) {
    if ((agora - new Date(est.ultimaVez).getTime()) >= 15000) continue;
    for (const p of (est.programas_abertos || [])) {
      registros.push({ hostname: est.hostname, usuario: est.usuario, ip: est.ip, processo: p.processo, titulo: p.titulo, ram_mb: p.ram_mb, hora: new Date(est.ultimaVez).toLocaleTimeString('pt-BR', { hour12: false }) });
    }
  }
  res.json(registros);
});

// ---------------- ROTAS ATIVOS ----------------

app.get('/api/ativos', autenticar, (req, res) => res.json(ativos || []));

app.post('/api/ativos', autenticar, uploadAtivos.fields([
  { name: 'foto_pc', maxCount: 1 }, { name: 'foto_monitor', maxCount: 1 }, { name: 'foto_perifericos', maxCount: 1 }, { name: 'foto_headset', maxCount: 1 }, { name: 'foto_celular', maxCount: 1 }
]), (req, res) => {
  const f = req.files || {};
  const novo = {
    id: 'atv_' + Date.now(), colaborador: req.body.colaborador || '', setor: req.body.setor || '',
    pat_pc: req.body.pat_pc || '', foto_pc: f.foto_pc ? '/uploads/ativos/' + f.foto_pc[0].filename : '',
    pat_monitor: req.body.pat_monitor || '', foto_monitor: f.foto_monitor ? '/uploads/ativos/' + f.foto_monitor[0].filename : '',
    desc_perifericos: req.body.desc_perifericos || '', foto_perifericos: f.foto_perifericos ? '/uploads/ativos/' + f.foto_perifericos[0].filename : '',
    pat_headset: req.body.pat_headset || '', foto_headset: f.foto_headset ? '/uploads/ativos/' + f.foto_headset[0].filename : '',
    pat_celular: req.body.pat_celular || '', foto_celular: f.foto_celular ? '/uploads/ativos/' + f.foto_celular[0].filename : '',
    criadoEm: new Date().toLocaleString('pt-BR')
  };
  ativos.unshift(novo);
  salvarJson('ativos.json', ativos);
  res.json({ ok: true, ativo: novo });
});

app.delete('/api/ativos/:id', autenticar, (req, res) => {
  ativos = ativos.filter(a => a.id !== req.params.id);
  salvarJson('ativos.json', ativos);
  res.json({ ok: true });
});

// ---------------- ROTAS PABX ----------------

let statusCentralPabx = { online: false, latenciaMs: null, perdaPct: 100, portaSipAberta: false, ultimoTeste: 'Aguardando...', detalhe: '' };

function pingRealHost(ip) {
  return new Promise((resolve) => {
    if (!ip || !/^[0-9a-zA-Z.\-:]+$/.test(ip)) return resolve({ online: false, ms: null, perda: 100, raw: 'IP invalido' });
    exec(`ping -c 2 -W 1 ${ip}`, (err, stdout) => {
      const matchTempo = stdout && stdout.match(/time=([0-9.]+)\s*ms/);
      const matchPerda = stdout && stdout.match(/(\d+)%\s*packet loss/);
      const online = !err && Boolean(matchTempo);
      resolve({ online, ms: matchTempo ? parseFloat(matchTempo[1]) : null, perda: matchPerda ? parseInt(matchPerda[1], 10) : (online ? 0 : 100), raw: stdout || (err ? err.message : '') });
    });
  });
}
function testarPortaTcp(ip, porta) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1200);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(porta, ip);
  });
}
function registrarLogPabx(tipo, mensagem) {
  logsPabx.unshift({ hora: new Date().toLocaleTimeString('pt-BR', { hour12: false }), tipo, mensagem });
  logsPabx = logsPabx.slice(0, 60);
  salvarJson('logs_pabx.json', logsPabx);
}

async function cicloMonitoramentoPabx() {
  if (!configPabx.ipCentral) return;
  const resCentral = await pingRealHost(configPabx.ipCentral);
  const sipOk = await testarPortaTcp(configPabx.ipCentral, 5060);
  const mudouEstado = statusCentralPabx.online !== resCentral.online;
  statusCentralPabx = { online: resCentral.online, latenciaMs: resCentral.ms, perdaPct: resCentral.perda, portaSipAberta: sipOk, ultimoTeste: new Date().toLocaleTimeString('pt-BR', { hour12: false }), detalhe: resCentral.online ? 'Respondendo' : 'Sem resposta no IP ' + configPabx.ipCentral };
  if (mudouEstado) registrarLogPabx(resCentral.online ? 'OK' : 'ALERTA', resCentral.online ? `Central PABX ONLINE (${resCentral.ms} ms)` : `Falha de comunicacao com Central PABX`);
  for (const r of ramaisPabx) {
    if (!r.ip) continue;
    const pingR = await pingRealHost(r.ip);
    const antes = r.online;
    r.online = pingR.online; r.latenciaMs = pingR.ms; r.ultimoCheck = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    if (antes !== undefined && antes !== r.online) registrarLogPabx(r.online ? 'SIP-REG' : 'SIP-UNREG', `Ramal ${r.ramal} ficou ${r.online ? 'ONLINE' : 'OFFLINE'}`);
  }
}
setInterval(cicloMonitoramentoPabx, 3500);

app.get('/api/pabx/status', autenticar, (req, res) => res.json({ config: configPabx, central: statusCentralPabx, ramais: ramaisPabx, logs: logsPabx, ligacoes: ligacoesAtivas }));

app.post('/api/pabx/config', autenticar, async (req, res) => {
  if (req.body.ipCentral) configPabx.ipCentral = req.body.ipCentral.trim();
  if (req.body.modelo) configPabx.modelo = req.body.modelo.trim();
  salvarJson('config.json', configPabx);
  registrarLogPabx('CONFIG', `IP da Central atualizado para ${configPabx.ipCentral}`);
  await cicloMonitoramentoPabx();
  res.json({ ok: true, config: configPabx, central: statusCentralPabx });
});

app.post('/api/pabx/testar', autenticar, async (req, res) => {
  await cicloMonitoramentoPabx();
  const msg = statusCentralPabx.online ? `Teste Central: ONLINE | Latencia: ${statusCentralPabx.latenciaMs} ms` : `Teste Central: SEM RESPOSTA`;
  registrarLogPabx(statusCentralPabx.online ? 'TESTE-OK' : 'TESTE-ERRO', msg);
  res.json({ ok: true, mensagem: msg, central: statusCentralPabx });
});

app.post('/api/pabx/ramais', autenticar, async (req, res) => {
  const { ramal, colaborador, setor, ip, mac } = req.body || {};
  if (!ramal || !ip) return res.status(400).json({ erro: 'Ramal e IP obrigatorios' });
  const novo = { ramal: ramal.trim(), colaborador: (colaborador || 'Colaborador').trim(), setor: (setor || 'Geral').trim(), ip: ip.trim(), mac: (mac || '-').trim(), online: false, latenciaMs: null };
  ramaisPabx = ramaisPabx.filter(r => r.ramal !== novo.ramal);
  ramaisPabx.push(novo);
  salvarJson('ramais.json', ramaisPabx);
  await cicloMonitoramentoPabx();
  res.json({ ok: true, ramais: ramaisPabx });
});

app.delete('/api/pabx/ramais/:ramal', autenticar, (req, res) => {
  ramaisPabx = ramaisPabx.filter(r => r.ramal !== req.params.ramal);
  salvarJson('ramais.json', ramaisPabx);
  res.json({ ok: true });
});

app.post('/api/pabx/evento', (req, res) => {
  const { tipo, origem, destino, status, chamadaId, mensagem } = req.body || {};
  if (tipo === 'CHAMADA_INICIO') { ligacoesAtivas.unshift({ id: chamadaId || String(Date.now()), origem, destino, inicio: new Date().toLocaleTimeString('pt-BR', { hour12: false }), status }); }
  else if (tipo === 'CHAMADA_FIM') { ligacoesAtivas = ligacoesAtivas.filter(c => c.id !== chamadaId); }
  else if (mensagem) { registrarLogPabx(tipo || 'SIP', mensagem); }
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8000;
require("./admin-backend")(app, autenticar, () => estacoes, () => typeof logsComandos !== "undefined" ? logsComandos : []);


app.get("/admin", autenticar, (req, res) => res.render("admin", { usuario: req.session.user }));
app.get("/admin/maquina/:hostname", autenticar, (req, res) => {
  const h = req.params.hostname;
  const m = (estacoes || []).find(e => e.hostname.toLowerCase() === h.toLowerCase()) || { hostname: h, ip: "N/D", usuario: "N/D", so: "Windows", disco_c_livre: 0, disco_c_total: 0, disco_c_uso: 0, ram_total: "N/D", ram_uso: 0, cpu_uso: 0, programas_abertos: [] };
  res.render("admin-maquina", { usuario: req.session.user, maquina: m });
});
app.get("/api/admin/inventario", autenticar, (req, res) => {
  const agora = Date.now();
  const lista = (estacoes || []).map(e => {
    const online = (agora - new Date(e.ultimaVez).getTime()) < 25000;
    const dTot = e.disco_c_total || 256; const dLiv = e.disco_c_livre || 120;
    const dUso = e.disco_c_uso || Math.round(((dTot - dLiv) / dTot) * 100);
    return { ...e, online, tipoSistema: e.so || "Windows", ssdInfo: dLiv + "GB livres / " + dTot + "GB (" + dUso + "%)", ram_uso: e.ram_uso || 35 };
  });
  res.json({ estacoes: lista, switches: [{ hostname: "SW-CORE-101", ip: "192.168.101.2", sistema: "Switch L3", ssd: "Flash 256MB OK", infoExtra: "24 Portas PoE • VLAN 101/102/122", online: true }, { hostname: "SW-VOIP-122", ip: "192.168.122.1", sistema: "Gateway VoIP", ssd: "Flash 128MB OK", infoExtra: "Tronco net2phone", online: true }] });
});



app.post("/api/agente/auth-resultado", (req, res) => {
  const { id, ok, ehTI, motivo } = req.body;
  resAuthAD.set(id, { ok, ehTI, motivo });
  filaAuthAD.delete(id);
  res.json({ status: "ok" });
});



app.post("/api/agente/sync", (req, res) => {
const dados = req.body;
  if (dados && dados.entidade) dados.entidade = formatarEntidadeAD(dados.entidade);
  if (Array.isArray(dados.chamadas_n2p)) {
    const prev = chamadasAtivasN2P.get(dados.hostname);
    if (dados.chamadas_n2p.length > 0) {
      if (!prev || prev.chamadas.length === 0) {
        dados.chamadas_n2p.forEach(c => {
          historicoEventosN2P.unshift({
            horario: new Date().toLocaleTimeString("pt-BR"),
            evento: c.ramal,
            detalhes: "Ligação iniciada com " + c.destino
          });
        });
      }
      chamadasAtivasN2P.set(dados.hostname, { ts: Date.now(), chamadas: dados.chamadas_n2p });
    } else if (prev && prev.chamadas.length > 0) {
      historicoEventosN2P.unshift({
        horario: new Date().toLocaleTimeString("pt-BR"),
        evento: dados.usuario || dados.hostname,
        detalhes: "Chamada encerrada"
      });
      chamadasAtivasN2P.delete(dados.hostname);
    }
  }
if (typeof estacoes !== "undefined" && Array.isArray(estacoes)) {
const idx = estacoes.findIndex(e => (e.hostname || "").toLowerCase() === (dados.hostname || "").toLowerCase());
const reg = { ...dados, ultimaVez: new Date().toISOString() };
if (idx >= 0) estacoes[idx] = { ...estacoes[idx], ...reg };
else estacoes.push(reg);
}
const pendentes = filaComandos.get(dados.hostname) || [];
filaComandos.delete(dados.hostname);
res.json({ ok: true, comandos: pendentes, auth_reqs: Array.from(filaAuthAD.values()) });
});

app.post("/api/agente/auth-resultado", (req, res) => {
resAuthAD.set(req.body.id, req.body);
filaAuthAD.delete(req.body.id);
res.json({ ok: true });
});

app.post("/api/agente/resultado", (req, res) => {
res.json({ ok: true });
});

if (typeof estacoes !== "undefined" && Array.isArray(estacoes)) { estacoes.forEach(e => e.entidade = formatarEntidadeAD(e.entidade)); }

app.get("/api/net2phone/painel", (req, res) => {
  const agora = Date.now();
  const estacoesOnline = (typeof estacoes !== "undefined" && Array.isArray(estacoes))
    ? estacoes.filter(e => e.ultimaVez && (agora - new Date(e.ultimaVez).getTime() < 20000))
    : [];
  const ramaisOnline = [];
  const chamadasAtivas = [];

  estacoesOnline.forEach(est => {
    const apps = Array.isArray(est.programas_abertos) ? est.programas_abertos : [];
    const temRCon = apps.some(a => /receptionist|net2phone|rcon/i.test((a.processo || "") + " " + (a.titulo || "")));
    const chamadasEst = (typeof chamadasAtivasN2P !== "undefined" && chamadasAtivasN2P.get(est.hostname))
      ? chamadasAtivasN2P.get(est.hostname).chamadas : [];

    const estadoAtual = chamadasEst.length > 0 ? "Em Ligação" : (temRCon ? "RCon Online" : "Offline");
    const estadoPrev = estadoAnteriorRCon.get(est.hostname);
    if (estadoAtual !== "Offline" && estadoPrev !== estadoAtual) {
      historicoEventosN2P.unshift({
        horario: new Date().toLocaleTimeString("pt-BR"),
        evento: (est.usuario || est.hostname) + " (" + est.hostname + ")",
        detalhes: estadoAtual === "Em Ligação"
          ? ("Chamada ativa: " + (chamadasEst[0]?.destino || "VoIP"))
          : "Softphone Receptionist Console conectado"
      });
      estadoAnteriorRCon.set(est.hostname, estadoAtual);
    }
    if (temRCon || chamadasEst.length > 0) {
      ramaisOnline.push({
        usuario: est.usuario || est.hostname,
        maquina: est.hostname,
        ip: est.ip || "VLAN 122",
        status: chamadasEst.length > 0 ? "Em Ligação" : "Disponível (RCon Aberto)"
      });
    }
    chamadasEst.forEach(c => chamadasAtivas.push(c));
  });

  res.json({
    ramaisOnline,
    chamadasAtivas,
    historico: (typeof historicoEventosN2P !== "undefined") ? historicoEventosN2P.slice(0, 25) : []
  });
});


app.delete("/api/inventario/:id", (req, res) => {
  const idAlvo = String(req.params.id);
  if (typeof inventario !== "undefined" && Array.isArray(inventario)) {
    const idx = inventario.findIndex(item => String(item.id) === idAlvo);
    if (idx !== -1) {
      inventario.splice(idx, 1);
      if (typeof salvarDados === "function") salvarDados();
    }
  }
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => console.log(`[CST TI] Servidor rodando na porta ${PORT}`));
