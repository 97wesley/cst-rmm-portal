const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const ActiveDirectory = require('activedirectory2');
const nodemailer = require('nodemailer');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
    secret: 'cst-rmm-secret-key-2026-prod',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 86400000 }
}));

const DB_ESTACOES = path.join(__dirname, 'estacoes_db.json');

// --- CONFIGURAÇÃO DO ACTIVE DIRECTORY (PRODUÇÃO) ---
const adConfig = {
    url: 'ldap://192.168.102.1', // Ajuste para o IP público/DDNS se o servidor estiver no Render
    baseDN: 'DC=CST,DC=LOCAL',
    connectTimeout: 7000
};

// Equipe de TI com permissão de Administrador
const administradoresTI = ['wesley.lima', 'romulo.evangelista', 'rafael.silva'];

// --- CONFIGURAÇÃO DE E-MAIL DE ALERTA ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'alerta-ti@cstbh.com.br',
        pass: process.env.SMTP_PASS || 'sua-senha-de-app'
    }
});

async function enviarAlertaQuedaRamal(ramalObj) {
    const mailOptions = {
        from: '"Central RMM - CST Telefonia" <alerta-ti@cstbh.com.br>',
        to: 'ti@cstbh.com.br',
        subject: `🚨 ALERTA TI: Queda de Conexão no Ramal ${ramalObj.ramal} (${ramalObj.nome})`,
        html: `<div style="font-family:Arial;padding:20px;background:#f8fafc;"><div style="background:#fff;border-left:6px solid #ef4444;padding:20px;border-radius:8px;"><h2 style="color:#ef4444;">🚨 Queda de Ramal IP</h2><p>Ramal: <strong>${ramalObj.ramal}</strong> (${ramalObj.nome})</p><p>IP: <strong>${ramalObj.ip}</strong></p></div></div>`
    };
    try { await transporter.sendMail(mailOptions); } catch (e) {}
}

// --- TELEFONIA DADOS ---
let centralStatus = { ip: "192.168.102.1", modelo: "Intelbras Impacta 300 ICIP", online: true, uptime: "15 dias, 04 horas", trafegoRx: "12.4 Mbps", trafegoTx: "8.7 Mbps", perdaPacotes: "0.0%", jitterMdio: "1.2 ms" };
let ramaisTelefonia = [
    { ramal: "001", nome: "Financeiro - Principal", setor: "Financeiro", ip: "192.168.102.10", mac: "00:1A:3F:41:2B:01", status: "Online", registroSip: "Registrado", latencia: 2, emChamada: false },
    { ramal: "002", nome: "Recepção - Entrada", setor: "Recepção", ip: "192.168.102.11", mac: "00:1A:3F:41:2B:02", status: "Online", registroSip: "Registrado", latencia: 3, emChamada: true, duracaoSeg: 65 },
    { ramal: "003", nome: "Coordenação Médica", setor: "Coordenação", ip: "192.168.102.12", mac: "00:1A:3F:41:2B:03", status: "Online", registroSip: "Registrado", latencia: 3, emChamada: false },
    { ramal: "004", nome: "Comercial / Vendas", setor: "Comercial", ip: "192.168.102.13", mac: "00:1A:3F:41:2B:04", status: "Online", registroSip: "Registrado", latencia: 4, emChamada: true, duracaoSeg: 65 },
    { ramal: "005", nome: "TI / Suporte Técnico", setor: "TI", ip: "192.168.102.14", mac: "00:1A:3F:41:2B:05", status: "Online", registroSip: "Registrado", latencia: 1, emChamada: false },
    { ramal: "010", nome: "Consultório 02", setor: "Atendimento", ip: "192.168.102.20", mac: "00:1A:3F:41:2B:10", status: "Offline", registroSip: "Não Registrado", latencia: 0, emChamada: false }
];
let chamadasHistorico = [
    { id: 101, origem: "Ramal 002 (Recepção)", destino: "Ramal 004 (Comercial)", status: "EM CHAMADA", duracao: "01:05" },
    { id: 100, origem: "Ramal 005 (TI)", destino: "Ramal 001 (Financeiro)", status: "FINALIZADA", duracao: "03:12" }
];
let eventosTelefonia = [
    { hora: new Date().toLocaleTimeString('pt-BR'), texto: "Sincronização SIP realizada no Gateway ICIP.", tipo: "info" }
];

