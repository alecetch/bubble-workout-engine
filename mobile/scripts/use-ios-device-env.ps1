$ErrorActionPreference = "Stop"

$mobileRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$source = Join-Path $mobileRoot ".env.ios-device"
$target = Join-Path $mobileRoot ".env.local"

if (-not (Test-Path $source)) {
    throw "Missing iOS device env file: $source"
}

Copy-Item -LiteralPath $source -Destination $target -Force
Write-Host "Copied .env.ios-device to .env.local"
Write-Host "Restart Expo with: cd mobile; npx expo start -c --go --lan"
Write-Host "Use --tunnel only if LAN is blocked; Expo tunnel currently depends on external ngrok service health/limits."
