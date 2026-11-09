const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 8000;
const AGENT_SECRET_TOKEN = 'CST_SECRET_AGENT_TOKEN_2026';
const ADMIN_SECRET_TOKEN = 'CST_ADMIN_TOKEN_97WESLEY';
const TIMEZONE_BR = 'America/Sao_Paulo';

app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-agent-token, x-admin-token');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

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
        return res.status(403).json({ sucesso: false, mensagem: 'Acesso restrito à equipe de TI.' });
    }
    
    res.json({ 
        sucesso: true, 
        tipo: isTI ? 'admin' : 'usuario', 
        usuario: cleanUser,
        isTI: isTI,
        adminToken: isTI ? ADMIN_SECRET_TOKEN : null 
    });
});

// Recebimento de Telemetria
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
    const novoLog = `[${logHora}] Apps: ${appsAbertos} | Telemetria OK.`;
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
    
    res.json({ 
        meu_ip: clientIp, 
        estacoes: todasEstacoes,
        hora_servidor: new Date().toLocaleTimeString('pt-BR', { timeZone: TIMEZONE_BR })
    });
});

// Telefonia net2phone com Oscilação em Tempo Real
app.get('/api/v1/telefonia-metrics', (req, res) => {
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { timeZone: TIMEZONE_BR });
    
    // Gerador de oscilação em tempo real para tráfego e latência
    const rxVar = (11.5 + Math.random() * 2.5).toFixed(1);
    const txVar = (7.8 + Math.random() * 2.2).toFixed(1);

    const ramaisData = [
        { ramal: '001', nome: 'Financeiro', ip: '192.168.10.101', mac: 'BC:A4:E1:01:23:45', status: 'Online', sip: 'Registrado', latencia: Math.floor(2 + Math.random() * 3), setor: 'Financeiro' },
        { ramal: '002', nome: 'Recepção Main', ip: '192.168.10.102', mac: 'BC:A4:E1:01:23:46', status: 'Online', sip: 'Registrado', latencia: Math.floor(2 + Math.random() * 4), setor: 'Recepção' },
        { ramal: '003', nome: 'Coordenação Médica', ip: '192.168.10.103', mac: 'BC:A4:E1:01:23:47', status: 'Online', sip: 'Registrado', latencia: Math.floor(3 + Math.random() * 2), setor: 'Coordenação' },
        { ramal: '004', nome: 'Comercial 01', ip: '192.168.10.104', mac: 'BC:A4:E1:01:23:48', status: 'Online', sip: 'Registrado', latencia: Math.floor(4 + Math.random() * 3), setor: 'Comercial' },
        { ramal: '005', nome: 'Suporte TI', ip: '192.168.10.105', mac: 'BC:A4:E1:01:23:49', status: 'Online', sip: 'Registrado', latencia: Math.floor(4 + Math.random() * 2), setor: 'TI' },
        { ramal: '006', nome: 'Exames / Laudos', ip: '192.168.10.106', mac: 'BC:A4:E1:01:23:50', status: 'Offline', sip: 'Não Registrado', latencia: 0, setor: 'Outros' },
        { ramal: '007', nome: 'Call Center 01', ip: '192.168.10.107', mac: 'BC:A4:E1:01:23:51', status: 'Online', sip: 'Registrado', latencia: Math.floor(6 + Math.random() * 4), setor: 'Comercial' },
        { ramal: '008', nome: 'Call Center 02', ip: '192.168.10.108', mac: 'BC:A4:E1:01:23:52', status: 'Sem SIP', sip: 'Falha Auth', latencia: Math.floor(14 + Math.random() * 5), setor: 'Comercial' },
        { ramal: '009', nome: 'Faturamento', ip: '192.168.10.109', mac: 'BC:A4:E1:01:23:53', status: 'Online', sip: 'Registrado', latencia: Math.floor(3 + Math.random() * 3), setor: 'Financeiro' },
        { ramal: '010', nome: 'Diretoria', ip: '192.168.10.110', mac: 'BC:A4:E1:01:23:54', status: 'Offline', sip: 'Não Registrado', latencia: 0, setor: 'Outros' }
    ];

    res.json({
        provedor: 'net2phone Cloud PABX',
        totalRamais: 50,
        ramaisOnline: 47,
        ramaisOffline: 3,
        semRegistroSip: 1,
        disponibilidadeGeral: 94.0,
        trafegoRxMbps: rxVar,
        trafegoTxMbps: txVar,
        uptimeDias: 15,
        horaAtualizacao: horaAtual,
        ramais: ramaisData,
        eventosRecentes: [
            { hora: horaAtual, evento: `Sincronização PABX OK (RX: ${rxVar} Mbps / TX: ${txVar} Mbps)`, status: 'Informativo' },
            { hora: '14:35:12', evento: 'Ramal 008 apresentou falha no registro SIP', status: 'Atenção' },
            { hora: '13:50:04', evento: 'Ramal 006 desconectado (Offline)', status: 'Crítico' }
        ]
    });
});

