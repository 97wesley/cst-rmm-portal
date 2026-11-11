const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração de Sessão
app.use(session({
    secret: 'cst-rmm-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 86400000 } // 24 horas
}));

// Banco de Dados em Memória
const estacoesRegistradas = new Map();
const comandosPendentes = new Map();

// Simulação de Usuários (Integração futura com AD)
const usuariosPermitidos = [
    { login: 'wesley.lima', senha: '123', admin: true },
    { login: 'usuario.teste', senha: '123', admin: false }
];

// Middleware de Autenticação
const autenticar = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

// --- ROTAS DA INTERFACE WEB ---

app.get('/login', (req, res) => {
    res.render('login', { erro: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const usuarioValido = usuariosPermitidos.find(u => u.login === username && u.senha === password);
    
    if (usuarioValido) {
        req.session.user = usuarioValido;
        // Direciona para o painel correto dependendo do nível de acesso
        res.redirect(usuarioValido.admin ? '/admin' : '/');
    } else {
        res.render('login', { erro: 'Usuário ou senha incorretos.' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Painel do Usuário Final (Escuro / Self-Service)
app.get('/', autenticar, (req, res) => {
    if (req.session.user.admin) return res.redirect('/admin');
    res.render('user-dashboard', { usuario: req.session.user.login });
});

// Painel do Administrador (Branco / Lista de Máquinas)
app.get('/admin', autenticar, (req, res) => {
    if (!req.session.user.admin) return res.status(403).send("Acesso Negado.");
    res.render('admin-dashboard', { 
        usuario: req.session.user.login,
        estacoes: Array.from(estacoesRegistradas.values()) 
    });
});


// --- APIS DE COMUNICAÇÃO COM O AGENTE POWERSHELL ---

// Recebe telemetria
app.post('/api/v1/telemetria', (req, res) => {
    const { hostname, usuario, ip, cpu, ram, disco } = req.body;
    if (hostname) {
        estacoesRegistradas.set(hostname.toUpperCase(), { 
            hostname: hostname.toUpperCase(), 
            usuario: usuario || 'Desconhecido', 
            ip: ip || '0.0.0.0', 
            cpu: cpu || 0, 
            ram: ram || 0, 
            disco: disco || 0, 
            ultimaVez: new Date() 
        });
    }
    res.json({ status: "ok" });
});

// Enfileira comando
app.post('/api/v1/executar', (req, res) => {
    const target = (req.body.hostname || '').toUpperCase();
    if (!comandosPendentes.has(target)) comandosPendentes.set(target, []);
    comandosPendentes.get(target).push({ acao: req.body.acao });
    res.json({ status: "sucesso" });
});

// Agente busca comandos
app.get('/api/v1/pendencias/:hostname', (req, res) => {
    const target = req.params.hostname.toUpperCase();
    const acoes = comandosPendentes.get(target) || [];
    comandosPendentes.set(target, []);
    res.json({ acoes });
});

// Retorna dados para o frontend via JS
app.get('/api/v1/rmm-metrics', (req, res) => res.json(Array.from(estacoesRegistradas.values())));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor RMM rodando na porta ${PORT}`));
