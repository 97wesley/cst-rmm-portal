cat << 'EOF' > ~/cst-rmm-portal/patch-server.js
const fs = require('fs');

let original = fs.readFileSync('server.js', 'utf8');

// Preserva tudo antes das rotas de painel e encerramento
const markers = [
  "app.get('/'",
  'app.get("/"',
  "app.get('/admin'",
  'app.get("/admin"',
  "app.get('/logout'",
  'app.get("/logout"',
  "app.listen("
];

let cutIndex = original.length;
for (const m of markers) {
  const idx = original.indexOf(m);
  if (idx !== -1 && idx < cutIndex) {
    cutIndex = idx;
  }
}

let baseCode = original.slice(0, cutIndex);

// Remove eventuais restos de rotas /admin, /logout ou listen caso estivessem fora de ordem
baseCode = baseCode
  .replace(/app\.get\(\s*['"]\/admin['"][\s\S]*?\}\);\s*/g, '')
  .replace(/app\.get\(\s*['"]\/logout['"][\s\S]*?\}\);\s*/g, '')
  .replace(/app\.listen\([\s\S]*$/g, '');

const novasRotas = `
// ============================================================================
// MÓDULOS EM TEMPO REAL: RMM (5s), PROGRAMAS LIVE (1s), ATIVOS 4K E PABX REAL
// ============================================================================
const path = require('path');
const net = require('net');
const { exec } = require('child_process');
const multer = require('multer');

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function lerJson(arquivo, padrao) {
  const full = path.join(DATA_DIR, arquivo);
  try {
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, JSON.stringify(padrao, null, 2));
      return padrao;
    }
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    return padrao;
  }
}

function salvarJson(arquivo, dados) {
  fs.writeFileSync(path.join(DATA_DIR, arquivo), JSON.stringify(dados, null, 2));
}

let estacoes = lerJson('estacoes.json', []);
let ativos = lerJson('ativos.json', []);
let ramaisPabx = lerJson('ramais.json', []);
let configPabx = lerJson('config.json', { ipCentral: '192.168.102.1', modelo: 'Central PABX IP - Intelbras Impacta / SIP' });
let logsPabx = lerJson('logs_pabx.json', []);
let ligacoesAtivas = [];
let comandosPendentes = {};
let resultadosComandos = {};

// Upload de fotos dos ativos
const storageAtivos = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads/ativos')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg') || '.jpg';
    cb(null, Date.now() + '-' + file.fieldname + '-' + Math.round(Math.random() * 1e5) + ext);
  }
});
const uploadAtivos = multer({ storage: storageAtivos, limits: { fileSize: 25 * 1024 * 1024 } });

// --- ROTAS DE PÁGINAS ---
app.get('/', autenticar, (req, res) => {
  res.render('colaborador', { usuario: req.session.user });
});

app.get('/admin', autenticar, (req, res) => {
  if (req.session.user && req.session.user.perfil && req.session.user.perfil !== 'admin') {
    return res.redirect('/');
  }
  res.render('admin-dashboard', {
    usuario: req.session.user,
    estacoes,
    configPabx
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// --- TELEMETRIA RMM & AGENTE WINDOWS ---
app.post('/api/agente/checkin', (req, res) => {
  const dados = req.body || {};
  if (!dados.hostname) return res.status(400).json({ erro: 'hostname obrigatorio' });

  const agora = new Date().toISOString();
  const idx = estacoes.findIndex(e => e.hostname.toLowerCase() === dados.hostname.toLowerCase());

  const historicoAnterior = idx !== -1 && Array.isArray(estacoes[idx].historico) ? estacoes[idx].historico : [];
  const novoPonto = {
    hora: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
    cpu: Number(dados.cpu_uso || 0),
    ram: Number(dados.ram_uso || 0),
    disco: Number(dados.disco_c_uso || 0)
  };
  const historico = [...historicoAnterior.slice(-19), novoPonto];

  const registro = {
    hostname: dados.hostname,
    entidade: dados.entidade || 'Entidade raiz > CST',
    tipo: dados.tipo || 'Desktop',
    usuario: dados.usuario || 'Desconhecido',
    so: dados.so || 'Windows',
    processador: dados.processador || 'CPU',
    ram_total: dados.ram_total || '8 GB',
    ram_uso: Number(dados.ram_uso || 0),
    cpu_uso: Number(dados.cpu_uso || 0),
    disco_c_livre: Number(dados.disco_c_livre || 0),
    disco_c_total: Number(dados.disco_c_total || 0),
    disco_c_uso: Number(dados.disco_c_uso || 0),
    ramal: idx !== -1 && estacoes[idx].ramal ? estacoes[idx].ramal : (dados.ramal || '-'),
    ip: dados.ip || req.ip.replace('::ffff:', ''),
    ultimaVez: agora,
    programas_abertos: Array.isArray(dados.programas_abertos) ? dados.programas_abertos : [],
    historico
  };

  if (idx !== -1) estacoes[idx] = registro;
  else estacoes.push(registro);

  salvarJson('estacoes.json', estacoes);

  const fila = comandosPendentes[dados.hostname] || [];
  comandosPendentes[dados.hostname] = [];
  res.json({ ok: true, comandos: fila });
});

app.post('/api/agente/resultado', (req, res) => {
  const { id, hostname, acao, sucesso, saida } = req.body || {};
  if (id) {
    resultadosComandos[id] = {
      id,
      hostname,
      acao,
      concluido: true,
      sucesso: Boolean(sucesso),
      saida: saida || 'Executado sem retorno textual.',
      finalizadoEm: new Date().toLocaleTimeString('pt-BR', { hour12: false })
    };
  }
  res.json({ ok: true });
});

app.get('/api/estacoes', autenticar, (req, res) => {
  const agora = Date.now();
  const lista = estacoes.map(e => ({
    ...e,
    online: (agora - new Date(e.ultimaVez).getTime()) < 15000
  }));
  res.json(lista);
});

app.post('/api/estacoes/:hostname/ramal', autenticar, (req, res) => {
  const { hostname } = req.params;
  const { ramal } = req.body || {};
  const est = estacoes.find(e => e.hostname.toLowerCase() === hostname.toLowerCase());
  if (!est) return res.status(404).json({ erro: 'Estacao nao encontrada' });
  est.ramal = (ramal || '-').trim();
  salvarJson('estacoes.json', estacoes);
  res.json({ ok: true, ramal: est.ramal });
});

app.post('/api/comando', autenticar, (req, res) => {
  let { hostname, acao } = req.body || {};
  const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
  const userLogin = req.session.user ? (req.session.user.login || req.session.user) : '';

  if (!hostname || hostname === 'AUTO') {
    const porIp = estacoes.find(e => e.ip === clientIp);
    const porUser = estacoes.find(e => e.usuario && userLogin && e.usuario.toLowerCase().includes(userLogin.toLowerCase()));
    const alvo = porIp || porUser;
    if (!alvo) {
      return res.status(404).json({
        erro: 'Nenhuma estacao Windows sincronizada foi identificada para o seu usuario/IP (' + clientIp + '). Solicite a TI a execucao do agente na estacao.'
      });
    }
    hostname = alvo.hostname;
  }

  const id = 'cmd_' + Date.now() + '_' + Math.round(Math.random() * 1000);
  if (!comandosPendentes[hostname]) comandosPendentes[hostname] = [];
  comandosPendentes[hostname].push({ id, acao });

  resultadosComandos[id] = {
    id,
    hostname,
    acao,
    concluido: false,
    sucesso: false,
    saida: 'Aguardando agente da estacao ' + hostname + ' capturar o comando...'
  };

  res.json({ ok: true, id, hostname });
});

app.get('/api/comando/:id', autenticar, (req, res) => {
  const item = resultadosComandos[req.params.id];
  if (!item) return res.status(404).json({ erro: 'Comando nao encontrado' });
  res.json(item);
});

// --- LOG DE PROGRAMAS ABERTOS EM TEMPO REAL (1s) ---
app.get('/api/processos-live', autenticar, (req, res) => {
  const agora = Date.now();
  const registros = [];
  for (const est of estacoes) {
    const online = (agora - new Date(est.ultimaVez).getTime()) < 15000;
    if (!online) continue;
    for (const p of (est.programas_abertos || [])) {
      registros.push({
        hostname: est.hostname,
        usuario: est.usuario,
        ip: est.ip,
        processo: p.processo,
        titulo: p.titulo,
        ram_mb: p.ram_mb,
        hora: new Date(est.ultimaVez).toLocaleTimeString('pt-BR', { hour12: false })
      });
    }
  }
  res.json(registros);
});

// --- ATIVOS & INVENTÁRIO COM FOTOS ---
app.get('/api/ativos', autenticar, (req, res) => {
  res.json(ativos);
});

app.post('/api/ativos', autenticar, uploadAtivos.fields([
  { name: 'foto_pc', maxCount: 1 },
  { name: 'foto_monitor', maxCount: 1 },
  { name: 'foto_perifericos', maxCount: 1 },
  { name: 'foto_headset', maxCount: 1 },
  { name: 'foto_celular', maxCount: 1 }
]), (req, res) => {
  const f = req.files || {};
  const novo = {
    id: 'atv_' + Date.now(),
    colaborador: req.body.colaborador || '',
    setor: req.body.setor || '',
    pat_pc: req.body.pat_pc || '',
    foto_pc: f.foto_pc ? '/uploads/ativos/' + f.foto_pc[0].filename : '',
    pat_monitor: req.body.pat_monitor || '',
    foto_monitor: f.foto_monitor ? '/uploads/ativos/' + f.foto_monitor[0].filename : '',
    desc_perifericos: req.body.desc_perifericos || '',
    foto_perifericos: f.foto_perifericos ? '/uploads/ativos/' + f.foto_perifericos[0].filename : '',
    pat_headset: req.body.pat_headset || '',
    foto_headset: f.foto_headset ? '/uploads/ativos/' + f.foto_headset[0].filename : '',
    pat_celular: req.body.pat_celular || '',
    foto_celular: f.foto_celular ? '/uploads/ativos/' + f.foto_celular[0].filename : '',
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

// --- TELEFONIA IP & PABX (MONITORAMENTO REAL) ---
let statusCentralPabx = {
  online: false,
  latenciaMs: null,
  perdaPct: 100,
  portaSipAberta: false,
  ultimoTeste: 'Aguardando...',
  detalhe: ''
};

function pingRealHost(ip) {
  return new Promise((resolve) => {
    if (!ip || !/^[0-9a-zA-Z.\-:]+$/.test(ip)) {
      return resolve({ online: false, ms: null, perda: 100, raw: 'IP invalido' });
    }
    exec(\`ping -c 2 -W 1 \${ip}\`, (err, stdout) => {
      const matchTempo = stdout && stdout.match(/time=([0-9.]+)\s*ms/);
      const matchPerda = stdout && stdout.match(/(\d+)%\s*packet loss/);
      const online = !err && Boolean(matchTempo);
      resolve({
        online,
        ms: matchTempo ? parseFloat(matchTempo[1]) : null,
        perda: matchPerda ? parseInt(matchPerda[1], 10) : (online ? 0 : 100),
        raw: stdout || (err ? err.message : '')
      });
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
  logsPabx.unshift({
    hora: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
    tipo,
    mensagem
  });
  logsPabx = logsPabx.slice(0, 60);
  salvarJson('logs_pabx.json', logsPabx);
}

async function cicloMonitoramentoPabx() {
  if (!configPabx.ipCentral) return;
  const resCentral = await pingRealHost(configPabx.ipCentral);
  const sipOk = await testarPortaTcp(configPabx.ipCentral, 5060);
  const mudouEstado = statusCentralPabx.online !== resCentral.online;

  statusCentralPabx = {
    online: resCentral.online,
    latenciaMs: resCentral.ms,
    perdaPct: resCentral.perda,
    portaSipAberta: sipOk,
    ultimoTeste: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
    detalhe: resCentral.online ? 'Respondendo na rede interna' : 'Sem resposta ICMP no IP ' + configPabx.ipCentral
  };

  if (mudouEstado) {
    registrarLogPabx(
      resCentral.online ? 'OK' : 'ALERTA',
      resCentral.online
        ? \`Central PABX (\${configPabx.ipCentral}) ficou ONLINE (\${resCentral.ms} ms)\`
        : \`Falha de comunicacao com Central PABX (\${configPabx.ipCentral})\`
    );
  }

  for (const r of ramaisPabx) {
    if (!r.ip) continue;
    const pingR = await pingRealHost(r.ip);
    const antes = r.online;
    r.online = pingR.online;
    r.latenciaMs = pingR.ms;
    r.ultimoCheck = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    if (antes !== undefined && antes !== r.online) {
      registrarLogPabx(
        r.online ? 'SIP-REG' : 'SIP-UNREG',
        \`Ramal \${r.ramal} (\${r.colaborador}) ficou \${r.online ? 'ONLINE (' + r.latenciaMs + ' ms)' : 'OFFLINE'}\`
      );
    }
  }
}

setInterval(cicloMonitoramentoPabx, 3500);
cicloMonitoramentoPabx();

app.get('/api/pabx/status', autenticar, (req, res) => {
  res.json({
    config: configPabx,
    central: statusCentralPabx,
    ramais: ramaisPabx,
    logs: logsPabx,
    ligacoes: ligacoesAtivas
  });
});

app.post('/api/pabx/config', autenticar, async (req, res) => {
  const { ipCentral, modelo } = req.body || {};
  if (ipCentral) configPabx.ipCentral = ipCentral.trim();
  if (modelo) configPabx.modelo = modelo.trim();
  salvarJson('config.json', configPabx);
  registrarLogPabx('CONFIG', \`IP da Central PABX atualizado para \${configPabx.ipCentral}\`);
  await cicloMonitoramentoPabx();
  res.json({ ok: true, config: configPabx, central: statusCentralPabx });
});

app.post('/api/pabx/testar', autenticar, async (req, res) => {
  await cicloMonitoramentoPabx();
  const msg = statusCentralPabx.online
    ? \`Teste Central \${configPabx.ipCentral}: ONLINE | Latencia: \${statusCentralPabx.latenciaMs} ms | Perda: \${statusCentralPabx.perdaPct}% | Porta 5060: \${statusCentralPabx.portaSipAberta ? 'Aberta' : 'Fechada'}\`
    : \`Teste Central \${configPabx.ipCentral}: SEM RESPOSTA (100% perda de pacotes)\`;
  registrarLogPabx(statusCentralPabx.online ? 'TESTE-OK' : 'TESTE-ERRO', msg);
  res.json({ ok: true, mensagem: msg, central: statusCentralPabx });
});

app.post('/api/pabx/ramais', autenticar, async (req, res) => {
  const { ramal, colaborador, setor, ip, mac } = req.body || {};
  if (!ramal || !ip) return res.status(400).json({ erro: 'Ramal e IP sao obrigatorios' });
  const novo = {
    ramal: ramal.trim(),
    colaborador: (colaborador || 'Colaborador').trim(),
    setor: (setor || 'Geral').trim(),
    ip: ip.trim(),
    mac: (mac || '-').trim(),
    online: false,
    latenciaMs: null
  };
  ramaisPabx = ramaisPabx.filter(r => r.ramal !== novo.ramal);
  ramaisPabx.push(novo);
  salvarJson('ramais.json', ramaisPabx);
  registrarLogPabx('RAMAL', \`Ramal \${novo.ramal} (\${novo.colaborador} - \${novo.ip}) cadastrado no monitoramento\`);
  await cicloMonitoramentoPabx();
  res.json({ ok: true, ramais: ramaisPabx });
});

app.delete('/api/pabx/ramais/:ramal', autenticar, (req, res) => {
  ramaisPabx = ramaisPabx.filter(r => r.ramal !== req.params.ramal);
  salvarJson('ramais.json', ramaisPabx);
  res.json({ ok: true });
});

// Endpoint para receber eventos SIP / chamadas ao vivo da Central PABX (Webhook/AMI)
app.post('/api/pabx/evento', (req, res) => {
  const { tipo, origem, destino, status, chamadaId } = req.body || {};
  if (tipo === 'CHAMADA_INICIO') {
    ligacoesAtivas.unshift({
      id: chamadaId || String(Date.now()),
      origem: origem || 'Desconhecido',
      destino: destino || 'Desconhecido',
      inicio: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
      status: status || 'Em curso'
    });
    registrarLogPabx('CHAMADA', \`Chamada iniciada: \${origem} -> \${destino}\`);
  } else if (tipo === 'CHAMADA_FIM') {
    ligacoesAtivas = ligacoesAtivas.filter(c => c.id !== chamadaId && !(c.origem === origem && c.destino === destino));
    registrarLogPabx('CHAMADA-FIM', \`Chamada encerrada: \${origem} -> \${destino}\`);
  } else if (req.body.mensagem) {
    registrarLogPabx(tipo || 'SIP', req.body.mensagem);
  }
  res.json({ ok: true });
});

app.listen(8000, '0.0.0.0', () => {
  console.log('[CST TI] Portal RMM, Inventario 4K e PABX rodando na porta 8000');
});
`;

fs.writeFileSync('server.js', baseCode.trim() + '\n' + novasRotas);
console.log('server.js atualizado com sucesso!');
EOF
node ~/cst-rmm-portal/patch-server.js
