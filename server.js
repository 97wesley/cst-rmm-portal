const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
    secret: 'cst-rmm-secret-key-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 86400000 }
}));

const DB_ESTACOES = path.join(__dirname, 'estacoes_db.json');
const DB_ATIVOS = path.join(__dirname, 'ativos_db.json');

// --- CONFIGURAÇÃO DE ALERTA POR E-MAIL (NODEMAILER) ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'seu-email-ti@gmail.com', // Configure a credencial do e-mail remetente
        pass: process.env.SMTP_PASS || 'sua-senha-de-app'
    }
});

async function enviarAlertaQuedaRamal(ramalObj) {
    const mailOptions = {
        from: '"Central RMM - CST Telefonia" <alerta-ti@cstbh.com.br>',
        to: 'ti@cstbh.com.br',
        subject: `🚨 ALERTA TI: Queda de Conexão no Ramal ${ramalObj.ramal} (${ramalObj.nome})`,
        html: `
            <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px;">
                <div style="max-width: 600px; background: #ffffff; border-left: 6px solid #ef4444; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <h2 style="color: #ef4444; margin-top: 0;">🚨 Alerta de Queda de Ramal IP - CST</h2>
                    <p style="color: #334155;">O sistema de monitoramento de telefonia detectou perda de sinal IP com a estação de trabalho/aparelho:</p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <tr><td style="padding: 8px; border-bottom: 1fr solid #e2e8f0; font-weight: bold;">Ramal:</td><td style="padding: 8px; border-bottom: 1fr solid #e2e8f0;">${ramalObj.ramal}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1fr solid #e2e8f0; font-weight: bold;">Colaborador / Setor:</td><td style="padding: 8px; border-bottom: 1fr solid #e2e8f0;">${ramalObj.nome} (${ramalObj.setor})</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1fr solid #e2e8f0; font-weight: bold;">Endereço IP:</td><td style="padding: 8px; border-bottom: 1fr solid #e2e8f0; color: #0284c7; font-weight: bold;">${ramalObj.ip}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1fr solid #e2e8f0; font-weight: bold;">Endereço MAC:</td><td style="padding: 8px; border-bottom: 1fr solid #e2e8f0;">${ramalObj.mac}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1fr solid #e2e8f0; font-weight: bold;">Status Atual:</td><td style="padding: 8px; border-bottom: 1fr solid #e2e8f0; color: #ef4444; font-weight: bold;">OFFLINE / INDISPONÍVEL</td></tr>
                        <tr><td style="padding: 8px; font-weight: bold;">Data / Hora da Queda:</td><td style="padding: 8px;">${new Date().toLocaleString('pt-BR')}</td></tr>
                    </table>
                    <p style="font-size: 13px; color: #64748b; margin-top: 20px;">Este e-mail foi gerado automaticamente pelo Portal RMM da CST Medicina do Trabalho.</p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[E-MAIL ENVIADO] Alerta de queda do ramal ${ramalObj.ramal} enviado para ti@cstbh.com.br`);
    } catch (err) {
        console.error(`[ERRO E-MAIL] Falha ao enviar e-mail de alerta:`, err.message);
    }
}

// --- ESTRUTURA DE BANCO EM MEMÓRIA PARA TELEFONIA EM TEMPO REAL ---
let ramaisTelefonia = [
    { ramal: "001", nome: "Financeiro - Principal", setor: "Financeiro", ip: "192.168.102.10", mac: "00:1A:3F:41:2B:01", status: "Online", registroSip: "Registrado", latencia: 2, emChamada: false, falhas: 0 },
    { ramal: "002", nome: "Recepção - Entrada", setor: "Recepção", ip: "192.168.102.11", mac: "00:1A:3F:41:2B:02", status: "Online", registroSip: "Registrado", latencia: 3, emChamada: true, chamandoCom: "004 (Comercial)", duracaoSeg: 45, falhas: 0 },
    { ramal: "003", nome: "Coordenação Médica", setor: "Coordenação", ip: "192.168.102.12", mac: "00:1A:3F:41:2B:03", status: "Online", registroSip: "Registrado", latencia: 3, emChamada: false, falhas: 0 },
    { ramal: "004", nome: "Comercial / Vendas", setor: "Comercial", ip: "192.168.102.13", mac: "00:1A:3F:41:2B:04", status: "Online", registroSip: "Registrado", latencia: 4, emChamada: true, chamandoCom: "002 (Recepção)", duracaoSeg: 45, falhas: 0 },
    { ramal: "005", nome: "TI / Suporte Técnico", setor: "TI", ip: "192.168.102.14", mac: "00:1A:3F:41:2B:05", status: "Online", registroSip: "Registrado", latencia: 1, emChamada: false, falhas: 0 },
    { ramal: "010", nome: "Consultório 02", setor: "Atendimento", ip: "192.168.102.20", mac: "00:1A:3F:41:2B:10", status: "Offline", registroSip: "Não Registrado", latencia: 0, emChamada: false, falhas: 3 }
];

