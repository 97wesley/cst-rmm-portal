const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'cst-rmm-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 86400000 }
}));

const estacoesRegistradas = new Map();
const comandosPendentes = new Map();

// LISTA DE USUÁRIOS COM PERMISSÃO DE TI
const administradoresTI = ['wesley.lima', 'romulo.evangelista', 'rafael.silva'];

const autenticar = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

app.get('/login', (req, res) => {
    res.render('login', { erro: null });
});

// NOVA LÓGICA DE LOGIN COM VALIDAÇÃO DE PERFIL
app.post('/login', (req, res) => {
    const { username, password, perfil } = req.body;
    const userFormatado = username.toLowerCase().trim();
    
    // Simulação do AD: Enquanto não conectamos ao AD real, a senha para testes é "123"
    if (password !== '123') {
        return res.render('login', { erro: 'Senha incorreta. (Para testes, use a senha: 123)' });
    }

    // Se o usuário tentar entrar como Admin
    if (perfil === 'admin') {
        if (administradoresTI.includes(userFormatado)) {
            req.session.user = { login: userFormatado, admin: true };
            return res.redirect('/admin');
        } else {
            return res.render('login', { erro: 'Acesso Restrito: Seu usuário não faz parte da equipe de TI.' });
        }
    } 
    // Se tentar entrar como Colaborador (Autoatendimento)
    else {
        // Permite que qualquer um (inclusive o TI) entre para ver a tela escura de usuário
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

app.post('/api/v1/telemetria', (req, res) => {
    const { hostname, usuario, ip, cpu, ram, disco } = req.body;
    if (hostname) estacoesRegistradas.set(hostname.toUpperCase(), { hostname: hostname.toUpperCase(), usuario: usuario || 'Desconhecido', ip: ip || '0.0.0.0', cpu: cpu || 0, ram: ram || 0, disco: disco || 0, ultimaVez: new Date() });
    res.json({ status: "ok" });
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

app.get('/api/v1/rmm-metrics', (req, res) => res.json(Array.from(estacoesRegistradas.values())));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor RMM rodando na porta ${PORT}`));
