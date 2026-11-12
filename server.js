// Adicione um mecanismo de timeout na rota POST /login
app.post('/login', (req, res) => {
    const { username, password, perfil } = req.body;
    const usernameClean = username.trim();
    const userPrincipalName = usernameClean.includes('@') ? usernameClean : `${usernameClean}@cst.local`;

    const ad = new ActiveDirectory(adConfig);

    let responded = false;
    const timer = setTimeout(() => {
        if (!responded) {
            responded = true;
            return res.render('login', { erro: 'Tempo limite excedido ao contactar o Active Directory da CST.' });
        }
    }, 5000); // 5 segundos de limite

    ad.authenticate(userPrincipalName, password, function(err, auth) {
        if (responded) return;
        responded = true;
        clearTimeout(timer);

        if (err || !auth) {
            return res.render('login', { erro: 'Falha na autenticação do Active Directory. Usuário ou senha incorretos.' });
        }

        // Se autenticou com sucesso...
        const isAdmin = administradoresTI.includes(usernameClean.toLowerCase());
        if (perfil === 'admin' && !isAdmin) {
            return res.render('login', { erro: 'Acesso negado: sua conta não possui privilégios de Administrador TI.' });
        }

        req.session.user = {
            login: usernameClean,
            admin: perfil === 'admin' && isAdmin
        };

        return res.redirect(req.session.user.admin ? '/admin' : '/');
    });
});
