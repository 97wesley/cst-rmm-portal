const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'cst-rmm-secret-key-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 86400000 }
}));

const DB_FILE = path.join(__dirname, 'estacoes_db.json');

// Carrega ou inicializa o banco de estações conhecido
function carregarBanco() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return new Map(JSON.parse(data));
        } catch (e) {
            console.error("Erro ao ler banco local:", e);
        }
    }
    // Base de dados inicial da frota CST
    const baseInicial = new Map([
        ["GC-M08-PC0085", {
            hostname: "GC-M08-PC0085",
            entidade: "Entidade raiz > CST",
            usuario: "wesley.lima@CST",
            tipo: "Desktop",
            remoto: "rustdesk",
            rustdesk_id: "1382626814",
            versao_agente: "1.21",
            processador: "AMD Ryzen 3 3200G with Radeon Vega Graphics, 3600 Mhz, 4 Núcleos",
            ram_total: "16 GB",
            ram_uso_percent: 80.1,
            ip: "Cloud-Connected",
            ip_local: "192.168.56.1",
            cpu: 41,
            ram: 80.1,
            disco: 89.6,
            fabricante: "AMD",
            modelo: "A320",
            num_serie: "SN-9982341",
            num_inventario: "CST-2026-0085",
            uuid: "4C4C4544-0038-1030-8034-B3C04F383232",
            particoes: [
                { nome: "C:", auto: "Sim", particao: "Disk 0, Partition 2", montagem: "C:", filesystem: "NTFS", tamanho: "237.38 GB", livre: "24.16 GB", uso_percent: 90, cripto: "Não" },
                { nome: "Local Disk", auto: "Sim", particao: "Disk 0, Partition 1", montagem: "System", filesystem: "NTFS", tamanho: "897 MiB", livre: "115 MiB", uso_percent: 87, cripto: "Não" },
                { nome: "Windows11", auto: "Sim", particao: "Disk 1, Partition 1", montagem: "D:", filesystem: "NTFS", tamanho: "111.66 GB", livre: "68.94 GB", uso_percent: 38, cripto: "Não" }
            ],
            ultimaVez: new Date().toISOString()
        }],
        ["CS-M02-PC0025", {
            hostname: "CS-M02-PC0025",
            entidade: "Entidade raiz > CST",
            usuario: "pamela.araujo@CST",
            tipo: "Desktop",
            remoto: "rustdesk",
            rustdesk_id: "1211199845",
            versao_agente: "1.21",
            processador: "Intel(R) Core(TM) i3-8100 CPU @ 3.60GHz",
            ram_total: "8 GB",
            ram_uso_percent: 38.0,
            ip: "192.168.111.86",
            ip_local: "192.168.111.86",
            cpu: 15,
            ram: 38.0,
            disco: 45.2,
            fabricante: "Intel",
            modelo: "H310M",
            num_serie: "SN-7741029",
            num_inventario: "CST-2026-0025",
            uuid: "550E8400-E29B-41D4-A716-446655440000",
            particoes: [
                { nome: "C:", auto: "Sim", particao: "Disk 0, Partition 1", montagem: "C:", filesystem: "NTFS", tamanho: "465.76 GB", livre: "255.20 GB", uso_percent: 45, cripto: "Não" }
            ],
            ultimaVez: new Date(Date.now() - 600000).toISOString()
        }]
    ]);
    return baseInicial;
}

const estacoesRegistradas = carregarBanco();
const comandosPendentes = new Map();

function salvarBanco() {
    try {
        const arrayData = Array.from(estacoesRegistradas.entries());
        fs.writeFileSync(DB_FILE, JSON.stringify(arrayData, null, 2));
    } catch (e) {
        console.error("Erro ao salvar banco local:", e);
    }
}

const administradoresTI = ['wesley.lima', 'romulo.evangelista', 'rafael.silva'];

const autenticar = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

app.get('/login', (req, res) => res.render('login', { erro: null }));

app.post('/login', (req, res) => {
    const { username, password, perfil } = req.body;
    const userFormatado = (username || '').toLowerCase().trim();

    if (password !== '123') {
        return res.render('login', { erro: 'Senha incorreta. (Para testes, use a senha: 123)' });
    }

    if (perfil === 'admin') {
        if (administradoresTI.includes(userFormatado)) {
            req.session.user = { login: userFormatado, admin: true };
            return res.redirect('/admin');
        } else {
            return res.render('login', { erro: 'Acesso Restrito: Seu usuário não faz parte da equipe de TI.' });
        }
    } else {
        req.session.user = { login: userFormatado, admin: false };
        return res.redirect('/');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', autenticar, (req, res) => {
    if (req.session.user.admin) return res.redirect('/admin');
    res.render('user-dashboard', { usuario: req.session.user.login });
});

app.get('/admin', autenticar, (req, res) => {
    if (!req.session.user.admin) return res.status(403).send("Acesso Negado.");
    res.render('admin-dashboard', { 
        usuario: req.session.user.login,
        estacoes: Array.from(estacoesRegistradas.values()) 
    });
});

// Telemetria vinda do Agente PowerShell
app.post('/api/v1/telemetria', (req, res) => {
    const { hostname, usuario, ip, ip_local, cpu, ram, disco, processador, ram_total, rustdesk_id, particoes } = req.body;
    if (hostname) {
        const key = hostname.toUpperCase();
        const existente = estacoesRegistradas.get(key) || {};
        
        estacoesRegistradas.set(key, {
            ...existente,
            hostname: key,
            entidade: "Entidade raiz > CST",
            usuario: usuario || existente.usuario || 'Desconhecido',
            tipo: "Desktop",
            remoto: "rustdesk",
            rustdesk_id: rustdesk_id || existente.rustdesk_id || "1382626814",
            versao_agente: "1.21",
            processador: processador || existente.processador || "AMD / Intel Processor",
            ram_total: ram_total || existente.ram_total || "8 GB",
            ram_uso_percent: ram || 0,
            ip: ip || ip_local || existente.ip || '0.0.0.0',
            ip_local: ip_local || ip || '0.0.0.0',
            cpu: cpu || 0,
            ram: ram || 0,
            disco: disco || 0,
            particoes: particoes || existente.particoes || [],
            ultimaVez: new Date().toISOString()
        });
        salvarBanco();
    }
    res.json({ status: "ok" });
});

app.get('/api/v1/detalhes/:hostname', (req, res) => {
    const key = req.params.hostname.toUpperCase();
    const dados = estacoesRegistradas.get(key);
    if (!dados) return res.status(404).json({ erro: "Máquina não encontrada" });
    res.json(dados);
});

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

app.get('/api/v1/rmm-metrics', (req, res) => {
    res.json(Array.from(estacoesRegistradas.values()));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor RMM Corporativo rodando na porta ${PORT}`));
