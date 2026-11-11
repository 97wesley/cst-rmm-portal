const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Aumenta o limite do body para suportar fotos em Base64 da câmera
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

// --- LEITURA / SALVAMENTO DO BANCO DE DADOS LOCAL ---
function carregarEstacoes() {
    if (fs.existsSync(DB_ESTACOES)) {
        try { return new Map(JSON.parse(fs.readFileSync(DB_ESTACOES, 'utf8'))); } catch (e) {}
    }
    return new Map([
        ["GC-M08-PC0085", { hostname: "GC-M08-PC0085", entidade: "Entidade raiz > CST", usuario: "wesley.lima@CST", tipo: "Desktop", remoto: "rustdesk", rustdesk_id: "1382626814", versao_agente: "1.21", processador: "AMD Ryzen 3 3200G", ram_total: "16 GB", ip: "192.168.56.1", cpu: 41, ram: 80.1, disco: 89.6, ultimaVez: new Date().toISOString() }],
        ["CS-M02-PC0025", { hostname: "CS-M02-PC0025", entidade: "Entidade raiz > CST", usuario: "pamela.araujo@CST", tipo: "Desktop", remoto: "rustdesk", rustdesk_id: "1211199845", versao_agente: "1.21", processador: "Intel Core i3-8100", ram_total: "8 GB", ip: "192.168.111.86", cpu: 15, ram: 38.0, disco: 45.2, ultimaVez: new Date(Date.now() - 600000).toISOString() }]
    ]);
}

function carregarAtivos() {
    if (fs.existsSync(DB_ATIVOS)) {
        try { return JSON.parse(fs.readFileSync(DB_ATIVOS, 'utf8')); } catch (e) {}
    }
    return [
        { id: 1, tipo: "Computador", patrimonio: "PAT-2026-001", nome: "GC-M08-PC0085", usuario: "wesley.lima", setor: "TI", foto: "", data: "10/11/2026" },
        { id: 2, tipo: "Monitor", patrimonio: "PAT-2026-002", nome: "Monitor Dell 24", usuario: "wesley.lima", setor: "TI", foto: "", data: "10/11/2026" }
    ];
}

const estacoesRegistradas = carregarEstacoes();
let inventarioAtivos = carregarAtivos();
const comandosPendentes = new Map();

function salvarAtivos() {
    try { fs.writeFileSync(DB_ATIVOS, JSON.stringify(inventarioAtivos, null, 2)); } catch (e) {}
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
        estacoes: Array.from(estacoesRegistradas.values()),
        ativos: inventarioAtivos
    });
});

// API de Cadastro de Ativo com Foto e Patrimônio
app.post('/api/v1/ativos', (req, res) => {
    const { tipo, patrimonio, nome, usuario, setor, foto } = req.body;
    if (!tipo || !nome) return res.status(400).json({ erro: "Tipo e Nome são obrigatórios." });

    const novoAtivo = {
        id: Date.now(),
        tipo,
        patrimonio: patrimonio || "N/A",
        nome,
        usuario: usuario || "Não atribuído",
        setor: setor || "Geral",
        foto: foto || "",
        data: new Date().toLocaleDateString('pt-BR')
    };

    inventarioAtivos.push(novoAtivo);
    salvarAtivos();
    res.json({ status: "sucesso", ativo: novoAtivo });
});

app.get('/api/v1/ativos', (req, res) => res.json(inventarioAtivos));

// API para exportar relatório CSV
app.get('/api/v1/exportar-csv', (req, res) => {
    let csv = 'ID;Tipo;Patrimonio;Nome;Usuario;Setor;DataCadastro\n';
    inventarioAtivos.forEach(a => {
        csv += `${a.id};${a.tipo};${a.patrimonio};${a.nome};${a.usuario};${a.setor};${a.data}\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=inventario_cst_ti.csv');
    res.status(200).send(csv);
});

// Telemetria RMM
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
