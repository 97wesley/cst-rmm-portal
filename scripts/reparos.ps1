
param (
    [Parameter(Mandatory=$true)]
    [string]$Acao
)

switch ($Acao) {
    "limpar_cache" {
        Write-Host "Iniciando limpeza de cache do usuário..."
        # Limpa arquivos temporários do usuário atual
        Remove-Item -Path "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path "C:\Windows\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cache limpo com sucesso!"
    }
    
    "destravar_impressora" {
        Write-Host "Reiniciando serviço de spooler de impressão..."
        Stop-Service -Name Spooler -Force -ErrorAction SilentlyContinue
        Remove-Item -Path "$env:systemroot\System32\spool\printers\*" -Recurse -Force -ErrorAction SilentlyContinue
        Start-Service -Name Spooler
        Write-Host "Spooler de impressão reiniciado com sucesso!"
    }
    
    default {
        Write-Host "Ação desconhecida."
        exit 1
    }
}
