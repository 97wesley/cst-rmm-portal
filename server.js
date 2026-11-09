const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 8000;
const AGENT_SECRET_TOKEN = 'CST_SECRET_AGENT_TOKEN_2026';
const ADMIN_SECRET_TOKEN = 'CST_ADMIN_TOKEN_97WESLEY';
const NET2PHONE_API_KEY = 'qXQhZL5J4+pT3S3Mtbd4VAqmXO+UGPXpJ8gyoMj0hwr6s5FT87qQXFzcpUOZ83IYwFBoPSfs2mhYN0Uhnbp7Ig==';
const TIMEZONE_BR = 'America/Sao_Paulo';

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const estacoesRegistradas = new Map();
const comandosPendentes = new Map();

const EQUIPE_TI = ['wesley.lima', 'rafael.silva', 'romulo.evangelista'];

const ACOES_PERMITIDAS = [
    'limpar_cache',
    'destravar_impressora',
    'criar_pasta',
    'otimizar_rede',
    'atualizar_gpo',
    'otimizar_disco'
];

app.get('/', (req, res) => {
    const publicPath = path.join(__dirname, 'public', 'index.html');
    const rootPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(publicPath)) res.sendFile(publicPath);
    else if (fs.existsSync(rootPath)) res.sendFile(rootPath);
    else res.send('<h2>Servidor RMM CST Online</h2>');
});

// Autenticação de Login
app.post('/api/v1/login', (req, res) => {
    const { usuario, senha, tipo } = req.body;
    const cleanUser = (usuario || '').trim().toLowerCase();
    
    if (!cleanUser || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: 'Preencha o utilizador e a senha.' });
    }
    
    const isTI = EQUIPE_TI.includes(cleanUser);
    if (tipo === 'admin' && !isTI) {
        return res.status(403).json({ sucesso: false, mensagem: 'Acesso restrito à equipa de TI.' });
    }
    
    res.json({ 
        sucesso: true, 
        tipo: isTI ? 'admin' : 'usuario', 
        usuario: cleanUser,
        isTI: isTI,
        adminToken: isTI ? ADMIN_SECRET_TOKEN : null 
    });
});

// Telemetria das Estações
app.post('/api/v1/telemetria', (req, res) => {
    const tokenAgente = req.headers['x-agent-token'];
    if (tokenAgente !== AGENT_SECRET_TOKEN) {
        return res.status(401).json({ erro: 'Token de agente inválido.' });
    }

    const data = req.body;
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
    const hostKey = (data.hostname || 'DESCONHECIDO').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
    
    const estacaoAnterior = estacoesRegistradas.get(hostKey) || {};
    const logHora = new Date().toLocaleTimeString('pt-BR', { timeZone: TIMEZONE_BR });
    const dataHoraConexao = new Date().toLocaleString('pt-BR', { timeZone: TIMEZONE_BR });
    
    const appsAbertos = Array.isArray(data.aplicativos_ativos) && data.aplicativos_ativos.length > 0
        ? data.aplicativos_ativos.join(', ')
        : 'Nenhum software com janela ativa';

    const logsAnteriores = estacaoAnterior.logs || [];
    const novoLog = `[${logHora}] Apps ativos: ${appsAbertos} | Telemetria OK.`;
    const logsAtualizados = [novoLog, ...logsAnteriores].slice(0, 30);

    estacoesRegistradas.set(hostKey, {
        hostname: hostKey,
        usuario: (data.usuario || 'Utilizador').toLowerCase().trim(),
        setor: data.setor || estacaoAnterior.setor || 'Atendimento / Geral',
        ip: data.ip_local || clientIp,
        cpu: Math.min(100, Math.max(0, parseFloat(data.cpu_uso_percent || 0))),
        ram: Math.min(100, Math.max(0, parseFloat(data.ram_uso_percent || 0))),
        disco: Math.min(100, Math.max(0, parseFloat(data.disco_uso_percent || 0))),
        so: data.sistema_operacional || 'Windows',
        uptime: data.uptime || 'Sincronizado',
        aplicativos_ativos: data.aplicativos_ativos || [],
        ultima_atualizacao: Date.now(),
        data_ultima_conexao: dataHoraConexao,
        logs: logsAtualizados
    });
    
    res.json({ status: 'ok' });
});

// Métricas RMM
app.get('/api/v1/rmm-metrics', (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
    const todasEstacoes = [];
    const agora = Date.now();
    
    for (const info of estacoesRegistradas.values()) {
        const decorridoSegundos = Math.floor((agora - info.ultima_atualizacao) / 1000);
        const isOnline = decorridoSegundos < 45;
        
        todasEstacoes.push({
            ...info,
            status: isOnline ? 'Online' : 'Offline',
            visto_ha: isOnline ? 'Agora' : `Há ${decorridoSegundos}s`
        });
    }
    
    res.json({ meu_ip: clientIp, estacoes: todasEstacoes });
});

