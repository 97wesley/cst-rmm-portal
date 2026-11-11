// --- CONFIGURAÇÃO DO ACTIVE DIRECTORY DA CST (PRODUÇÃO) ---
const adConfig = {
    url: 'ldap://192.168.102.1', // IP do seu Controlador de Domínio (DC)
    baseDN: 'DC=CST,DC=LOCAL',
    connectTimeout: 5000
};

// --- ROTA POST LOGIN EXCLUSIVA COM AD (PRODUÇÃO) ---
app.post('/login', (req, res) => {
    const { username, password, perfil } = req.body;
    const userClean = (username || '').toLowerCase().trim();
    const userAD = userClean.includes('@') ? userClean : `${userClean}@cst.local`;

    const ad = new ActiveDirectory(adConfig);

    // Faz a chamada ao AD para validar a senha real de rede
    ad.authenticate(userAD, password, (err, auth) => {
        if (err || !auth) {
            return res.render('login', { erro: 'Falha na autenticação do Active Directory. Usuário ou senha incorretos.' });
        }

        if (perfil === 'admin') {
            if (administradoresTI.includes(userClean)) {
                req.session.user = { login: userClean, admin: true };
                return res.redirect('/admin');
            } else {
                return res.render('login', { erro: 'Acesso Negado: Sua conta autenticou no AD, mas não possui privilégios administrativos de TI.' });
            }
        } else {
            req.session.user = { login: userClean, admin: false };
            return res.redirect('/');
        }
    });
});
