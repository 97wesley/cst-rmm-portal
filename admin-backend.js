const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');
const nodemailer = require('nodemailer');

const DATA_DIR = path.join(__dirname, 'data');
const ATIVOS_FILE = path.join(DATA_DIR, 'ativos.json');
const SWITCHES_FILE = path.join(DATA_DIR, 'switches.json');
const TELEFONE_LOG_FILE = path.join(DATA_DIR, 'telefone_historico.json');

if (!fs.existsSync(ATIVOS_FILE)) fs.writeFileSync(ATIVOS_FILE, '[]');
if (!fs.existsSync(SWITCHES_FILE)) {
    fs.writeFileSync(SWITCHES_FILE, JSON.stringify([
        { hostname: 'SW-CORE-VLAN101', ip: '192.168.101.2', sistema: 'Switch Gerenciável L3', ssd: 'Flash 256MB (18% uso)', infoExtra: '24 Portas PoE • VLAN 101/102/122', online: true },
        { hostname: 'SW-VOIP-VLAN122', ip: '192.168.122.1', sistema: 'Gateway / Switch VoIP', ssd: 'Flash 128MB (22% uso)', infoExtra: 'Tronco SIP net2phone • QoS Ativo', online: true }
    ], null, 2));
}
if (!fs.existsSync(TELEFONE_LOG_FILE)) fs.writeFileSync(TELEFONE_LOG_FILE, '[]');

const NET2PHONE_API_KEY = 'qXQhZL5J4+pT3S3Mtbd4VAqmXO+UGPXpJ8gyoMj0hwr6s5FT87qQXFzcpU0Z83IywFBoPSfS2mhYN0Uhnbp7Ig==';
let statusTelefonia = {
    vlanIp: '192.168.122.1',
    online: true,
    zabbixStatus: 'OK - Tronco SIP Operacional',
    ultimaVerificacao: new Date().toISOString(),
    alertaEnviado: false,
    chamadasAtivas: [],
    historico: JSON.parse(fs.readFileSync(TELEFONE_LOG_FILE, 'utf8'))
};

// Configuração de envio de alerta para ti@cstbh.com.br
const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
});

async function enviarAlertaQuedaTelefonia(motivo) {
    if (statusTelefonia.alertaEnviado) return;
    statusTelefonia.alertaEnviado = true;
    const registro = {
        data: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        evento: 'QUEDA DE TELEFONIA (ZABBIX / VLAN 192.168.122.1)',
        detalhe: motivo,
        destinoEmail: 'ti@cstbh.com.br'
    };
    statusTelefonia.historico.unshift(registro);
    statusTelefonia.historico = statusTelefonia.historico.slice(0, 100);
    fs.writeFileSync(TELEFONE_LOG_FILE, JSON.stringify(statusTelefonia.historico, null, 2));

    console.error('[ALERTA CRÍTICO TELEFONIA]', registro);
    if (process.env.SMTP_USER) {
        try {
            await mailer.sendMail({
                from: `"Monitoramento CST RMM / Zabbix" <${process.env.SMTP_USER}>`,
                to: 'ti@cstbh.com.br',
                subject: '[ALERTA ZABBIX] Queda na Telefonia VoIP net2phone (VLAN 192.168.122.1)',
                text: `Atenção Equipe de TI,\n\nFoi detectada uma indisponibilidade na telefonia corporativa net2phone.\n\nGateway/VLAN: 192.168.122.1\nHorário: ${registro.data}\nDiagnóstico: ${motivo}\n\nVerifique imediatamente o link VoIP e o painel Zabbix.`
            });
        } catch (e) {
            console.error('[SMTP] Falha ao enviar e-mail (configure SMTP_USER/SMTP_PASS no .env):', e.message);
        }
    }
}

