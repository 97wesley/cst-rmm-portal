const express = require('express');
const session = require('express-session');
const path = require('path');
const ActiveDirectory = require('activedirectory2');

const app = express();

// Configuração do motor de views (EJS)
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
    cookie: { secure: false } // Defina como true se usar HTTPS em produção
}));

// Configuração do Active Directory da CST
const adConfig = {
    url: 'ldap://192.168.102.1',
    baseDN: 'DC=CST,DC=LOCAL'
};

// Lista de usuários administradores de TI autorizados
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

// ==========================================
// ROTAS DA APLICAÇÃO
// ==========================================

// Página de Login (GET)
app.get('/login', (req, res) => {
    res.render('login', { erro: null });
});

// Processamento do Login (POST - Active Directory)
app.post('/login', (req, res) => {
    // ... (todo o código de autenticação do AD que já criamos) ...
});

// Rota Raiz (/): Painel do Colaborador
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
    res.send(`<h1>Painel Administrativo RMM - CST</h1><p>Bem-vindo, ${req.session.user.login}</p><a href="/logout">Sair</a>`);
});

// ==========================================
// 📍 COLOQUE A ETAPA 2 EXATAMENTE AQUI:
// ==========================================
const { exec } = require('child_process');

// Rota para executar os scripts de reparo via PowerShell
app.post('/executar-reparo', autenticar, (req, res) => {
    const { acao } = req.body;
    
    const acoesPermitidas = ['limpar_cache', 'destravar_impressora'];
    if (!acoesPermitidas.includes(acao)) {
        return res.status(400).json({ sucesso: false, erro: 'Ação inválida.' });
    }

    const comando = `powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, 'scripts', 'reparos.ps1')}" -Acao ${acao}`;

    exec(comando, (error, stdout, stderr) => {
        if (error) {
            console.error(`Erro ao executar PowerShell: ${error.message}`);
            return res.json({ sucesso: false, erro: 'Falha ao executar o script de reparo.' });
        }
        res.json({ sucesso: true, mensagem: stdout.trim() });
    });
});
// ==========================================

// Logout da sessão
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Inicialização do Servidor (FINAL DO ARQUIVO)
const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CST TI] Servidor rodando em http://0.0.0.0:${PORT}`);
});


// Processamento do Login (POST - Active Directory)
app.post('/login', (req, res) => {
    const { username, password, perfil } = req.body;
    
    // Normaliza o usuário (remove espaços e garante formato de login)
    const usernameClean = username.trim();
    const userPrincipalName = usernameClean.includes('@') ? usernameClean : `${usernameClean}@cst.local`;

    const ad = new ActiveDirectory(adConfig);

    ad.authenticate(userPrincipalName, password, function(err, auth) {
        if (err) {
            console.error('Erro LDAP:', err);
            return res.render('login', { erro: 'Erro de comunicação com o Active Directory.' });
        }

        if (auth) {
            // Autenticação bem-sucedida no AD
            const isAdmin = administradoresTI.includes(usernameClean.toLowerCase());

            // Se selecionou Admin mas não está na lista de TI, barra o acesso
            if (perfil === 'admin' && !isAdmin) {
                return res.render('login', { erro: 'Acesso negado: sua conta não possui privilégios de Administrador TI.' });
            }

            // Cria a sessão do usuário
            req.session.user = {
                login: usernameClean,
                admin: perfil === 'admin' && isAdmin
            };

            // Redireciona conforme o perfil
            if (req.session.user.admin) {
                return res.redirect('/admin');
            } else {
                return res.redirect('/');
            }
        } else {
            return res.render('login', { erro: 'Falha na autenticação do Active Directory. Usuário ou senha incorretos.' });
        }
    });
});

// Rota Raiz (/): Painel do Colaborador (Autoatendimento e Ferramentas)
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
    // Aqui você pode renderizar a sua view de administração existente (ex: admin.ejs ou painel RMM)
    res.send(`<h1>Painel Administrativo RMM - CST</h1><p>Bem-vindo, ${req.session.user.login}</p><a href="/logout">Sair</a>`);
});

// Logout da sessão
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Inicialização do Servidor
const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CST TI] Servidor rodando em http://0.0.0.0:${PORT}`);
});
