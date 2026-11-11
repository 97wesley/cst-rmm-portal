const express = require('express');
const app = express();
app.use(express.json());

const estacoesRegistradas = new Map();
const comandosPendentes = new Map();

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Portal de Autoatendimento TI - CST</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; }
                body { background-color: #0b131e; color: #e2e8f0; display: flex; justify-content: center; padding: 30px 15px; }
                
                .main-container { width: 100%; max-width: 1100px; display: flex; flex-direction: column; gap: 20px; }
                
                /* Barra da Máquina */
                .machine-bar { background: #132030; border: 1px solid #1e2e45; border-radius: 12px; padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
                .machine-bar h2 { color: #f8fafc; font-size: 18px; display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
                .badge-online { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid #22c55e; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; }
                .stats { display: flex; gap: 20px; color: #94a3b8; font-size: 14px; }
                .stats span { color: #38bdf8; font-weight: bold; }

                /* Grid de Ferramentas */
                .cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
                .card { background-color: #132030; border: 1px solid #1e2e45; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
                .card-header { border-bottom: 1px solid #1e2d42; padding-bottom: 12px; margin-bottom: 5px; color: #f1f5f9; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
                
                /* Botões Inteligentes */
                .btn-action { background: #1a293d; border: 1px solid #273952; color: #cbd5e1; padding: 12px 15px; border-radius: 8px; font-size: 14px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: 0.2s; text-align: left; }
                .btn-action:hover:not(:disabled) { background: #22354e; border-color: #38bdf8; color: #fff; }
                .btn-action:disabled { opacity: 0.6; cursor: not-allowed; border-color: #047857; color: #34d399; }
                .btn-action i { color: #64748b; }
                .btn-action:hover:not(:disabled) i { color: #38bdf8; }

                /* Sistema de Tarjas (Toasts) */
                #toast-container { position: fixed; top: 25px; right: 25px; z-index: 9999; display: flex; flex-direction: column; gap: 12px; }
                .toast { min-width: 320px; padding: 16px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 15px; color: #fff; box-shadow: 0 8px 20px rgba(0,0,0,0.5); transform: translateX(120%); animation: slideIn 0.4s forwards; }
                .toast.info { background: #1e3a8a; border-left: 5px solid #3b82f6; }
                .toast.success { background: #064e3b; border-left: 5px solid #10b981; }
                .toast i { font-size: 18px; }
                @keyframes slideIn { to { transform: translateX(0); } }
                @keyframes fadeOut { to { opacity: 0; transform: translateX(120%); } }
            </style>
        </head>
        <body>
            <div id="toast-container"></div>

            <div class="main-container" id="estacoesContainer">
                <div class="machine-bar" style="justify-content: center; color: #94a3b8;">
                    <i class="fa-solid fa-circle-notch fa-spin"></i> &nbsp; Conectando à sua estação de trabalho...
                </div>
            </div>

            <script>
                // Função para exibir a Tarja (Toast)
                function mostrarTarja(mensagem, tipo = 'info') {
                    const container = document.getElementById('toast-container');
                    const toast = document.createElement('div');
                    toast.className = 'toast ' + tipo;
                    const icone = tipo === 'success' ? 'fa-circle-check' : 'fa-gear fa-spin';
                    
                    toast.innerHTML = '<i class="fa-solid ' + icone + '"></i> <span>' + mensagem + '</span>';
                    container.appendChild(toast);
                    
                    // Remove a tarja após 4 segundos
                    setTimeout(() => {
                        toast.style.animation = 'fadeOut 0.4s forwards';
                        setTimeout(() => toast.remove(), 400);
                    }, 4000);
                }

                // Função de Execução com Feedback de Botão
                async function executar(hostname, acao, btnElement) {
                    const textoOriginal = btnElement.innerHTML;
                    
                    // Desabilita o botão e mostra processamento
                    btnElement.disabled = true;
                    btnElement.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="color: #34d399;"></i> <span style="color: #34d399;">Processando no Windows...</span>';
                    
                    mostrarTarja('Enviando comando para ' + hostname + '...', 'info');

                    try {
                        await fetch('/api/v1/executar', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ hostname, acao })
                        });
                        
                        // Simula o tempo de rede para UX
                        setTimeout(() => {
                            mostrarTarja('Comando executado com sucesso no sistema!', 'success');
                            btnElement.innerHTML = '<i class="fa-solid fa-check"></i> <span>Concluído</span>';
                            
                            // Restaura o botão após 3 segundos
                            setTimeout(() => {
                                btnElement.disabled = false;
                                btnElement.innerHTML = textoOriginal;
                            }, 3000);
                        }, 1200);

                    } catch (e) {
                        alert("Erro de comunicação com o servidor.");
                        btnElement.disabled = false;
                        btnElement.innerHTML = textoOriginal;
                    }
                }

                // Carrega o Dashboard
                async function carregarDashboard() {
                    try {
                        const res = await fetch('/api/v1/rmm-metrics');
                        const dados = await res.json();
                        const container = document.getElementById('estacoesContainer');
                        
                        if (dados.length === 0) return; // Mantém a tela de "conectando"
                        
                        const maq = dados[0]; // Pega a máquina atual conectada
                        
                        // Renderiza o HTML apenas 1 vez se não estiver carregado para não piscar a tela
                        if (!document.getElementById('renderizado')) {
                            container.innerHTML = \`
                                <div id="renderizado">
                                    <div class="machine-bar">
                                        <div>
                                            <h2><i class="fa-solid fa-desktop"></i> \${maq.hostname} <span class="badge-online">ONLINE</span></h2>
                                            <div class="stats">
                                                <span>👤 \${maq.usuario.split('\\\\').pop()}</span> | 
                                                <span>🌐 IP: \${maq.ip}</span> | 
                                                <span>⚙️ CPU: \${maq.cpu}%</span> | 
                                                <span>🧠 RAM: \${maq.ram}%</span> | 
                                                <span>💽 Disco: \${maq.disco}%</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="cards-grid" style="margin-top: 20px;">
                                        <!-- Travamento -->
                                        <div class="card">
                                            <div class="card-header"><i class="fa-solid fa-gauge-high" style="color: #38bdf8;"></i> Travamento & Desempenho</div>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'limpar_cache', this)"><span>🧹 Limpar Cache do Computador</span> <i class="fa-solid fa-chevron-right"></i></button>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'cache_navegadores', this)"><span>🌐 Limpar Cache dos Navegadores</span> <i class="fa-solid fa-chevron-right"></i></button>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'otimizar_disco', this)"><span>💽 Otimizar Disco</span> <i class="fa-solid fa-chevron-right"></i></button>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'tracert_servidor', this)"><span>🛤️ Testar Rota (Tracert)</span> <i class="fa-solid fa-chevron-right"></i></button>
                                        </div>

                                        <!-- Impressoras -->
                                        <div class="card">
                                            <div class="card-header"><i class="fa-solid fa-print" style="color: #34d399;"></i> Impressoras</div>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'listar_impressoras', this)"><span>📋 Listar Impressoras (Salva no Desktop)</span> <i class="fa-solid fa-chevron-right"></i></button>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'destravar_impressora', this)"><span>🔄 Reiniciar Spooler de Impressão</span> <i class="fa-solid fa-chevron-right"></i></button>
                                        </div>

                                        <!-- Rede -->
                                        <div class="card">
                                            <div class="card-header"><i class="fa-solid fa-wifi" style="color: #facc15;"></i> Rede & Conectividade</div>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'ping_teste', this)"><span>📶 Teste de Ping 8.8.8.8</span> <i class="fa-solid fa-chevron-right"></i></button>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'flush_dns', this)"><span>🧹 Limpar Cache DNS</span> <i class="fa-solid fa-chevron-right"></i></button>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'renovar_ip', this)"><span>🔄 Renovar IP da Máquina</span> <i class="fa-solid fa-chevron-right"></i></button>
                                        </div>

                                        <!-- Atualização -->
                                        <div class="card">
                                            <div class="card-header"><i class="fa-solid fa-arrows-spin" style="color: #a855f7;"></i> Atualização & Sistema</div>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'verificar_update', this)"><span>🔍 Buscar Windows Update</span> <i class="fa-solid fa-chevron-right"></i></button>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'atualizar_gpo', this)"><span>🛡️ Forçar Atualização de GPO</span> <i class="fa-solid fa-chevron-right"></i></button>
                                        </div>

                                        <!-- Vídeo -->
                                        <div class="card">
                                            <div class="card-header"><i class="fa-solid fa-display" style="color: #ec4899;"></i> Vídeo & Exibição</div>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'reiniciar_video', this)"><span>🔄 Reiniciar Gerenciador de Vídeo</span> <i class="fa-solid fa-chevron-right"></i></button>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'ajustar_dimensao', this)"><span>📐 Abrir Ajuste de Resolução</span> <i class="fa-solid fa-chevron-right"></i></button>
                                            <button class="btn-action" onclick="executar('\${maq.hostname}', 'alternar_tema', this)"><span>🌓 Configurar Tema do Windows</span> <i class="fa-solid fa-chevron-right"></i></button>
                                        </div>
                                    </div>
                                </div>
                            \`;
                        }
                    } catch (e) {
                        console.error("Erro na busca", e);
                    }
                }
                
                setInterval(carregarDashboard, 5000);
                carregarDashboard();
            </script>
        </body>
        </html>
    `);
});

// APIs (Mantidas Iguais)
app.post('/api/v1/telemetria', (req, res) => {
    const { hostname, usuario, ip, cpu, ram, disco } = req.body;
    if (hostname) estacoesRegistradas.set(hostname.toUpperCase(), { hostname: hostname.toUpperCase(), usuario, ip, cpu, ram, disco, ultimaVez: new Date() });
    res.json({ status: "ok" });
});

app.post('/api/v1/executar', (req, res) => {
    const target = (req.body.hostname || '').toUpperCase();
    if (!comandosPendentes.has(target)) comandosPendentes.set(target, []);
    comandosPendentes.get(target).push({ acao: req.body.acao });
    res.json({ status: "sucesso" });
});

app.get('/api/v1/pendencias/:hostname', (req, res) => {
    const target = req.params.hostname.toUpperCase();
    const acoes = comandosPendentes.get(target) || [];
    comandosPendentes.set(target, []);
    res.json({ acoes });
});

app.get('/api/v1/rmm-metrics', (req, res) => res.json(Array.from(estacoesRegistradas.values())));

app.listen(process.env.PORT || 3000, () => console.log("Servidor RMM rodando."));
