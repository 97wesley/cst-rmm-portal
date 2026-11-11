const express = require('express');
const app = express();
app.use(express.json());

const estacoesRegistradas = new Map();
const comandosPendentes = new Map();

// 1. Rota Principal: Exibe a Interface Web do Painel
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Central de Autoatendimento - CST</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
                .container { max-width: 1000px; margin: 0 auto; }
                h1 { color: #38bdf8; border-bottom: 2px solid #334155; padding-bottom: 10px; }
                .card { background: #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center; }
                .info h3 { margin: 0 0 5px 0; color: #f1f5f9; }
                .info p { margin: 2px 0; color: #94a3b8; font-size: 14px; }
                .badge { background: #22c55e; color: #fff; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; }
                .actions button { background: #0284c7; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; margin-left: 5px; font-weight: bold; }
                .actions button:hover { background: #0369a1; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🖥️ Central de Autoatendimento & RMM - CST</h1>
                <p>Monitoramento de estações em tempo real.</p>
                <div id="estacoes">Carregando estações conectadas...</div>
            </div>

            <script>
                async function carregarDados() {
                    try {
                        const res = await fetch('/api/v1/rmm-metrics');
                        const dados = await res.json();
                        const container = document.getElementById('estacoes');
                        
                        if (dados.length === 0) {
                            container.innerHTML = '<p style="color: #cbd5e1;">Nenhuma máquina conectada no momento. Certifique-se de que o agente PowerShell está rodando.</p>';
                            return;
                        }

                        let html = '';
                        dados.forEach(maq => {
                            html += \`
                                <div class="card">
                                    <div class="info">
                                        <h3>💻 Host: \${maq.hostname} <span class="badge">ONLINE</span></h3>
                                        <p><strong>👤 Usuário:</strong> \${maq.usuario}</p>
                                        <p><strong>🌐 IP Real:</strong> \${maq.ip}</p>
                                        <p><strong>📊 CPU:</strong> \${maq.cpu}% | <strong>RAM:</strong> \${maq.ram}% | <strong>Disco:</strong> \${maq.disco}%</p>
                                    </div>
                                    <div class="actions">
                                        <button onclick="enviarAcao('\${maq.hostname}', 'limpar_cache')">🧹 Limpar Cache</button>
                                        <button onclick="enviarAcao('\${maq.hostname}', 'destravar_impressora')">🖨️ Spooler</button>
                                        <button onclick="enviarAcao('\${maq.hostname}', 'flush_dns')">🌐 FlushDNS</button>
                                    </div>
                                </div>
                            \`;
                        });
                        container.innerHTML = html;
                    } catch (e) {
                        console.error("Erro ao buscar métricas", e);
                    }
                }

                async function enviarAcao(hostname, acao) {
                    if (!confirm("Deseja executar a ação " + acao + " na máquina " + hostname + "?")) return;
                    await fetch('/api/v1/executar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hostname, acao })
                    });
                    alert("Comando enviado para a fila da máquina!");
                }

                setInterval(carregarDados, 3000);
                carregarDados();
            </script>
        </body>
        </html>
    `);
});

// 2. Recebe a telemetria do agente (com o IP real)
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

// 3. Enfileira comandos para a máquina
app.post('/api/v1/executar', (req, res) => {
    const { hostname, acao } = req.body;
    const target = (hostname || '').toUpperCase();
    
    if (!comandosPendentes.has(target)) {
        comandosPendentes.set(target, []);
    }
    comandosPendentes.get(target).push({ acao });
    res.json({ status: "sucesso", mensagem: `Ação ${acao} enfileirada para ${target}` });
});

// 4. Agente busca comandos pendentes
app.get('/api/v1/pendencias/:hostname', (req, res) => {
    const target = req.params.hostname.toUpperCase();
    const acoes = comandosPendentes.get(target) || [];
    comandosPendentes.set(target, []); // Limpa a fila após entregar
    res.json({ acoes });
});

// 5. Endpoint para a Interface Web consultar as máquinas conectadas
app.get('/api/v1/rmm-metrics', (req, res) => {
    const lista = Array.from(estacoesRegistradas.values());
    res.json(lista);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor RMM rodando na porta ${PORT}`);
});