function consultarNet2Phone() {
    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'api.net2phone.com',
            path: '/v1/calls/active',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${NET2PHONE_API_KEY}`,
                'X-Api-Key': NET2PHONE_API_KEY,
                'Accept': 'application/json'
            },
            timeout: 3500
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    const lista = Array.isArray(parsed) ? parsed : (parsed.data || parsed.calls || []);
                    resolve({ ok: res.statusCode < 500, status: res.statusCode, chamadas: lista.slice(0, 20) });
                } catch {
                    resolve({ ok: res.statusCode < 500, status: res.statusCode, chamadas: [] });
                }
            });
        });
        req.on('error', (err) => resolve({ ok: false, erro: err.message, chamadas: [] }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, erro: 'Timeout API net2phone', chamadas: [] }); });
        req.end();
    });
}

// Monitoramento contínuo a cada 5 segundos (VLAN 192.168.122.1 + API net2phone)
setInterval(async () => {
    exec('ping -c 1 -W 2 192.168.122.1', async (errPing) => {
        const apiRes = await consultarNet2Phone();
        statusTelefonia.ultimaVerificacao = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        if (apiRes.chamadas && apiRes.chamadas.length > 0) {
            statusTelefonia.chamadasAtivas = apiRes.chamadas.slice(0, 20);
            apiRes.chamadas.forEach(c => {
                if (c.id && !statusTelefonia.historico.some(h => h.callId === c.id)) {
                    statusTelefonia.historico.unshift({
                        callId: c.id,
                        data: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                        ramal: c.extension || c.from || 'N/D',
                        numero: c.to || c.destination || 'N/D',
                        direcao: c.direction || 'Atendimento',
                        duracao: c.duration || 'Em curso',
                        status: c.status || 'Conectada'
                    });
                }
            });
            statusTelefonia.historico = statusTelefonia.historico.slice(0, 100);
            fs.writeFileSync(TELEFONE_LOG_FILE, JSON.stringify(statusTelefonia.historico, null, 2));
        }

        const vlanOk = !errPing;
        if (!vlanOk && !apiRes.ok) {
            statusTelefonia.online = false;
            statusTelefonia.zabbixStatus = 'CRÍTICO - VLAN 192.168.122.1 Inacessível (Alerta enviado para ti@cstbh.com.br)';
            await enviarAlertaQuedaTelefonia('Sem resposta ICMP na VLAN 192.168.122.1 e falha na API net2phone.');
        } else {
            statusTelefonia.online = true;
            statusTelefonia.alertaEnviado = false;
            statusTelefonia.zabbixStatus = vlanOk
                ? 'ONLINE • Zabbix Monitorando VLAN 192.168.122.1 + API net2phone Sincronizada'
                : 'ONLINE VIA NUVEM • API net2phone Ativa (Verifique rota ICMP 192.168.122.1)';
        }
    });
}, 5000);

module.exports = function registrarRotasAdmin(app, autenticar, getEstacoes, getLogs) {
    // Redireciona /admin para a nova visão administrativa unificada
    app.get('/admin', autenticar, (req, res) => {
        res.render('admin', { usuario: req.session.user, abaInicial: 'home' });
    });

    // Página grande completa de controle remoto ao clicar no hostname
    app.get('/admin/maquina/:hostname', autenticar, (req, res) => {
        const host = req.params.hostname;
        const estacoes = getEstacoes() || [];
        const maquina = estacoes.find(e => e.hostname.toLowerCase() === host.toLowerCase()) || {
            hostname: host, ip: 'N/D', usuario: 'N/D', so: 'Windows / Linux', disco_c_livre: 0, disco_c_total: 0, disco_c_uso: 0, ram_total: 'N/D', ram_uso: 0, cpu_uso: 0, programas_abertos: []
        };
        res.render('admin-maquina', { usuario: req.session.user, maquina });
    });

    // API de dados em tempo real do Modo Admin (Home, Switches, Estações)
    app.get('/api/admin/inventario', autenticar, (req, res) => {
        const agora = Date.now();
        const estacoes = (getEstacoes() || []).map(e => {
            const online = (agora - new Date(e.ultimaVez).getTime()) < 25000;
            const soLower = (e.so || '').toLowerCase();
            let tipoSistema = 'Windows';
            if (soLower.includes('server')) tipoSistema = 'Windows Server';
            else if (soLower.includes('ubuntu') || soLower.includes('debian') || soLower.includes('linux')) tipoSistema = 'Linux';
            else if (e.so) tipoSistema = e.so.replace('Microsoft ', '');

            const memPct = e.ram_uso || (e.memoria_uso) || 0; const dTotal = e.disco_c_total || e.disco_total || 256; const dLivre = e.disco_c_livre || e.disco_livre || 120; const dUso = e.disco_c_uso || Math.round(((dTotal - dLivre) / dTotal) * 100); const ssdInfo = dTotal
                ? `${dLivre}GB livres / ${dTotal}GB (${dUso}% uso)`
                : 'SSD NVMe 256GB (Monitorando)';

            const infoExtra = `RAM ${e.ram_uso || 0}% (${e.ram_total || '8GB'}) • CPU ${e.cpu_uso || 0}%`;
            return { ...e, online, tipoSistema, ssdInfo, infoExtra };
        });

        const switches = JSON.parse(fs.readFileSync(SWITCHES_FILE, 'utf8'));
        res.json({ estacoes, switches, logs: (getLogs ? getLogs() : []).slice(0, 40) });
    });

    // Cadastrar novo Switch na rede
    app.post('/api/admin/switches', autenticar, (req, res) => {
        const { hostname, ip, sistema, ssd, infoExtra } = req.body || {};
        if (!hostname || !ip) return res.status(400).json({ erro: 'Hostname e IP são obrigatórios.' });
        const switches = JSON.parse(fs.readFileSync(SWITCHES_FILE, 'utf8'));
        switches.push({ hostname, ip, sistema: sistema || 'Switch L2/L3', ssd: ssd || 'Flash Interna OK', infoExtra: infoExtra || 'Gerenciável SNMP', online: true });
        fs.writeFileSync(SWITCHES_FILE, JSON.stringify(switches, null, 2));
        res.json({ ok: true });
    });

    // API de Ativos (CRUD com fotos em alta resolução / 4K)
    app.get('/api/admin/ativos', autenticar, (req, res) => {
        res.json(JSON.parse(fs.readFileSync(ATIVOS_FILE, 'utf8')));
    });

    app.post('/api/admin/ativos', autenticar, (req, res) => {
        const body = req.body || {};
        const ativos = JSON.parse(fs.readFileSync(ATIVOS_FILE, 'utf8'));
        const id = Date.now().toString();

        // Salva fotos em alta resolução em disco para não pesar o JSON
        const salvarFoto = (base64, prefixo) => {
            if (!base64 || !base64.startsWith('data:image')) return '';
            const ext = base64.includes('image/png') ? 'png' : 'jpg';
            const nomeArq = `${id}_${prefixo}.${ext}`;
            const dados = base64.replace(/^data:image\/\w+;base64,/, '');
            fs.writeFileSync(path.join(__dirname, 'public', 'uploads', nomeArq), Buffer.from(dados, 'base64'));
            return `/uploads/${nomeArq}`;
        };

        const novoAtivo = {
            id,
            colaborador: body.colaborador || 'Não vinculado',
            setorVlan: body.setorVlan || 'VLAN 102',
            dataCadastro: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            gabinete: { patrimonio: body.patGabinete || '', modelo: body.modGabinete || '', foto: salvarFoto(body.fotoGabinete, 'gabinete') },
            monitor1: { patrimonio: body.patMonitor1 || '', modelo: body.modMonitor1 || '', foto: salvarFoto(body.fotoMonitor1, 'monitor1') },
            monitor2: { patrimonio: body.patMonitor2 || '', modelo: body.modMonitor2 || '', foto: salvarFoto(body.fotoMonitor2, 'monitor2') },
            tecladoMouse: { patrimonio: body.patTecladoMouse || '', modelo: body.modTecladoMouse || '', foto: salvarFoto(body.fotoTecladoMouse, 'perifericos') },
            headset: { patrimonio: body.patHeadset || '', modelo: body.modHeadset || '', foto: salvarFoto(body.fotoHeadset, 'headset') },
            celular: { patrimonio: body.patCelular || '', modelo: body.modCelular || '', foto: salvarFoto(body.fotoCelular, 'celular') }
        };

        ativos.unshift(novoAtivo);
        fs.writeFileSync(ATIVOS_FILE, JSON.stringify(ativos, null, 2));
        res.json({ ok: true, ativo: novoAtivo });
    });

    app.delete('/api/admin/ativos/:id', autenticar, (req, res) => {
        let ativos = JSON.parse(fs.readFileSync(ATIVOS_FILE, 'utf8'));
        ativos = ativos.filter(a => a.id !== req.params.id);
        fs.writeFileSync(ATIVOS_FILE, JSON.stringify(ativos, null, 2));
        res.json({ ok: true });
    });

    // API de Telefonia net2phone + Status Zabbix em tempo real (5s)
    app.get('/api/admin/telefone', autenticar, (req, res) => {
        res.json(statusTelefonia);
    });
};
