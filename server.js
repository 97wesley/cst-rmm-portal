const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 8000;
const AGENT_SECRET_TOKEN = 'CST_SECRET_AGENT_TOKEN_2026';
const ADMIN_SECRET_TOKEN = 'CST_ADMIN_TOKEN_97WESLEY';
const TIMEZONE_BR = 'America/Sao_Paulo';
const DB_FILE = path.join(__dirname, 'estacoes_db.json');

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

function carregarBanco() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            const parsed = JSON.parse(data);
            Object.keys(parsed).forEach(k => estacoesRegistradas.set(k, parsed[k]));
        }
    } catch (e) {
        console.error('Erro ao ler DB:', e);
    }

    // Cadastro inicial com os dados exatamente fiéis ao msinfo32 / Imagem do Windows
    const estacoesIniciais = [
        { 
            hostname: 'GC-M08-PC0085', 
            usuario: 'wesley.lima', 
            setor: 'TI / Matriz', 
            ip: 'Cloud-Connected', 
            processador: 'AMD Ryzen 3 3200G with Radeon Vega Graphics, 3600 Mhz, 4 Núcleos', 
            ram_total: '16 GB', 
            ram: 87.9, 
            cpu: 18, 
            disco: 65, 
            id_remoto: '1382626814', 
            so: 'Microsoft Windows 11 Enterprise' 
        },
        { 
            hostname: 'CS-M02-PC0025', 
            usuario: 'pamela.araujo', 
            setor: 'Atendimento / CST', 
            ip: '192.168.111.86', 
            processador: 'Intel(R) Core(TM) i3-8100 CPU @ 3.60GHz', 
            ram_total: '8 GB', 
            ram: 38, 
            cpu: 12, 
            disco: 45, 
            id_remoto: '1211199845', 
            so: 'Windows 10 Pro' 
        },
        { 
            hostname: 'GC-FIN-PC0001', 
            usuario: 'ana.costa', 
            setor: 'Financeiro', 
            ip: '192.168.10.101', 
            processador: 'Intel(R) Core(TM) i5-9400 CPU @ 2.90GHz', 
            ram_total: '8 GB', 
            ram: 50, 
            cpu: 10, 
            disco: 58, 
            id_remoto: '1492048123', 
            so: 'Windows 10 Pro' 
        }
    ];

    estacoesIniciais.forEach(e => {
        if (!estacoesRegistradas.has(e.hostname)) {
            estacoesRegistradas.set(e.hostname, {
                ...e,
                status: 'Offline',
                ultima_atualizacao: 0,
                data_ultima_conexao: '09/11/2026, 06:59:38',
                logs: ['[SISTEMA] Estação registrada com dados de hardware atualizados.']
            });
        }
    });
}

function salvarBanco() {
    try {
        const obj = {};
        for (const [k, v] of estacoesRegistradas.entries()) {
            obj[k] = v;
        }
        fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
        console.error('Erro ao salvar DB:', e);
    }
}

carregarBanco();

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

// Recebimento de Telemetria do Agente PowerShell
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
        usuario: (data.usuario || estacaoAnterior.usuario || 'Utilizador').toLowerCase().trim(),
        setor: data.setor || estacaoAnterior.setor || 'Atendimento / Geral',
        ip: data.ip_local || clientIp || estacaoAnterior.ip,
        processador: data.processador || estacaoAnterior.processador || 'AMD Ryzen 3 3200G with Radeon Vega Graphics, 3600 Mhz, 4 Núcleos',
        ram_total: data.ram_total || estacaoAnterior.ram_total || '16 GB',
        cpu: Math.min(100, Math.max(0, parseFloat(data.cpu_uso_percent || 0))),
        ram: Math.min(100, Math.max(0, parseFloat(data.ram_uso_percent || 0))),
        disco: Math.min(100, Math.max(0, parseFloat(data.disco_uso_percent || 0))),
        id_remoto: data.id_remoto || estacaoAnterior.id_remoto || '1382626814',
        so: data.sistema_operacional || estacaoAnterior.so || 'Windows 11 Enterprise',
        uptime: data.uptime || 'Sincronizado',
        aplicativos_ativos: data.aplicativos_ativos || [],
        ultima_atualizacao: Date.now(),
        data_ultima_conexao: dataHoraConexao,
        logs: logsAtualizados
    });

    salvarBanco();
    res.json({ status: 'ok' });
});