setInterval(() => {
    ramaisTelefonia.forEach(r => {
        if (r.status === "Online") {
            r.latencia = Math.floor(Math.random() * 4) + 1;
            if (r.emChamada) r.duracaoSeg = (r.duracaoSeg || 0) + 5;
        }
    });
}, 5000);

// --- ESTAÇÕES ---
function carregarEstacoes() {
    if (fs.existsSync(DB_ESTACOES)) {
        try { return new Map(JSON.parse(fs.readFileSync(DB_ESTACOES, 'utf8'))); } catch (e) {}
    }
    return new Map([
        ["GC-M08-PC0085", { hostname: "GC-M08-PC0085", entidade: "Entidade raiz > CST", usuario: "wesley.lima@CST", tipo: "Desktop", remoto: "rustdesk", rustdesk_id: "1382626814", versao_agente: "1.21", processador: "AMD Ryzen 3 3200G", ram_total: "16 GB", ip: "192.168.56.1", cpu: 41, ram: 80.1, disco: 89.6, ultimaVez: new Date().toISOString() }]
    ]);
}
const estacoesRegistradas = carregarEstacoes();
const comandosPendentes = new Map();

const autenticar = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Acesso CST Produção AD</title>
        <style>body{font-family:'Segoe UI',sans-serif;background:#0b131e;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}
        .box{background:#132030;padding:40px;border-radius:10px;width:360px;} input,select{width:100%;padding:10px;margin:10px 0;background:#0b131e;border:1px solid #1e2d42;color:#fff;border-radius:5px;}
        button{width:100%;padding:12px;background:#0284c7;color:#fff;border:none;border-radius:5px;font-weight:bold;cursor:pointer;}</style></head>
        <body><div class="box"><h2 style="color:#38bdf8;text-align:center;">Acesso CST (AD)</h2>
        <form action="/login" method="POST">
        <input type="text" name="username" placeholder="ex: wesley.lima" required>
        <input type="password" name="password" placeholder="Senha da Rede" required>
        <select name="perfil"><option value="user">👤 Colaborador (Autoatendimento)</option><option value="admin">⚙️ TI (Administrador)</option></select>
        <button type="submit">Entrar no Portal</button></form></div></body></html>
    `);
});

// --- ROTA DE LOGIN EXCLUSIVA COM ACTIVE DIRECTORY (SEM FALBACKS DE TESTE) ---
app.post('/login', (req, res) => {
    const { username, password, perfil } = req.body;
    const userClean = (username || '').toLowerCase().trim();
    const userAD = userClean.includes('@') ? userClean : `${userClean}@cst.local`;

    const ad = new ActiveDirectory(adConfig);

    ad.authenticate(userAD, password, (err, auth) => {
        if (err || !auth) {
            return res.send(`
                <script>
                    alert("Falha na autenticação do Active Directory. Usuário ou senha incorretos.");
                    window.location.href = "/login";
                </script>
            `);
        }

        // Validação de perfil de TI
        if (perfil === 'admin') {
            if (administradoresTI.includes(userClean)) {
                req.session.user = { login: userClean, admin: true };
                return res.redirect('/admin');
            } else {
                return res.send(`
                    <script>
                        alert("Acesso Negado: Sua conta autenticou no AD, mas não possui privilégios administrativos de TI.");
                        window.location.href = "/login";
                    </script>
                `);
            }
        } else {
            req.session.user = { login: userClean, admin: false };
            return res.redirect('/');
        }
    });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.get('/', autenticar, (req, res) => {
    if (req.session.user.admin) return res.redirect('/admin');
    res.send(`<h1>Painel do Colaborador - CST Self-Service</h1><a href="/logout">Sair</a>`);
});

// --- ROTA DE ADMINISTRADOR COMPLETA ---
app.get('/admin', autenticar, (req, res) => {
    if (!req.session.user.admin) return res.status(403).send("Acesso Negado.");
    
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Painel RMM Administrador - CST</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; }
                body { background-color: #0b131e; color: #e2e8f0; }
                .admin-header { background: #ffffff; padding: 12px 25px; display: flex; justify-content: space-between; align-items: center; color: #1e293b; }
                .nav-tabs { display: flex; gap: 10px; font-size: 13px; font-weight: 700; }
                .tab-btn { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 6px; cursor: pointer; text-decoration: none; color: #475569; }
                .tab-btn:hover, .tab-btn.active { background: #e0f2fe; color: #0284c7; }
                .container { padding: 25px; }
                
                .card-table { background: #ffffff; border-radius: 8px; overflow-x: auto; color: #1e293b; }
                table { width: 100%; border-collapse: collapse; text-align: left; white-space: nowrap; }
                th { background: #ffffff; color: #0f172a; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 14px 16px; border-bottom: 2px solid #e2e8f0; }
                td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .badge-online { background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; }
                .badge-offline { background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; }
                .btn-cmd { background: #0284c7; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; margin-right: 4px; }
                
                .pbx-banner-container { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border: 1px solid #334155; border-radius: 12px; padding: 20px 25px; margin-bottom: 25px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
                .pbx-info-side { display: flex; align-items: center; gap: 20px; }
                .pbx-3d-stage { width: 55px; height: 55px; perspective: 600px; }
                .pbx-3d-box { width: 100%; height: 100%; position: relative; transform-style: preserve-3d; animation: spin3d 10s infinite linear; }
                @keyframes spin3d { 0% { transform: rotateX(-15deg) rotateY(0deg); } 100% { transform: rotateX(-15deg) rotateY(360deg); } }
                .cube-face { position: absolute; width: 55px; height: 55px; border: 2px solid; display: flex; align-items: center; justify-content: center; font-size: 20px; border-radius: 8px; opacity: 0.9; }
                .online-3d .cube-face { background: rgba(34, 197, 94, 0.2); border-color: #22c55e; color: #4ade80; box-shadow: 0 0 15px rgba(34, 197, 94, 0.4); }
                .offline-3d .cube-face { background: rgba(239, 68, 68, 0.3); border-color: #ef4444; color: #fca5a5; box-shadow: 0 0 25px rgba(239, 68, 68, 0.8); }
                
                .tel-bottom-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 20px; }
                .dark-panel { background: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 20px; color: #f3f4f6; }
                .dark-panel h4 { color: #38bdf8; font-size: 14px; border-bottom: 1px solid #1f2937; padding-bottom: 10px; margin-bottom: 15px; }
                .sector-row { margin-bottom: 12px; }
                .sector-info { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
                .sector-bar-bg { background: #1f2937; border-radius: 6px; height: 10px; overflow: hidden; }
                .sector-bar-fill { background: #0284c7; height: 100%; border-radius: 6px; }
                .event-log-item { font-size: 12px; padding: 8px 10px; border-left: 3px solid #0284c7; background: #1a2436; margin-bottom: 8px; border-radius: 4px; }
                .event-log-item.danger { border-left-color: #ef4444; background: #2d181e; }
                
                .tab-content { display: none; }
                .tab-content.active { display: block; }
            </style>
        </head>
        <body>
            <header class="admin-header">
                <div class="nav-tabs">
                    <a class="tab-btn active" onclick="trocarSecao('sec-computadores', this)"><i class="fa-solid fa-desktop" style="color: #0284c7;"></i> 💻 Computador (RMM 5s)</a>
                    <a class="tab-btn" onclick="trocarSecao('sec-ativos', this)"><i class="fa-solid fa-folder" style="color: #f59e0b;"></i> 📁 Ativos & Inventário</a>
                    <a class="tab-btn" onclick="trocarSecao('sec-telefonia', this)"><i class="fa-solid fa-phone" style="color: #10b981;"></i> 📞 Telefonia IP & Ramais</a>
                </div>
                <div>
                    <span style="font-size: 13px; font-weight: 700; margin-right: 15px;">${req.session.user.login} (TI AD)</span>
                    <a href="/logout" style="background:#ef4444;color:#fff;padding:6px 12px;border-radius:4px;text-decoration:none;font-weight:bold;">Sair</a>
                </div>
            </header>

            <div class="container">
                <div id="sec-computadores" class="tab-content active">
                    <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; color: #fff;">
                        <h3>💻 Estações de Trabalho Registradas</h3>
                        <span style="font-size: 12px; color: #34d399;"><i class="fa-solid fa-sync fa-spin"></i> Sincronizando a cada 5s</span>
                    </div>
                    <div class="card-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>NOME</th><th>ENTIDADE</th><th>STATUS</th><th>TIPO</th><th>USUÁRIO</th><th>PROCESSADOR</th><th>MEMÓRIA</th><th>DISCO</th><th>IP</th><th>ÚLTIMA ATUALIZAÇÃO</th><th>AÇÕES DE TI</th>
                                </tr>
                            </thead>
                            <tbody id="tbComputadoresRmm">
                                <tr><td colspan="11">Carregando computadores...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div id="sec-ativos" class="tab-content">
                    <div style="background: #fff; padding: 25px; border-radius: 8px; color: #1e293b;">
                        <h3>📁 Gestão de Ativos CST</h3>
                        <p>Inventário de hardware cadastrado.</p>
                    </div>
                </div>

                <div id="sec-telefonia" class="tab-content">
                    <div class="pbx-banner-container">
                        <div class="pbx-info-side">
                            <div class="pbx-3d-stage">
                                <div class="pbx-3d-box online-3d" id="cube3d">
                                    <div class="cube-face"><i class="fa-solid fa-server"></i></div>
                                </div>
                            </div>
                            <div>
                                <h3 style="color:#fff; font-size:18px;">Central IP - Intelbras Impacta 300 <span class="badge-online" id="badgeCentralStatus">100% OPERACIONAL</span></h3>
                                <p style="color:#94a3b8; font-size:13px;">IP da Central: <strong style="color:#38bdf8;" id="txtIpCentral">192.168.102.1</strong> | Uptime: <strong id="txtUptimeCentral" style="color:#fff;">15 dias, 04h</strong></p>
                            </div>
                        </div>
                        <div>
                            <button onclick="alternarCentral()" style="background:#3b82f6;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:bold;">🔄 Simular Teste de Sinal</button>
                        </div>
                    </div>

                    <div style="background: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 20px; color: #f3f4f6; margin-bottom: 20px;">
                        <h4 style="color: #38bdf8; font-size: 15px; margin-bottom: 15px;">📞 Ramais IP (Ping & Latência a cada 5s)</h4>
                        <table style="width: 100%; color: #e5e7eb;">
                            <thead>
                                <tr style="background: #1f2937; color: #9ca3af;">
                                    <th>RAMAL</th><th>COLABORADOR</th><th>IP</th><th>MAC ADDRESS</th><th>STATUS</th><th>LATÊNCIA</th><th>AÇÃO TESTE</th>
                                </tr>
                            </thead>
                            <tbody id="tbRamaisCorpo"></tbody>
                        </table>
                    </div>

                    <div class="tel-bottom-grid">
                        <div class="dark-panel">
                            <h4>📊 Ramais por Setor</h4>
                            <div class="sector-row"><div class="sector-info"><span>Financeiro</span><span>10 Ramais</span></div><div class="sector-bar-bg"><div class="sector-bar-fill" style="width:100%;"></div></div></div>
                            <div class="sector-row"><div class="sector-info"><span>Recepção</span><span>8 Ramais</span></div><div class="sector-bar-bg"><div class="sector-bar-fill" style="width:100%;"></div></div></div>
                            <div class="sector-row"><div class="sector-info"><span>Coordenação</span><span>8 Ramais</span></div><div class="sector-bar-bg"><div class="sector-bar-fill" style="width:100%;"></div></div></div>
                            <div class="sector-row"><div class="sector-info"><span>Comercial</span><span>7 Ramais</span></div><div class="sector-bar-bg"><div class="sector-bar-fill" style="width:87.5%;background:#f59e0b;"></div></div></div>
                            <div class="sector-row"><div class="sector-info"><span>TI / Suporte</span><span>7 Ramais</span></div><div class="sector-bar-bg"><div class="sector-bar-fill" style="width:100%;"></div></div></div>
                        </div>

                        <div class="dark-panel">
                            <h4>⚡ Live Log de Eventos SIP</h4>
                            <div id="containerEventosLog"></div>
                        </div>

                        <div class="dark-panel">
                            <h4>📞 Ligações em Andamento Agora</h4>
                            <div id="containerChamadasAtivas"></div>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                function trocarSecao(secaoId, el) {
                    document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
                    document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
                    document.getElementById(secaoId).classList.add('active');
                    el.classList.add('active');
                    if (secaoId === 'sec-telefonia') carregarTelefonia();
                }

                async function sincronizarRmm() {
                    try {
                        const res = await fetch('/api/v1/rmm-metrics');
                        const dados = await res.json();
                        let html = '';
                        dados.forEach(maq => {
                            const isOnline = (new Date() - new Date(maq.ultimaVez)) < 35000;
                            html += `
                                <tr>
                                    <td><strong>💻 ${maq.hostname}</strong></td>
                                    <td>${maq.entidade || 'Entidade raiz > CST'}</td>
                                    <td><span class="${isOnline ? 'badge-online' : 'badge-offline'}">${isOnline ? 'Online' : 'Offline'}</span></td>
                                    <td>${maq.tipo || 'Desktop'}</td>
                                    <td>${maq.usuario}</td>
                                    <td>${maq.processador || 'Intel/AMD'}</td>
                                    <td><strong>${maq.ram_total || '8 GB'}</strong> (${maq.ram}% uso)</td>
                                    <td>${maq.disco}% uso</td>
                                    <td><strong>${maq.ip}</strong></td>
                                    <td style="color:#64748b;">${new Date(maq.ultimaVez).toLocaleTimeString()}</td>
                                    <td>
                                        <button class="btn-cmd" onclick="enviarCmd('${maq.hostname}', 'limpar_cache')">🧹 Cache</button>
                                        <button class="btn-cmd" onclick="enviarCmd('${maq.hostname}', 'destravar_impressora')">🔄 Spooler</button>
                                    </td>
                                </tr>
                            `;
                        });
                        document.getElementById('tbComputadoresRmm').innerHTML = html;
                    } catch (e) {}
                }

                async function enviarCmd(hostname, acao) {
                    if (!confirm("Enviar comando [" + acao + "] para " + hostname + "?")) return;
                    await fetch('/api/v1/executar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ hostname, acao }) });
                    alert("Comando enfileirado!");
                }

                async function carregarTelefonia() {
                    try {
                        const res = await fetch('/api/v1/telefonia/metrics');
                        const dados = await res.json();
                        
                        const cube = document.getElementById('cube3d');
                        const badge = document.getElementById('badgeCentralStatus');
                        if (dados.central.online) {
                            cube.className = 'pbx-3d-box online-3d';
                            badge.className = 'badge-online';
                            badge.innerText = '100% OPERACIONAL';
                        } else {
                            cube.className = 'pbx-3d-box offline-3d';
                            badge.className = 'badge-offline';
                            badge.innerText = '⚠️ CENTRAL FORA DO AR';
                        }
                        document.getElementById('txtIpCentral').innerText = dados.central.ip;
                        document.getElementById('txtUptimeCentral').innerText = dados.central.uptime;

                        let htmlTb = '';
                        dados.ramais.forEach(r => {
                            const badgeSt = r.status === 'Online' ? (r.emChamada ? '<span style="background:#0284c7;color:#fff;padding:2px 6px;border-radius:10px;font-size:10px;">📞 EM CHAMADA</span>' : '<span class="badge-online">🟢 Online</span>') : '<span class="badge-offline">🔴 Offline</span>';
                            const lat = r.status === 'Online' ? `<strong style="color:#34d399;">${r.latencia} ms</strong>` : '<span style="color:#ef4444;">Timeout</span>';
                            htmlTb += `
                                <tr>
                                    <td style="font-weight:bold;color:#38bdf8;">${r.ramal}</td>
                                    <td>${r.nome}</td>
                                    <td><strong style="color:#60a5fa;">${r.ip}</strong></td>
                                    <td style="font-size:11px;color:#9ca3af;">${r.mac}</td>
                                    <td>${badgeSt}</td>
                                    <td>${lat}</td>
                                    <td>${r.status === 'Online' ? `<button onclick="simularQueda('${r.ramal}')" style="background:#ef4444;color:#fff;border:none;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:10px;">Queda (E-mail)</button>` : 'Offline'}</td>
                                </tr>
                            `;
                        });
                        document.getElementById('tbRamaisCorpo').innerHTML = htmlTb;

                        let htmlLog = '';
                        dados.eventos.forEach(ev => { htmlLog += `<div class="event-log-item ${ev.tipo === 'danger' ? 'danger' : ''}"><span style="color:#94a3b8;">${ev.hora}</span> ${ev.texto}</div>`; });
                        document.getElementById('containerEventosLog').innerHTML = htmlLog;

                        let htmlCh = '';
                        dados.chamadas.forEach(c => {
                            htmlCh += `<div style="background:#1f2937;border-left:4px solid #3b82f6;padding:10px;margin-bottom:8px;border-radius:4px;font-size:12px;"><div style="display:flex;justify-content:space-between;"><span style="font-weight:bold;color:#60a5fa;">${c.status}</span><span>⏱️ ${c.duracao}</span></div><div>${c.origem}</div><div style="color:#9ca3af;">➡️ ${c.destino}</div></div>`;
                        });
                        document.getElementById('containerChamadasAtivas').innerHTML = htmlCh;
                    } catch (e) {}
                }

                async function alternarCentral() {
                    await fetch('/api/v1/telefonia/alternar-central', { method: 'POST' });
                    carregarTelefonia();
                }

                async function simularQueda(ramal) {
                    if (!confirm("Simular queda no ramal " + ramal + "?")) return;
                    await fetch('/api/v1/telefonia/simular-queda', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ramal }) });
                    alert("Alerta de queda enviado!");
                    carregarTelefonia();
                }

                sincronizarRmm();
                setInterval(sincronizarRmm, 5000);
                setInterval(() => {
                    const sec = document.getElementById('sec-telefonia');
                    if (sec && sec.classList.contains('active')) carregarTelefonia();
                }, 3000);
            </script>
        </body>
        </html>
    `);
});

