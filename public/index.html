const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 8000;

// Tokens Secretos de Segurança (Hardening)
const AGENT_SECRET_TOKEN = 'CST_SECRET_AGENT_TOKEN_2026';
const ADMIN_SECRET_TOKEN = 'CST_ADMIN_TOKEN_97WESLEY';

app.use(express.json({ limit: '10kb' })); // Limita tamanho de payload para prevenir DoS
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const estacoesRegistradas = new Map();
const comandosPendentes = new Map();
const EQUIPE_TI = ['wesley.lima', 'rafael.silva', 'romulo.evangelista'];

// Whitelist Estrita de Ações Permitidas no Windows (Previne RCE)
const ACOES_PERMITIDAS = [
    'limpar_cache',
    'destravar_impressora',
    'criar_pasta',
    'otimizar_rede',
    'atualizar_gpo',
    'otimizar_disco'
];

// Rota Raiz (Interface Web)
app.get('/', (req, res) => {
    const publicPath = path.join(__dirname, 'public', 'index.html');
    const rootPath = path.join(__dirname, 'index.html');
    
    if (fs.existsSync(publicPath)) {
        res.sendFile(publicPath);
    } else if (fs.existsSync(rootPath)) {
        res.sendFile(rootPath);
    } else {
        res.send('<h2>Servidor RMM Online</h2><p>Ficheiro index.html não foi localizado.</p>');
    }
});

// Autenticação de Login Web
app.post('/api/v1/login', (req, res) => {
    const { usuario, senha, tipo } = req.body;
    const cleanUser = (usuario || '').trim().toLowerCase();
    
    if (!cleanUser || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: 'Preencha os dados.' });
    }
    if (tipo === 'admin' && !EQUIPE_TI.includes(cleanUser)) {
        return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado.' });
    }
    
    res.json({ 
        sucesso: true, 
        tipo, 
        usuario: cleanUser,
        adminToken: tipo === 'admin' ? ADMIN_SECRET_TOKEN : null 
    });
});

// Recebimento de Telemetria (Requer Token do Agente)
app.post('/api/v1/telemetria', (req, res) => {
    const tokenAgente = req.headers['x-agent-token'];
    if (tokenAgente !== AGENT_SECRET_TOKEN) {
        return res.status(401).json({ erro: 'Não autorizado. Token de agente inválido.' });
    }

    const data = req.body;
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
    const hostKey = (data.hostname || 'DESCONHECIDO').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
    
    estacoesRegistradas.set(hostKey, {
        hostname: hostKey,
        usuario: (data.usuario || 'Utilizador').toLowerCase().trim(),
        ip: data.ip_local || clientIp,
        cpu: Math.min(100, Math.max(0, parseFloat(data.cpu_uso_percent || 0))),
        ram: Math.min(100, Math.max(0, parseFloat(data.ram_uso_percent || 0))),
        disco: Math.min(100, Math.max(0, parseFloat(data.disco_uso_percent || 0))),
        so: data.sistema_operacional || 'Windows',
        ultima_atualizacao: Date.now()
    });
    
    res.json({ status: 'ok' });
});

// Consulta de Métricas para o Dashboard
app.get('/api/v1/rmm-metrics', (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
    const estacoesAtivas = [];
    
    for (const info of estacoesRegistradas.values()) {
        if (Date.now() - info.ultima_atualizacao < 45000) {
            estacoesAtivas.push(info);
        }
    }
    
    res.json({ meu_ip: clientIp, estacoes: estacoesAtivas });
});

// Agendamento de Ação Remota (Com Sanitização e Whitelist)
app.post('/api/v1/executar-acao', (req, res) => {
    const { target, acao, parametros } = req.body;
    const hostKey = (target || '').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');

    // Validação na Whitelist
    if (!ACOES_PERMITIDAS.includes(acao)) {
        return res.status(400).json({ status: 'erro', mensagem: 'Ação não permitida por política de segurança.' });
    }

    // Sanitização de Parâmetros
    const paramsSanitizados = {};
    if (parametros && parametros.nome) {
        paramsSanitizados.nome = String(parametros.nome).replace(/[^a-zA-Z0-9_-]/g, '');
    }

    if (!comandosPendentes.has(hostKey)) {
        comandosPendentes.set(hostKey, []);
    }
    
    comandosPendentes.get(hostKey).push({ acao, parametros: paramsSanitizados });
    res.json({ status: 'sucesso', mensagem: 'Comando enfileirado com segurança.' });
});

// Pendências para o Agente PowerShell (Requer Token do Agente)
app.get('/api/v1/pendencias/:hostname', (req, res) => {
    const tokenAgente = req.headers['x-agent-token'];
    if (tokenAgente !== AGENT_SECRET_TOKEN) {
        return res.status(401).json({ erro: 'Não autorizado.' });
    }

    const hostKey = req.params.hostname.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
    const tarefas = comandosPendentes.get(hostKey) || [];
    comandosPendentes.delete(hostKey);
    res.json({ tarefas });
});

app.listen(PORT, () => {
    console.log(`[CST TI] Servidor RMM Seguro rodando na porta ${PORT}`);
});
