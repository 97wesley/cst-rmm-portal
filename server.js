const express = require('express');
const session = require('express-session');
const path = require('path');
const ActiveDirectory = require('activedirectory2');
const { exec } = require('child_process');

const app = express();

// Configuração do motor de views (EJS) apontando para a sua pasta "vistas"
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'vistas'));

// Middlewares para leitura de formulários e sessões
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'cst_rmm_portal_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Para o Render gratuito (sem HTTPS forçado no teste)
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

// Processamento do Login (POST - Active Directory)
app.post('/login', (req, res) => {
    const { username, password, perfil } = req.body;
    
    const usernameClean = username.trim();
    const userPrincipalName = usernameClean.includes('@') ? usernameClean : `${usernameClean}@cst.local`;

    const ad = new ActiveDirectory(adConfig);

    // SISTEMA DE TIMEOUT: Evita que a página fique rodando infinitamente
    let respondeu = false;
    const timeoutConexao = setTimeout(() => {
        if (!respondeu) {
            respondeu = true;
            return res.render('login', { erro: 'Erro: O servidor na nuvem (Render) não conseguiu acessar o AD local (192.168.102.1).' });
        }
    }, 5000); // Aguarda 5 segundos no máximo

    // Tenta autenticar no AD
    ad.authenticate(userPrincipalName, password, function(err, auth) {
        if (respondeu) return; // Se o timeout já disparou, não faz nada
        respondeu = true;
        clearTimeout(timeoutConexao);

        if (err || !auth) {
            console.error('Erro LDAP:', err);
            return res.render('login', { erro: 'Falha na autenticação do Active Directory. Usuário ou senha incorretos.' });
        }

        // Se autenticou com sucesso
        const isAdmin = administradoresTI.includes(usernameClean.toLowerCase());

        // Se selecionou Admin mas não está na lista de TI
        if (perfil === 'admin' && !isAdmin) {
            return res.render('login', { erro: 'Acesso negado: sua conta não possui privilégios de Administrador.' });
        }

        // Cria a sessão
        req.session.user = {
            login: usernameClean,
            admin: perfil === 'admin' && isAdmin
        };

        // Redireciona para o painel correto
        if (req.session.user.admin) {
            return res.redirect('/admin');
        } else {
            return res.redirect('/');
        }
    });
});

// Rota Raiz (/): Painel do Colaborador
app.get('/', autenticar, (req, res) => {
    if (req.session.user.admin && req.query.view !== 'colaborador') {
        return res.redirect('/admin');
    }
    // Renderiza o arquivo vistas/colaborador.ejs
    res.render('colaborador', { usuario: req.session.user });
});

// Rota do Painel Administrativo de TI
app.get('/admin', autenticar, (req, res) => {
    if (!req.session.user.admin) {
        return res.redirect('/');
    }
    // Renderiza o arquivo vistas/admin-dashboard.ejs
    res.render('admin-dashboard', { usuario: req.session.user });
});

// Rota para executar os scripts de reparo via PowerShell
app.post('/executar-reparo', autenticar, (req, res) => {
    const { acao } = req.body;
    
    const acoesPermitidas = ['limpar_cache', 'destravar_impressora'];
    if (!acoesPermitidas.includes(acao)) {
        return res.status(400).json({ sucesso: false, erro: 'Ação inválida.' });
    }

    // Apontando para a sua pasta "roteiros" e arquivo "reparos.ps1"
    const caminhoScript = path.join(__dirname, 'roteiros', 'reparos.ps1');
    const comando = `powershell -ExecutionPolicy Bypass -File "${caminhoScript}" -Acao ${acao}`;

    exec(comando, (error, stdout, stderr) => {
        if (error) {
            console.error(`Erro PowerShell: ${error.message}`);
            return res.json({ sucesso: false, erro: 'Falha ao executar o script de reparo.' });
        }
        res.json({ sucesso: true, mensagem: stdout.trim() });
    });
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
    console.log(`[CST TI] Servidor rodando na porta ${PORT}`);
});