// --- APIS ---
app.post('/api/v1/telemetria', (req, res) => {
    const { hostname, usuario, ip, cpu, ram, disco } = req.body;
    if (hostname) {
        const key = hostname.toUpperCase();
        const existente = estacoesRegistradas.get(key) || {};
        estacoesRegistradas.set(key, {
            ...existente,
            hostname: key,
            usuario: usuario || existente.usuario || 'Desconhecido',
            ip: ip || existente.ip || '0.0.0.0',
            cpu: cpu || 0, ram: ram || 0, disco: disco || 0,
            ultimaVez: new Date().toISOString()
        });
    }
    res.json({ status: "ok" });
});

app.get('/api/v1/rmm-metrics', (req, res) => res.json(Array.from(estacoesRegistradas.values())));

app.post('/api/v1/executar', (req, res) => {
    const target = (req.body.hostname || '').toUpperCase();
    if (!comandosPendentes.has(target)) comandosPendentes.set(target, []);
    comandosPendentes.get(target).push({ acao: req.body.acao });
    res.json({ status: "sucesso" });
});

app.get('/api/v1/pendencias/:hostname', (req, res) => {
    const target = req.params.hostname.toUpperCase();
    const acoes = comandosPendentes.get(target) || [];
    comandosPendentes.set(target, []);
    res.json({ acoes });
});