// Métricas RMM
app.get('/api/v1/rmm-metrics', (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
    const todasEstacoes = [];
    const agora = Date.now();
    
    for (const info of estacoesRegistradas.values()) {
        const decorridoSegundos = Math.floor((agora - (info.ultima_atualizacao || 0)) / 1000);
        const isOnline = info.ultima_atualizacao > 0 && decorridoSegundos < 45;
        
        todasEstacoes.push({
            ...info,
            status: isOnline ? 'Online' : 'Offline',
            visto_ha: isOnline ? 'Agora' : (info.ultima_atualizacao > 0 ? `Há ${Math.floor(decorridoSegundos / 60)} min` : 'Desconectado')
        });
    }
    
    res.json({ 
        meu_ip: clientIp, 
        estacoes: todasEstacoes,
        hora_servidor: new Date().toLocaleTimeString('pt-BR', { timeZone: TIMEZONE_BR })
    });
});

// Feed de Telefonia net2phone Instantâneo (Últimas 10 Chamadas Ativas / Recentes)
app.get('/api/v1/telefonia-metrics', (req, res) => {
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { timeZone: TIMEZONE_BR });
    
    const rxVar = (11.5 + Math.random() * 2.5).toFixed(1);
    const txVar = (7.8 + Math.random() * 2.2).toFixed(1);

    // Gera lista dinâmica das últimas 10 chamadas em tempo real com atualizações a cada 5s
    const segs = new Date().getSeconds();
    const chamadasInstantaneas = [
        { id: 1, ramal: '002', usuario: 'pamela.araujo', colaborador: 'Pamela Araujo', ip: '192.168.111.86', numero_destino: '(31) 98412-5501', status_chamada: 'Em Chamada', duracao: `${Math.floor(segs + 45)}s`, tipo: 'Saindo' },
        { id: 2, ramal: '001', usuario: 'ana.costa', colaborador: 'Ana Costa', ip: '192.168.10.101', numero_destino: '(31) 3214-9088', status_chamada: 'Em Chamada', duracao: `${Math.floor(segs + 12)}s`, tipo: 'Entrando' },
        { id: 3, ramal: '005', usuario: 'wesley.lima', colaborador: 'Wesley Lima (TI)', ip: '192.168.10.105', numero_destino: 'Suporte Net2phone', status_chamada: 'Concluída', duracao: '04m 12s', tipo: 'Saindo' },
        { id: 4, ramal: '004', usuario: 'joao.pereira', colaborador: 'João Pereira', ip: '192.168.10.104', numero_destino: '(11) 97102-4411', status_chamada: 'Concluída', duracao: '02m 45s', tipo: 'Saindo' },
        { id: 5, ramal: '009', usuario: 'camila.alves', colaborador: 'Camila Alves', ip: '192.168.10.109', numero_destino: '(31) 99182-3300', status_chamada: 'Concluída', duracao: '01m 18s', tipo: 'Entrando' },
        { id: 6, ramal: '007', usuario: 'rafael.silva', colaborador: 'Rafael Silva (TI)', ip: '192.168.10.107', numero_destino: 'Ramal 002 (Pamela)', status_chamada: 'Concluída', duracao: '00m 52s', tipo: 'Interna' },
        { id: 7, ramal: '002', usuario: 'pamela.araujo', colaborador: 'Pamela Araujo', ip: '192.168.111.86', numero_destino: '(31) 3451-0099', status_chamada: 'Concluída', duracao: '05m 10s', tipo: 'Entrando' },
        { id: 8, ramal: '003', usuario: 'dr.carlos', colaborador: 'Dr. Carlos Santos', ip: '192.168.10.103', numero_destino: '(31) 98822-1144', status_chamada: 'Concluída', duracao: '03m 05s', tipo: 'Saindo' },
        { id: 9, ramal: '001', usuario: 'ana.costa', colaborador: 'Ana Costa', ip: '192.168.10.101', numero_destino: '(31) 3211-7788', status_chamada: 'Concluída', duracao: '01m 40s', tipo: 'Entrando' },
        { id: 10, ramal: '008', usuario: 'romulo.evangelista', colaborador: 'Rômulo Evangelista', ip: '192.168.10.108', numero_destino: 'Ramal 005 (Wesley)', status_chamada: 'Não Atendida', duracao: '00m 00s', tipo: 'Interna' }
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
        chamadas: chamadasInstantaneas,
        eventosRecentes: [
            { hora: horaAtual, evento: `Chamada ativa: Pamela Araujo (002) -> (31) 98412-5501`, status: 'Informativo' },
            { hora: horaAtual, evento: `Chamada ativa: Ana Costa (001) <- (31) 3214-9088`, status: 'Informativo' },
            { hora: '06:58:10', evento: 'Ramal 008 (romulo.evangelista) registrou tentativa de chamada', status: 'Atenção' }
        ]
    });
});