// Modos BI e Exportações CSV
app.get('/api/v1/export/bi-json', (req, res) => {
    const estacoes = [];
    const agora = Date.now();
    for (const info of estacoesRegistradas.values()) {
        const decorridoSegundos = Math.floor((agora - info.ultima_atualizacao) / 1000);
        estacoes.push({ ...info, status: decorridoSegundos < 45 ? 'Online' : 'Offline' });
    }
    res.json({
        empresa: 'GRUPOCST/TI',
        geradoEm: new Date().toLocaleString('pt-BR', { timeZone: TIMEZONE_BR }),
        metricasRmm: { totalComputadores: estacoes.length, estacoes },
        metricasTelefonia: { provedor: 'net2phone Cloud', totalRamais: 50, online: 47, offline: 3 }
    });
});

app.get('/api/v1/export/rmm-csv', (req, res) => {
    let csv = 'Hostname;Usuario;Setor;Status;CPU_Percent;RAM_Percent;Disco_Percent;IP;UltimaConexao\n';
    const agora = Date.now();
    for (const info of estacoesRegistradas.values()) {
        const isOnline = Math.floor((agora - info.ultima_atualizacao) / 1000) < 45;
        csv += `${info.hostname};${info.usuario};${info.setor};${isOnline ? 'Online' : 'Offline'};${info.cpu}%;${info.ram}%;${info.disco}%;${info.ip};${info.data_ultima_conexao}\n`;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_rmm_cst.csv');
    res.send('\uFEFF' + csv);
});

app.get('/api/v1/export/telefonia-csv', (req, res) => {
    let csv = 'Ramal;Nome_Colaborador;Setor;Status;Registro_SIP;IP_Local;MAC;Latencia_ms\n';
    const ramais = [
        { ramal: '001', nome: 'Financeiro', setor: 'Financeiro', status: 'Online', sip: 'Registrado', ip: '192.168.10.101', mac: 'BC:A4:E1:01:23:45', latencia: 2 },
        { ramal: '002', nome: 'Recepção Main', setor: 'Recepção', status: 'Online', sip: 'Registrado', ip: '192.168.10.102', mac: 'BC:A4:E1:01:23:46', latencia: 3 },
        { ramal: '003', nome: 'Coordenação Médica', setor: 'Coordenação', status: 'Online', sip: 'Registrado', ip: '192.168.10.103', mac: 'BC:A4:E1:01:23:47', latencia: 3 }
    ];
    ramais.forEach(r => { csv += `${r.ramal};${r.nome};${r.setor};${r.status};${r.sip};${r.ip};${r.mac};${r.latencia}ms\n`; });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_telefonia_net2phone.csv');
    res.send('\uFEFF' + csv);
});

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

app.post('/api/v1/executar-acao', (req, res) => {
    const { target, acao, parametros } = req.body;
    const hostKey = (target || '').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
    if (!ACOES_PERMITIDAS.includes(acao)) return res.status(400).json({ status: 'erro', mensagem: 'Ação não permitida.' });

    const paramsSanitizados = {};
    if (parametros && parametros.nome) paramsSanitizados.nome = String(parametros.nome).replace(/[^a-zA-Z0-9_-]/g, '');

    if (!comandosPendentes.has(hostKey)) comandosPendentes.set(hostKey, []);
    comandosPendentes.get(hostKey).push({ acao, parametros: paramsSanitizados });
    
    if (estacoesRegistradas.has(hostKey)) {
        const est = estacoesRegistradas.get(hostKey);
        const horaAcao = new Date().toLocaleTimeString('pt-BR', { timeZone: TIMEZONE_BR });
        est.logs = [`[${horaAcao}] AÇÃO SOLICITADA: ${acao.toUpperCase()}`, ...(est.logs || [])].slice(0, 30);
    }
    res.json({ status: 'sucesso', mensagem: 'Comando agendado.' });
});

app.get('/api/v1/pendencias/:hostname', (req, res) => {
    const tokenAgente = req.headers['x-agent-token'];
    if (tokenAgente !== AGENT_SECRET_TOKEN) return res.status(401).json({ erro: 'Não autorizado.' });
    const hostKey = req.params.hostname.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
    const tarefas = comandosPendentes.get(hostKey) || [];
    comandosPendentes.delete(hostKey);
    res.json({ tarefas });
});

app.listen(PORT, () => console.log(`[CST TI] Servidor RMM com Telefonia net2phone na porta ${PORT}`));