app.get('/api/v1/telefonia/metrics', (req, res) => {
    const total = ramaisTelefonia.length;
    const online = ramaisTelefonia.filter(r => r.status === 'Online').length;
    res.json({ central: centralStatus, resumo: { total, online, offline: total - online, emChamada: ramaisTelefonia.filter(r => r.emChamada).length }, ramais: ramaisTelefonia, chamadas: chamadasHistorico, eventos: eventosTelefonia });
});

app.post('/api/v1/telefonia/alternar-central', (req, res) => {
    centralStatus.online = !centralStatus.online;
    eventosTelefonia.unshift({ hora: new Date().toLocaleTimeString('pt-BR'), texto: `Status da Central IP: ${centralStatus.online ? 'ONLINE' : 'OFFLINE'}`, tipo: centralStatus.online ? 'info' : 'danger' });
    res.json({ status: "ok" });
});

app.post('/api/v1/telefonia/simular-queda', async (req, res) => {
    const { ramal } = req.body;
    const r = ramaisTelefonia.find(i => i.ramal === ramal);
    if (r) {
        r.status = "Offline";
        eventosTelefonia.unshift({ hora: new Date().toLocaleTimeString('pt-BR'), texto: `Queda detectada no Ramal ${r.ramal}. Notificação enviada.`, tipo: "danger" });
        await enviarAlertaQuedaRamal(r);
    }
    res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor RMM Corporativo em Produção AD rodando na porta ${PORT}`));
