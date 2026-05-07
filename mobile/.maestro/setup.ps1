# Run this once after every emulator cold boot, before running Maestro tests.
# Usage: .\mobile\.maestro\setup.ps1

Write-Host "Setting up Maestro E2E environment..."

# 1. Verify emulator is connected
$devices = adb devices 2>&1 | Select-String "emulator"
if (-not $devices) {
    Write-Error "No emulator found. Start the emulator first, then re-run this script."
    exit 1
}
Write-Host "  [OK] Emulator connected"

# 2. Reverse Metro port
adb reverse tcp:8081 tcp:8081 | Out-Null
Write-Host "  [OK] adb reverse tcp:8081 tcp:8081"

# 3. Extract and install Maestro driver APKs
$jar = "$env:USERPROFILE\.maestro\maestro\lib\maestro-client.jar"
$unzip = "C:\Program Files\Git\usr\bin\unzip.exe"

if (-not (Test-Path $unzip)) {
    Write-Error "unzip not found at $unzip. Install Git for Windows or adjust the path."
    exit 1
}

Push-Location $env:TEMP
& $unzip -o $jar "maestro-server.apk" "maestro-app.apk" | Out-Null
adb install -r maestro-server.apk | Out-Null
adb install -r maestro-app.apk | Out-Null
Pop-Location
Write-Host "  [OK] Maestro driver APKs installed"

Write-Host ""
Write-Host "Ready. Make sure Metro is running, then:"
Write-Host "  maestro test mobile/.maestro/01-auth-login.yaml -e TEST_EMAIL=... -e TEST_PASSWORD=..."
