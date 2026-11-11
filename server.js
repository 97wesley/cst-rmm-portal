const express = require('express');
const app = express();
app.use(express.json());

const estacoesRegistradas = new Map();
const comandosPendentes = new Map();

// 1. Rota Principal - Interface inspirada no IT Self-Service Portal
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Portal de Autoatendimento TI - CST</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
                body { background-color: #0b131e; color: #e2e8f0; display: flex; height: 100vh; overflow: hidden; }

                /* Sidebar Esquerda */
                .sidebar { width: 240px; background-color: #111c2a; border-right: 1px solid #1e2d42; display: flex; flex-direction: column; padding: 20px 15px; }
                .brand { font-size: 16px; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 10px; margin-bottom: 30px; }
                .nav-menu { list-style: none; display: flex; flex-direction: column; gap: 8px; }
                .nav-item a { display: flex; align-items: center; gap: 12px; padding: 12px 16px; color: #94a3b8; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; transition: all 0.2s; }
                .nav-item.active a, .nav-item a:hover { background-color: #064e3b; color: #34d399; }

                /* Conteúdo Principal */
                .main-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
                
                /* Header Superior */
                .top-header { height: 65px; background-color: #111c2a; border-bottom: 1px solid #1e2d42; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; }
                .search-bar { position: relative; width: 350px; }
                .search-bar input { width: 100%; background: #1a2738; border: 1px solid #2a3c54; padding: 8px 12px 8px 36px; border-radius: 20px; color: #fff; font-size: 13px; }
                .search-bar i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 13px; }
                .user-profile { display: flex; align-items: center; gap: 12px; font-size: 14px; }
                .avatar { width: 36px; height: 36px; border-radius: 50%; background: #0284c7; display: flex; align-items: center; justify-content: center; font-weight: bold; }

                /* Container de Conteúdo */
                .dashboard-body { padding: 25px 30px; }
                .welcome-title { font-size: 20px; font-weight: 600; color: #f8fafc; margin-bottom: 20px; }
                
                /* Grid de Cards */
                .cards-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
                
                .card { background-color: #132030; border: 1px solid #1e2e45; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
                .card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e2d42; padding-bottom: 10px; }
                .card-header h3 { font-size: 15px; color: #f1f5f9; display: flex; align-items: center; gap: 10px; }
                .badge-online { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid #22c55e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }

                /* Botões de Ação estilo Pilsen */
                .btn-action { background: #1a293d; border: 1px solid #273952; color: #cbd5e1; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.2s; text-align: left; }
                .btn-action:hover { background: #22354e; border-color: #38bdf8; color: #fff; }
                .btn-action i { color: #64748b; }
                .tag-status { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
                .tag-completed { background: #064e3b; color: #34d399; }

                /* Status Bar Superior da Máquina */
                .machine-bar { background: #172639; border: 1px solid #23364f; border-radius: 10px; padding: 15px 20px; margin-bottom: 25px; display: flex; align-items: center; justify-content: space-between; }
                .machine-info { display: flex; gap: 25px; font-size: 13px; color: #94a3b8; }
                .machine-info span { color: #38bdf8; font-weight: 600; }
            </style>
        </head>
        <body>

            <!-- Sidebar Esquerda -->
            <aside class="sidebar">
                <div class="brand">
                    <i class="fa-solid fa-laptop-code"></i> IT SELF-SERVICE
                </div>
                <ul class="nav-menu">
                    <li class="nav-item active"><a href="#"><i class="fa-solid fa-house"></i> Home</a></li>
                    <li class="nav-item"><a href="#"><i class="fa-solid fa-desktop"></i> Ativos (PCs)</a></li>
                    <li class="nav-item"><a href="#"><i class="fa-solid fa-phone"></i> Telefonia</a></li>
                    <li class="nav-item"><a href="#"><i class="fa-solid fa-ticket"></i> Chamados TI</a></li>
                    <li class="nav-item"><a href="#"><i class="fa-solid fa-gear"></i> Configurações</a></li>
                </ul>
            </aside>

            <!-- Painel Principal -->
            <main class="main-content">
                
                <!-- Top Header -->
                <header class="top-header">
                    <div class="search-bar">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input type="text" placeholder="Buscar correções, ferramentas ou guias...">
                    </div>
                    <div class="user-profile">
                        <span id="userNameHeader">Bem-vindo, Colaborador</span>
                        <div class="avatar"><i class="fa-solid fa-user"></i></div>
                    </div>
                </header>

                <!-- Área do Dashboard -->
                <div class="dashboard-body">
                    
                    <div id="estacoesContainer">
                        <p style="color: #94a3b8;">Buscando dados da estação de trabalho...</p>
                    </div>

                </div>
            </main>

            <script>
                async function carregarDashboard() {
                    try {
                        const res = await fetch('/api/v1/rmm-metrics');
                        const dados = await res.json();
                        const container = document.getElementById('estacoesContainer');
                        
                        if (dados.length === 0) {
                            container.innerHTML = \`
                                <div class="machine-bar">
                                    <p style="color: #f87171;"><i class="fa-solid fa-plug-circle-xmark"></i> Nenhuma máquina conectada. Certifique-se de que o Agente PowerShell esteja em execução.</p>
                                </div>\`;
                            return;
                        }

                        const maq = dados[0]; // Exibe a máquina ativa
                        document.getElementById('userNameHeader').innerText = "Bem-vindo, " + maq.usuario;

                        container.innerHTML = \`
                            <!-- Barra com Dados Reais da Máquina -->
                            <div class="machine-bar">
                                <div>
                                    <strong style="color: #fff; font-size: 15px;"><i class="fa-solid fa-computer"></i> Estação: \${maq.hostname}</strong>
                                    <span class="badge-online" style="margin-left: 10px;">ONLINE</span>
                                </div>
                                <div class="machine-info">
                                    <div>IP Local: <span>\${maq.ip}</span></div>
                                    <div>CPU: <span>\${maq.cpu}%</span></div>
                                    <div>RAM: <span>\${maq.ram}%</span></div>
                                    <div>Disco: <span>\${maq.disco}%</span></div>
                                </div>
                            </div>

                            <h2 class="welcome-title">Como podemos ajudar você hoje, \${maq.usuario.split('\\\\').pop()}?</h2>

                            <!-- Grid com as 5 Categorias do Projeto -->
                            <div class="cards-grid">
                                
                                <!-- 1. Travamento & Desempenho -->
                                <div class="card">
                                    <div class="card-header">
                                        <h3><i class="fa-solid fa-gauge-high" style="color: #38bdf8;"></i> Travamento & Otimização</h3>
                                    </div>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'limpar_cache')">
                                        <span><i class="fa-solid fa-broom"></i> Cache do Computador</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'cache_navegadores')">
                                        <span><i class="fa-brands fa-chrome"></i> Cache de Navegadores</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'otimizar_disco')">
                                        <span><i class="fa-solid fa-hard-drive"></i> Otimizar Disco (Defrag/TRIM)</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'tracert_servidor')">
                                        <span><i class="fa-solid fa-route"></i> Testar Rota (Tracert)</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                </div>

                                <!-- 2. Impressoras -->
                                <div class="card">
                                    <div class="card-header">
                                        <h3><i class="fa-solid fa-print" style="color: #34d399;"></i> Impressoras</h3>
                                    </div>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'listar_impressoras')">
                                        <span><i class="fa-solid fa-list"></i> Listar Impressoras Instaladas</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'destravar_impressora')">
                                        <span><i class="fa-solid fa-rotate-right"></i> Reiniciar Spooler de Impressão</span>
                                        <span class="tag-status tag-completed">Recomendado</span>
                                    </button>
                                </div>

                                <!-- 3. Rede & Conectividade -->
                                <div class="card">
                                    <div class="card-header">
                                        <h3><i class="fa-solid fa-wifi" style="color: #facc15;"></i> Rede & Conectividade</h3>
                                    </div>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'ping_teste')">
                                        <span><i class="fa-solid fa-network-wired"></i> Testar Conexão (Ping 8.8.8.8)</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'flush_dns')">
                                        <span><i class="fa-solid fa-trash-can"></i> Limpar Cache DNS</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'renovar_ip')">
                                        <span><i class="fa-solid fa-arrows-rotate"></i> Renovar Endereço IP (DHCP)</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                </div>

                                <!-- 4. Atualização & Sistema -->
                                <div class="card">
                                    <div class="card-header">
                                        <h3><i class="fa-solid fa-arrows-spin" style="color: #a855f7;"></i> Atualização & Sistema</h3>
                                    </div>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'verificar_update')">
                                        <span><i class="fa-brands fa-windows"></i> Verificar Windows Update</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'atualizar_gpo')">
                                        <span><i class="fa-solid fa-shield-halved"></i> Atualizar Políticas de GPO</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                </div>

                                <!-- 5. Vídeo & Exibição -->
                                <div class="card">
                                    <div class="card-header">
                                        <h3><i class="fa-solid fa-desktop" style="color: #ec4899;"></i> Vídeo & Exibição</h3>
                                    </div>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'reiniciar_video')">
                                        <span><i class="fa-solid fa-display"></i> Reiniciar Driver de Vídeo</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'ajustar_dimensao')">
                                        <span><i class="fa-solid fa-expand"></i> Ajustar Dimensão / Resolução</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'melhor_escala')">
                                        <span><i class="fa-solid fa-magnifying-glass-plus"></i> Ajustar Melhor Escala</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button class="btn-action" onclick="executar('\${maq.hostname}', 'alternar_tema')">
                                        <span><i class="fa-solid fa-circle-half-stroke"></i> Tipo de Tema (Escuro/Claro)</span>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                </div>

                            </div>
                        \`;
                    } catch (e) {
                        console.error("Erro ao carregar o dashboard:", e);
                    }
                }

                async function executar(hostname, acao) {
                    if (!confirm("Confirmar a execução do procedimento [" + acao + "] na sua máquina?")) return;
                    await fetch('/api/v1/executar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hostname, acao })
                    });
                    alert("✅ Comando enviado! O agente local executará a ação em instantes nos bastidores.");
                }

                setInterval(carregarDashboard, 5000);
                carregarDashboard();
            </script>
        </body>
        </html>
    `);
});

// APIs do Servidor
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

app.post('/api/v1/executar', (req, res) => {
    const { hostname, acao } = req.body;
    const target = (hostname || '').toUpperCase();
    if (!comandosPendentes.has(target)) comandosPendentes.set(target, []);
    comandosPendentes.get(target).push({ acao });
    res.json({ status: "sucesso" });
});

app.get('/api/v1/pendencias/:hostname', (req, res) => {
    const target = req.params.hostname.toUpperCase();
    const acoes = comandosPendentes.get(target) || [];
    comandosPendentes.set(target, []);
    res.json({ acoes });
});

app.get('/api/v1/rmm-metrics', (req, res) => {
    res.json(Array.from(estacoesRegistradas.values()));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
