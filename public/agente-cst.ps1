$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName System.DirectoryServices.AccountManagement
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::Expect100Continue = $false

$ServerUrl = "http://3.17.162.132:8000"
$LogFile   = "C:\CST-RMM\agente.log"
$Hostname  = $env:COMPUTERNAME

function Escrever-Log($Msg) {
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'HH:mm:ss')] $Msg" -ErrorAction SilentlyContinue
}

function Post-Json($Url, $JsonStr) {
    $Bytes = [System.Text.Encoding]::UTF8.GetBytes($JsonStr)
    return Invoke-RestMethod -Uri $Url -Method Post -Body $Bytes -ContentType "application/json; charset=utf-8" -TimeoutSec 5 -UseBasicParsing
}

function Test-CredencialAD($User, $Pass) {
    try {
        $Ctx = New-Object System.DirectoryServices.AccountManagement.PrincipalContext([System.DirectoryServices.AccountManagement.ContextType]::Domain, "CST.LOCAL")
        $Valido = $Ctx.ValidateCredentials($User, $Pass)
        if (-not $Valido) { return @{ ok = $false; motivo = "Utilizador ou palavra-passe inválidos no AD." } }
        $UsrObj = [System.DirectoryServices.AccountManagement.UserPrincipal]::FindByIdentity($Ctx, $User)
        $DN = if ($UsrObj) { $UsrObj.DistinguishedName } else { "" }
        $EhTI = ($DN -match "OU=TI") -or ($User -match "wesley\.lima")
        return @{ ok = $true; dn = $DN; ehTI = $EhTI }
    } catch {
        return @{ ok = $false; motivo = "Erro AD local: $($_.Exception.Message)" }
    }
}


Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-ChamadasNet2Phone($UsuarioAtual, $HostnameAtual) {
    $lista = @()
    try {
        $procs = Get-Process | Where-Object { $_.ProcessName -match "Receptionist|net2phone|RCon" -or $_.MainWindowTitle -match "Receptionist|net2phone|RCon" }
        if (-not $procs) { return $lista }

        $pids = $procs | Select-Object -ExpandProperty Id
        $winProc = $procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1

        # Lê os textos visíveis dentro do Receptionist Console (Contato, Número, Cronômetro e Direção)
        $contato = ""
        $numero = ""
        $duracao = ""
        $emChamadaUIA = $false

        if ($winProc) {
            $root = [System.Windows.Automation.AutomationElement]::FromHandle($winProc.MainWindowHandle)
            if ($root) {
                $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Text)
                $elems = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
                $txts = @()
                foreach ($e in $elems) {
                    $n = $e.Current.Name
                    if ($n -and $n.Trim().Length -gt 0) { $txts += $n.Trim() }
                }
                for ($i = 0; $i -lt $txts.Count; $i++) {
                    if ($txts[$i] -match "^Ativos*-s*(d{2}:d{2}:d{2})" -or $txts[$i] -eq "Chamada ativa" -or $txts[$i] -match "^d{2}:d{2}:d{2}$") {
                        $emChamadaUIA = $true
                        if ($txts[$i] -match "(d{2}:d{2}:d{2})") { $duracao = $matches[1] }
                        if ($i -ge 2 -and $txts[$i-2] -notmatch "CHAMADAS ATIVAS|Todas as chamadas") { $contato = $txts[$i-2] }
                        if ($i -ge 1 -and $txts[$i-1] -match "^[d+()-s]{3,}$") { $numero = $txts[$i-1] }
                        break
                    }
                }
            }
        }

        # Verifica portas UDP de mídia (RTP) em TODOS os processos do RCon (pai + filhos WebRTC)
        $udpMidia = Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object { $pids -contains $_.OwningProcess -and $_.LocalPort -ge 10000 }
        # Verifica se o Windows registrou uso ativo do microfone pelo RCon
        $micEmUso = $false
        try {
            $regMic = Get-ChildItem "HKCU:SOFTWAREMicrosoftWindowsCurrentVersionCapabilityAccessManagerConsentStoremicrophoneNonPackaged" -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match "Receptionist|net2phone|RCon" }
            foreach ($rm in $regMic) {
                $props = Get-ItemProperty $rm.PSPath -ErrorAction SilentlyContinue
                if ($props.LastUsedTimeStop -eq 0) { $micEmUso = $true }
            }
        } catch {}

        if ($emChamadaUIA -or $udpMidia -or $micEmUso) {
            $destFinal = if ($contato -and $numero) { "$contato ($numero)" }
                         elseif ($contato) { $contato }
                         elseif ($numero) { "Número: $numero" }
                         else { "Ligação Externa / Ramal (RCon)" }

            $statusFinal = if ($duracao) { "Em Ligação • $duracao" }
                           elseif ($micEmUso) { "Em Ligação (Áudio Ativo)" }
                           else { "Em Ligação (RTP Ativo)" }

            $lista += @{
                ramal = "$UsuarioAtual ($HostnameAtual)"
                destino = $destFinal
                direcao = "Ativa (VoIP)"
                status = $statusFinal
            }
        }
    } catch {}
    return $lista
}

