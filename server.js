const express = require('express');
const app = express();
app.use(express.json());

const estacoesRegistradas = new Map();
const comandosPendentes = new Map();

// Recebe a telemetria do agente (incluindo o IP real limpo)
app.post('/api/v1/telemetria', (req, res) => {
    const { hostname, usuario, ip, cpu, ram, disco } = req.body;
    if (!hostname) return res.status(400).send("Hostname obrigatório");

    estacoesRegistradas.set(hostname.toUpperCase(), {
        hostname: hostname.toUpperCase(),
        usuario: usuario || 'Desconhecido',
        ip: ip || '0.0.0.0',
        cpu: cpu || 0,
        ram: ram || 0,
        disco: disco || 0,
        ultimaVez: new Date()
    });

    res.json({ status: "ok" });
});

// Enfileira comandos para a máquina
app.post('/api/v1/executar', (req, res) => {
    const { hostname, acao } = req.body;
    const target = (hostname || '').toUpperCase();
    
    if (!comandosPendentes.has(target)) {
        comandosPendentes.set(target, []);
    }
    comandosPendentes.get(target).push({ acao });
    res.json({ status: "sucesso", mensagem: `Ação ${acao} enfileirada para ${target}` });
});

// Agente busca comandos pendentes
app.get('/api/v1/pendencias/:hostname', (req, res) => {
    const target = req.params.hostname.toUpperCase();
    const acoes = comandosPendentes.get(target) || [];
    comandosPendentes.set(target, [] ); // Limpa a fila após entregar
    res.json({ acoes });
});

// Endpoint para o Painel Web consultar as máquinas conectadas (com o IP no topo)
app.get('/api/v1/rmm-metrics', (req, res) => {
    const lista = Array.from(estacoesRegistradas.values());
    res.json(lista);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor RMM rodando na porta ${PORT}`);
});