let chamadasHistorico = [
    { id: 101, origem: "Ramal 002 (Recepção)", destino: "Ramal 004 (Comercial)", inicio: new Date().toLocaleTimeString('pt-BR'), status: "EM CHAMADA", duracao: "00:45" },
    { id: 100, origem: "Ramal 005 (TI)", destino: "Ramal 001 (Financeiro)", inicio: "11:30:12", status: "FINALIZADA", duracao: "03:12" }
];

// --- LOOP DE TELEMETRIA DE TELEFONIA (A CADA 5 SEGUNDOS) ---
setInterval(() => {
    ramaisTelefonia.forEach(r => {
        if (r.status === "Online") {
            // Variação em tempo real da latência de ping (ms)
            r.latencia = Math.floor(Math.random() * 5) + 1; // 1ms a 5ms

            // Incrementa o tempo das chamadas ativas
            if (r.emChamada) {
                r.duracaoSeg = (r.duracaoSeg || 0) + 5;
            }
        }
    });

    // Atualiza histórico de chamadas ativas
    const chamadaAtiva = chamadasHistorico.find(c => c.status === "EM CHAMADA");
    if (chamadaAtiva) {
        const seg = (ramaisTelefonia.find(r => r.ramal === "002") || {}).duracaoSeg || 45;
        const mins = Math.floor(seg / 60).toString().padStart(2, '0');
        const secs = (seg % 60).toString().padStart(2, '0');
        chamadaAtiva.duracao = `${mins}:${secs}`;
    }
}, 5000);

// --- ROTA MANUAL PARA SIMULAR QUEDA DE RAMAL E DISPARO DE E-MAIL ---
app.post('/api/v1/telefonia/simular-queda', async (req, res) => {
    const { ramal } = req.body;
    const r = ramaisTelefonia.find(item => item.ramal === ramal);
    if (r) {
        const statusAnterior = r.status;
        r.status = "Offline";
        r.registroSip = "Não Registrado";
        r.latencia = 0;
        r.emChamada = false;

        if (statusAnterior === "Online") {
            await enviarAlertaQuedaRamal(r);
        }
        return res.json({ status: "sucesso", mensagem: `Queda simulada no ramal ${ramal}. Alerta enviado!` });
    }
    res.status(404).json({ erro: "Ramal não encontrado" });
});

// --- APIS DE TELEFONIA EM TEMPO REAL ---
app.get('/api/v1/telefonia/metrics', (req, res) => {
    const total = ramaisTelefonia.length;
    const online = ramaisTelefonia.filter(r => r.status === 'Online').length;
    const offline = ramaisTelefonia.filter(r => r.status === 'Offline').length;
    const semSip = ramaisTelefonia.filter(r => r.registroSip !== 'Registrado').length;
    const emChamada = ramaisTelefonia.filter(r => r.emChamada).length;

    res.json({
        resumo: {
            total,
            online,
            offline,
            semSip,
            emChamada,
            disponibilidade: Math.round((online / total) * 100)
        },
        ramais: ramaisTelefonia,
        chamadas: chamadasHistorico
    });
});

// Manter rotas anteriores...
function carregarEstacoes() {
    if (fs.existsSync(DB_ESTACOES)) {
        try { return new Map(JSON.parse(fs.readFileSync(DB_ESTACOES, 'utf8'))); } catch (e) {}
    }
    return new Map();
}
function carregarAtivos() {
    if (fs.existsSync(DB_ATIVOS)) {
        try { return JSON.parse(fs.readFileSync(DB_ATIVOS, 'utf8')); } catch (e) {}
    }
    return [];
}
const estacoesRegistradas = carregarEstacoes();
let inventarioAtivos = carregarAtivos();
const comandosPendentes = new Map();
const administradoresTI = ['wesley.lima', 'romulo.evangelista', 'rafael.silva'];

const autenticar = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

app.get('/login', (req, res) => res.render('login', { erro: null }));
app.post('/login', (req, res) => {
    const { username, password, perfil } = req.body;
    const userFormatado = (username || '').toLowerCase().trim();
    if (password !== '123') return res.render('login', { erro: 'Senha incorreta.' });

    if (perfil === 'admin') {
        if (administradoresTI.includes(userFormatado)) {
            req.session.user = { login: userFormatado, admin: true };
            return res.redirect('/admin');
        } else {
            return res.render('login', { erro: 'Acesso Restrito à Equipe de TI.' });
        }
    } else {
        req.session.user = { login: userFormatado, admin: false };
        return res.redirect('/');
    }
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.get('/', autenticar, (req, res) => {
    if (req.session.user.admin) return res.redirect('/admin');
    res.render('user-dashboard', { usuario: req.session.user.login });
});

app.get('/admin', autenticar, (req, res) => {
    if (!req.session.user.admin) return res.status(403).send("Acesso Negado.");
    res.render('admin-dashboard', { 
        usuario: req.session.user.login,
        estacoes: Array.from(estacoesRegistradas.values()),
        ativos: inventarioAtivos
    });
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor RMM Corporativo rodando na porta ${PORT}`));