// API de Telefonia IP (net2phone Dashboard)
app.get('/api/v1/telefonia-metrics', async (req, res) => {
    const tokenAdmin = req.headers['x-admin-token'];
    
    // Lista de Ramais PABX Nuvem (net2phone)
    const ramaisSimulados = [
        { ramal: '001', nome: 'Financeiro', ip: '192.168.10.101', mac: 'BC:A4:E1:01:23:45', status: 'Online', sip: 'Registrado', latencia: 2, setor: 'Financeiro' },
        { ramal: '002', nome: 'Recepção Main', ip: '192.168.10.102', mac: 'BC:A4:E1:01:23:46', status: 'Online', sip: 'Registrado', latencia: 3, setor: 'Recepção' },
        { ramal: '003', nome: 'Coordenação Médica', ip: '192.168.10.103', mac: 'BC:A4:E1:01:23:47', status: 'Online', sip: 'Registrado', latencia: 3, setor: 'Coordenação' },
        { ramal: '004', nome: 'Comercial 01', ip: '192.168.10.104', mac: 'BC:A4:E1:01:23:48', status: 'Online', sip: 'Registrado', latencia: 4, setor: 'Comercial' },
        { ramal: '005', nome: 'Suporte TI', ip: '192.168.10.105', mac: 'BC:A4:E1:01:23:49', status: 'Online', sip: 'Registrado', latencia: 5, setor: 'TI' },
        { ramal: '006', nome: 'Exames / Laudos', ip: '192.168.10.106', mac: 'BC:A4:E1:01:23:50', status: 'Offline', sip: 'Não Registrado', latencia: 0, setor: 'Outros' },
        { ramal: '007', nome: 'Call Center 01', ip: '192.168.10.107', mac: 'BC:A4:E1:01:23:51', status: 'Online', sip: 'Registrado', latencia: 7, setor: 'Comercial' },
        { ramal: '008', nome: 'Call Center 02', ip: '192.168.10.108', mac: 'BC:A4:E1:01:23:52', status: 'Sem SIP', sip: 'Falha Auth', latencia: 15, setor: 'Comercial' },
        { ramal: '009', nome: 'Faturamento', ip: '192.168.10.109', mac: 'BC:A4:E1:01:23:53', status: 'Online', sip: 'Registrado', latencia: 4, setor: 'Financeiro' },
        { ramal: '010', nome: 'Diretoria', ip: '192.168.10.110', mac: 'BC:A4:E1:01:23:54', status: 'Offline', sip: 'Não Registrado', latencia: 0, setor: 'Outros' }
    ];

    res.json({
        provedor: 'net2phone Cloud PABX',
        apiKeyAtiva: true,
        totalRamais: 50,
        ramaisOnline: 47,
        ramaisOffline: 3,
        semRegistroSip: 1,
        disponibilidadeGeral: 94.0,
        trafegoRxMbps: 12.4,
        trafegoTxMbps: 8.7,
        uptimeDias: 15,
        ramais: ramaisSimulados,
        eventosRecentes: [
            { hora: '14:35:12', evento: 'Ramal 008 apresentou falha no registro SIP', status: 'Atenção' },
            { hora: '13:50:04', evento: 'Ramal 006 desconectado (Offline)', status: 'Crítico' },
            { hora: '12:15:22', evento: 'Ramal 005 (TI) registado com sucesso', status: 'Informativo' }
        ]
    });
});

// Alterar Setor
app.post('/api/v1/definir-setor', (req, res) => {
    const { hostname, setor } = req.body;
    const hostKey = (hostname || '').toUpperCase().trim();
    if (estacoesRegistradas.has(hostKey)) {
        const est = estacoesRegistradas.get(hostKey);
        est.setor = setor || 'Geral';
        estacoesRegistradas.set(hostKey, est);
        return res.json({ status: 'sucesso', setor: est.setor });
    }
    res.status(404).json({ status: 'erro', mensagem: 'Estação não encontrada.' });
});

// Execução de Ações Remotas
app.post('/api/v1/executar-acao', (req, res) => {
    const { target, acao, parametros } = req.body;
    const hostKey = (target || '').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');

    if (!ACOES_PERMITIDAS.includes(acao)) {
        return res.status(400).json({ status: 'erro', mensagem: 'Ação não permitida.' });
    }

    const paramsSanitizados = {};
    if (parametros && parametros.nome) {
        paramsSanitizados.nome = String(parametros.nome).replace(/[^a-zA-Z0-9_-]/g, '');
    }

    if (!comandosPendentes.has(hostKey)) {
        comandosPendentes.set(hostKey, []);
    }
    
    comandosPendentes.get(hostKey).push({ acao, parametros: paramsSanitizados });
    
    if (estacoesRegistradas.has(hostKey)) {
        const est = estacoesRegistradas.get(hostKey);
        const horaAcao = new Date().toLocaleTimeString('pt-BR', { timeZone: TIMEZONE_BR });
        const logAcao = `[${horaAcao}] AÇÃO SOLICITADA: ${acao.toUpperCase()}`;
        est.logs = [logAcao, ...(est.logs || [])].slice(0, 30);
    }

    res.json({ status: 'sucesso', mensagem: 'Comando agendado.' });
});

// Agente Polling
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
    console.log(`[CST TI] Servidor RMM com Telefonia net2phone ativo na porta ${PORT}`);
});
