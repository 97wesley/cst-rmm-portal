const express = require('express');
const session = require('express-session');
const path = require('path');
const ActiveDirectory = require('activedirectory2');
const { exec } = require('child_process');

const app = express();

// Configuração do motor de views (EJS) apontando para a pasta real "views"
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares para leitura de formulários e sessões
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'cst_rmm_portal_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Configuração do Active Directory da CST
const adConfig = {
    url: 'ldap://192.168.102.1',
    baseDN: 'DC=CST,DC=LOCAL'
};

// Lista de utilizadores administradores de TI autorizados
const administradoresTI = ['wesley.lima', 'romulo.evangelista', 'rafael.silva'];

// Middleware de autenticação para proteger as rotas
function autenticar(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

// ==========================================
// ROTAS DA APLICAÇÃO
// ==========================================

// Página de Login (GET)
app.get('/login', (req, res) => {
    res.render('login', { erro: null });
});

// Processamento do Login (POST - Active Directory)
app.post('/login', (req, res) => {
    const { username, password, perfil } = req.body;

    const usernameClean = (username || '').trim();
    const userPrincipalName = usernameClean.includes('@') ? usernameClean : `${usernameClean}@cst.local`;

    const ad = new ActiveDirectory(adConfig);

    // Timeout de 5 segundos para evitar que a página fique a carregar infinitamente
    let respondeu = false;
    const timeoutConexao = setTimeout(() => {
        if (!respondeu) {
            respondeu = true;
            return res.render('login', {
                erro: 'Tempo limite excedido: não foi possível contactar o Active Directory (192.168.102.1).'
            });
        }
    }, 5000);

    ad.authenticate(userPrincipalName, password, function(err, auth) {
        if (respondeu) return;
        respondeu = true;
        clearTimeout(timeoutConexao);

        if (err || !auth) {
            console.error('Erro LDAP:', err);
            return res.render('login', {
                erro: 'Falha na autenticação do Active Directory. Utilizador ou palavra-passe incorretos.'
            });
        }

        const isAdmin = administradoresTI.includes(usernameClean.toLowerCase());

        if (perfil === 'admin' && !isAdmin) {
            return res.render('login', {
                erro: 'Acesso negado: a sua conta não possui privilégios de Administrador TI.'
            });
        }

        req.session.user = {
            login: usernameClean,
            admin: perfil === 'admin' && isAdmin
        };

        if (req.session.user.admin) {
            return res.redirect('/admin');
        } else {
            return res.redirect('/');
        }
    });
});

// Rota Raiz (/): Painel do Colaborador (Autoatendimento)
app.get('/', autenticar, (req, res) => {
    if (req.session.user.admin && req.query.view !== 'colaborador') {
        return res.redirect('/admin');
    }
    res.render('colaborador', { usuario: req.session.user });
});

// Rota do Painel Administrativo de TI
app.get('/admin', autenticar, (req, res) => {
    if (!req.session.user.admin) {
        return res.redirect('/');
    }
    res.render('admin-dashboard', { usuario: req.session.user });
});

// Rota para executar os scripts de reparo via PowerShell
app.post('/executar-reparo', autenticar, (req, res) => {
    const { acao } = req.body;

    const acoesPermitidas = ['limpar_cache', 'destravar_impressora'];
    if (!acoesPermitidas.includes(acao)) {
        return res.status(400).json({ sucesso: false, erro: 'Ação inválida.' });
    }

    const caminhoScript = path.join(__dirname, 'scripts', 'reparos.ps1');
    const comando = `powershell -ExecutionPolicy Bypass -File "${caminhoScript}" -Acao ${acao}`;

    exec(comando, (error, stdout) => {
        if (error) {
            console.error(`Erro PowerShell: ${error.message}`);
            return res.json({ sucesso: false, erro: 'Falha ao executar o script de reparo.' });
        }
        res.json({ sucesso: true, mensagem: stdout.trim() });
    });
});

// Terminar sessão
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Inicialização do Servidor
const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CST TI] Servidor rodando na porta ${PORT}`);
});
