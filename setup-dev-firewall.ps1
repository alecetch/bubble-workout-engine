# setup-dev-firewall.ps1
# Run as Administrator. Creates inbound firewall rules for local dev.

$ErrorActionPreference = "Stop"

function Assert-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent() `
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
        Write-Host "Tip: In VS Code terminal, open an elevated PowerShell (Run as Administrator) or run from an Admin PowerShell window."
        exit 1
    }
}

function Upsert-FirewallRule {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [Parameter(Mandatory=$true)][int]$Port
    )

    # Remove any existing rule with the same display name (keeps re-runs clean)
    $existing = Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
    if ($existing) {
        Remove-NetFirewallRule -DisplayName $Name | Out-Null
    }

    New-NetFirewallRule `
        -DisplayName $Name `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port `
        -Profile Any | Out-Null

    Write-Host "Allowed TCP $Port ($Name)" -ForegroundColor Green
}

Assert-Admin

Write-Host "Configuring Windows Firewall rules for dev..." -ForegroundColor Cyan

# Your stack ports
Upsert-FirewallRule -Name "Dev - Docker API 3000"     -Port 3000
Upsert-FirewallRule -Name "Dev - Postgres 5432"       -Port 5432   # optional (only if you connect from another device)
Upsert-FirewallRule -Name "Dev - Expo Metro 8081"     -Port 8081
Upsert-FirewallRule -Name "Dev - Expo 19000"          -Port 19000
Upsert-FirewallRule -Name "Dev - Expo 19001"          -Port 19001
Upsert-FirewallRule -Name "Dev - Expo DevTools 19002" -Port 19002

Write-Host "Done." -ForegroundColor Cyan