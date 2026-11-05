const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const estacoesRegistradas = new Map();
const comandosPendentes = new Map();
const EQUIPE_TI = ['wesley.lima', 'rafael.silva', 'romulo.evangelista'];

// Rota Raiz Explícita (Garante a entrega do index.html)
app.get('/', (req, res) => {
    const publicPath = path.join(__dirname, 'public', 'index.html');
    const rootPath = path.join(__dirname, 'index.html');
    
    if (fs.existsSync(publicPath)) {
        res.sendFile(publicPath);
    } else if (fs.existsSync(rootPath)) {
        res.sendFile(rootPath);
    } else {
        res.send('<h2>Servidor RMM Online</h2><p>Agente conectado! Ficheiro index.html não foi localizado no repositório.</p>');
    }
});

app.post('/api/v1/login', (req, res) => {
    const { usuario, senha, tipo } = req.body;
    const cleanUser = (usuario || '').trim().toLowerCase();
    
    if (!cleanUser || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: 'Preencha os dados.' });
    }
    if (tipo === 'admin' && !EQUIPE_TI.includes(cleanUser)) {
        return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado.' });
    }
    
    res.json({ sucesso: true, tipo, usuario: cleanUser });
});

app.post('/api/v1/telemetria', (req, res) => {
    const data = req.body;
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '').split(',')[0].trim();
    const hostKey = (data.hostname || 'DESCONHECIDO').toUpperCase().trim();
    
    estacoesRegistradas.set(hostKey, {
        hostname: hostKey,
        usuario: (data.usuario || 'Utilizador').toLowerCase().trim(),
        ip: data.ip_local || clientIp,
        cpu: parseFloat(data.cpu_uso_percent || 0),
        ram: parseFloat(data.ram_uso_percent || 0),
        disco: parseFloat(data.disco_uso_percent || 0),
        so: data.sistema_operacional || 'Windows',
        logs: [`[${new Date().toLocaleTimeString()}] Conexão CST Assist ativa.`],
        ultima_atualizacao: Date.now()
    });
    
    res.json({ status: 'ok' });
});

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

app.post('/api/v1/executar-acao', (req, res) => {
    const { target, acao, parametros } = req.body;
    const hostKey = (target || '').toUpperCase().trim();
    
    if (!comandosPendentes.has(hostKey)) {
        comandosPendentes.set(hostKey, []);
    }
    
    comandosPendentes.get(hostKey).push({ acao, parametros: parametros || {} });
    res.json({ status: 'sucesso', mensagem: 'Comando enviado.' });
});

app.get('/api/v1/pendencias/:hostname', (req, res) => {
    const hostKey = req.params.hostname.toUpperCase().trim();
    const tarefas = comandosPendentes.get(hostKey) || [];
    comandosPendentes.delete(hostKey);
    res.json({ tarefas });
});

app.listen(PORT, () => {
    console.log(`[CST TI] Servidor RMM rodando na porta ${PORT}`);
});