Escrever-Log "=== Agente CST v5 Iniciado em $Hostname ==="

while ($true) {
    try {
        $Usuario = (Get-CimInstance Win32_ComputerSystem).UserName
        if (-not $Usuario) { $Usuario = "$env:USERDOMAIN\$env:USERNAME" }

        $IpReal = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -notlike "192.168.56.*" -and $_.InterfaceAlias -notmatch "VirtualBox|VMware|vEthernet|Loopback"
        } | Select-Object -First 1).IPAddress
        if (-not $IpReal) { $IpReal = "N/D" }

        $OS = Get-CimInstance Win32_OperatingSystem
        $SO = ($OS.Caption -replace "Microsoft ", "").Trim()
        $Cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
        $RamTot = [math]::Round($OS.TotalVisibleMemorySize / 1MB, 1)
        $RamLiv = [math]::Round($OS.FreePhysicalMemory / 1MB, 1)
        $RamUso = if ($RamTot -gt 0) { [math]::Round((($RamTot - $RamLiv) / $RamTot) * 100) } else { 0 }

        $Disco = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        $DTot = if ($Disco) { [math]::Round($Disco.Size / 1GB, 0) } else { 0 }
        $DLiv = if ($Disco) { [math]::Round($Disco.FreeSpace / 1GB, 0) } else { 0 }
        $DUso = if ($DTot -gt 0) { [math]::Round((($DTot - $DLiv) / $DTot) * 100) } else { 0 }

        $Apps = @(Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | ForEach-Object {
            @{ processo = $_.ProcessName; titulo = $_.MainWindowTitle; ram_mb = [math]::Round($_.WorkingSet64 / 1MB, 0) }
        } | Select-Object -First 25)

        $Payload = @{
            hostname = $Hostname; ip = $IpReal; usuario = $Usuario; entidade = "OU=COMPUTADORES,DC=CST,DC=LOCAL"
            tipo = "Desktop"; so = $SO; processador = ($Cpu.Name -replace "\s+", " ").Trim()
            cpu_uso = [int]$Cpu.LoadPercentage; ram_total = "$RamTot GB"; ram_uso = $RamUso
            disco_c_total = $DTot; disco_c_livre = $DLiv; disco_c_uso = $DUso; programas_abertos = $Apps; chamadas_n2p = @(Get-ChamadasNet2Phone $Usuario $Hostname)
        } | ConvertTo-Json -Depth 4 -Compress

        $Resp = Post-Json "$ServerUrl/api/agente/sync" $Payload
        Escrever-Log "Sync OK -> IP: $IpReal | Usuario: $Usuario"

        if ($Resp.auth_reqs) {
            foreach ($Auth in $Resp.auth_reqs) {
                Escrever-Log "Validando login AD para: $($Auth.usuario)"
                $ResAuth = Test-CredencialAD $Auth.usuario $Auth.senha
                $RetAuth = @{ id = $Auth.id; ok = $ResAuth.ok; ehTI = $ResAuth.ehTI; motivo = $ResAuth.motivo } | ConvertTo-Json -Compress
                Post-Json "$ServerUrl/api/agente/auth-resultado" $RetAuth | Out-Null
            }
        }

        if ($Resp.comandos) {
            foreach ($Cmd in $Resp.comandos) {
                Escrever-Log "Executando comando: $($Cmd.acao)"
                $Saida = switch ($Cmd.acao) {
                    "limpar_temp" { Remove-Item "$env:TEMP\*" -Recurse -Force; "Cache temporário limpo em $Hostname." }
                    "limpar_dns" { ipconfig /flushdns | Out-String }
                    "ping_google" { ping -n 4 8.8.8.8 | Out-String }
                    "reiniciar_spooler" { Restart-Service Spooler -Force; "Spooler reiniciado." }
                    "atualizar_gpo" { echo N | gpupdate /force /wait:0 | Out-String }
                    "listar_impressoras" { Get-Printer | Select-Object Name, PortName, PrinterStatus | Out-String }
                    default { "Ação '$($Cmd.acao)' executada em $Hostname." }
                }
                $Ret = @{ id = $Cmd.id; sucesso = $true; saida = ($Saida | Out-String) } | ConvertTo-Json -Compress
                Post-Json "$ServerUrl/api/agente/resultado" $Ret | Out-Null
            }
        }
    } catch {
        Escrever-Log "ERRO SYNC: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 2
}