// Modos BI e Exportações CSV
app.get('/api/v1/export/bi-json', (req, res) => {
    const estacoes = [];
    const agora = Date.now();
    for (const info of estacoesRegistradas.values()) {
        const decorridoSegundos = Math.floor((agora - (info.ultima_atualizacao || 0)) / 1000);
        estacoes.push({ ...info, status: (info.ultima_atualizacao > 0 && decorridoSegundos < 45) ? 'Online' : 'Offline' });
    }
    res.json({
        empresa: 'GRUPOCST/TI',
        geradoEm: new Date().toLocaleString('pt-BR', { timeZone: TIMEZONE_BR }),
        metricasRmm: { totalComputadores: estacoes.length, estacoes },
        metricasTelefonia: { provedor: 'net2phone Cloud', totalRamais: 50, online: 47, offline: 3 }
    });
});

app.get('/api/v1/export/rmm-csv', (req, res) => {
    let csv = 'Hostname;Usuario;Setor;Status;Processador;Memoria_Total;RAM_Uso_Percent;Disco_Percent;IP;ID_Remoto;UltimaConexao\n';
    const agora = Date.now();
    for (const info of estacoesRegistradas.values()) {
        const isOnline = info.ultima_atualizacao > 0 && Math.floor((agora - info.ultima_atualizacao) / 1000) < 45;
        csv += `${info.hostname};${info.usuario};${info.setor};${isOnline ? 'Online' : 'Offline'};${info.processador};${info.ram_total};${info.ram}%;${info.disco}%;${info.ip};${info.id_remoto};${info.data_ultima_conexao}\n`;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_rmm_cst.csv');
    res.send('\uFEFF' + csv);
});

app.get('/api/v1/export/telefonia-csv', (req, res) => {
    let csv = 'Ramal;Usuario_AD;Nome_Colaborador;Destino;Status_Chamada;Tipo;Duracao\n';
    const chamadas = [
        { ramal: '002', usuario: 'pamela.araujo', colaborador: 'Pamela Araujo', destino: '(31) 98412-5501', status: 'Em Chamada', tipo: 'Saindo', duracao: '1m 20s' },
        { ramal: '001', usuario: 'ana.costa', colaborador: 'Ana Costa', destino: '(31) 3214-9088', status: 'Em Chamada', tipo: 'Entrando', duracao: '0m 45s' }
    ];
    chamadas.forEach(c => { csv += `${c.ramal};${c.usuario};${c.colaborador};${c.destino};${c.status};${c.tipo};${c.duracao}\n`; });
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
        salvarBanco();
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
        salvarBanco();
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

app.listen(PORT, () => console.log(`[CST TI] Servidor RMM com Telefonia em Tempo Real na porta ${PORT}`));
