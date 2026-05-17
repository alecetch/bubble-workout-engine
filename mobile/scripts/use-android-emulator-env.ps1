$ErrorActionPreference = "Stop"

$mobileRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$source = Join-Path $mobileRoot ".env.android-emulator"
$target = Join-Path $mobileRoot ".env.local"

if (-not (Test-Path $source)) {
    throw "Missing Android emulator env file: $source"
}

Copy-Item -LiteralPath $source -Destination $target -Force
Write-Host "Copied .env.android-emulator to .env.local"
Write-Host "Restart Expo with: cd mobile; npx expo start -c --go --lan"
