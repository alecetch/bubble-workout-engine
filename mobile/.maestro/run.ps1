# Wrapper for running Maestro E2E tests.
# Reinstalls the driver APKs before every run (Maestro uninstalls them at session end).
#
# Usage:
#   .\mobile\.maestro\run.ps1 01-auth-login   -e TEST_EMAIL=you@example.com -e TEST_PASSWORD=Pass123!
#   .\mobile\.maestro\run.ps1 02-start-workout -e TEST_EMAIL=you@example.com -e TEST_PASSWORD=Pass123!
#   .\mobile\.maestro\run.ps1                  -e TEST_EMAIL=you@example.com -e TEST_PASSWORD=Pass123!
#
# Prerequisites: emulator running, Metro running on port 8081.

$ErrorActionPreference = "Stop"

# If first arg doesn't start with "-" treat it as the flow name; rest pass through to maestro
$allArgs = $args
if ($allArgs.Count -gt 0 -and -not ([string]$allArgs[0]).StartsWith("-")) {
    $flowName    = [string]$allArgs[0]
    $maestroArgs = if ($allArgs.Count -gt 1) { $allArgs[1..($allArgs.Count - 1)] } else { @() }
} else {
    $flowName    = ""
    $maestroArgs = $allArgs
}

$jar   = "$env:USERPROFILE\.maestro\maestro\lib\maestro-client.jar"
$unzip = "C:\Program Files\Git\usr\bin\unzip.exe"

if (-not $env:MAESTRO_CLI_NO_ANALYTICS) {
    $env:MAESTRO_CLI_NO_ANALYTICS = "1"
}

function Invoke-BestEffort {
    param([scriptblock]$Command)

    try {
        & $Command 2>&1 | Out-Null
    } catch {
        # Best-effort cleanup is allowed to be a no-op.
    }
    $global:LASTEXITCODE = 0
}

# 1. Verify emulator
$devices = & adb devices 2>&1 | Select-String "emulator.*device$"
if (-not $devices) {
    Write-Error "No emulator detected. Start the emulator first."
    exit 1
}

# 2. Verify Android API level
$androidSdkRaw = ((& adb shell getprop ro.build.version.sdk 2>&1 | Select-Object -First 1) -join "").Trim()
$androidRelease = ((& adb shell getprop ro.build.version.release 2>&1 | Select-Object -First 1) -join "").Trim()
$androidSdk = 0
if ([int]::TryParse($androidSdkRaw, [ref]$androidSdk) -and $androidSdk -gt 34 -and -not $env:MAESTRO_ALLOW_UNSUPPORTED_ANDROID) {
    Write-Error "This emulator is Android $androidRelease / API $androidSdk. Maestro local Android support is currently reliable on API 29, 30, 31, 33, and 34. Create or start an API 34 emulator, or set MAESTRO_ALLOW_UNSUPPORTED_ANDROID=1 to try this unsupported image anyway."
    exit 1
}

# 3. Reverse Metro port
& adb reverse tcp:8081 tcp:8081 | Out-Null

# 4. Clear stale Maestro driver state.
#    A failed run can leave the old instrumentation active or a stale host forward
#    on tcp:7001, which makes Maestro time out while waiting for its Android driver.
Invoke-BestEffort { adb forward --remove tcp:7001 }
Invoke-BestEffort { adb shell am force-stop dev.mobile.maestro }
Invoke-BestEffort { adb shell am force-stop dev.mobile.maestro.test }

# 5. Reinstall Maestro driver APKs.
#    Maestro uninstalls its driver APKs at session end (even on failure) as part of teardown.
#    That teardown also kills any running instrumentation. We do NOT pre-launch or force-stop
#    the app here: force-stop sets the Android STOPPED flag which prevents Maestro's own
#    `am instrument` from starting in awaitLaunch. The app is intentionally not running when
#    `maestro test` begins -- Maestro's session init starts it cleanly via am instrument.
if (-not (Test-Path $unzip)) {
    Write-Error "unzip not found at $unzip. Install Git for Windows."
    exit 1
}
Push-Location $env:TEMP
& $unzip -o $jar "maestro-server.apk" "maestro-app.apk" | Out-Null
$r1 = & adb install -r -t maestro-server.apk 2>&1; Write-Host "  server: $r1"
$r2 = & adb install -r -t maestro-app.apk    2>&1; Write-Host "  app:    $r2"
Pop-Location

# Verify both packages landed on the device
$pkgs = & adb shell pm list packages 2>&1 | Select-String "maestro"
Write-Host "  Installed maestro packages: $pkgs"
if (-not $pkgs) {
    Write-Error "Maestro driver APKs did not install. Check the output above."
    exit 1
}

Write-Host "Driver APKs installed. Starting Maestro..."

# 6. Run the flow(s)
$target = if ($flowName) { "mobile/.maestro/$flowName.yaml" } else { "mobile/.maestro/" }
& maestro test $target @maestroArgs
exit $LASTEXITCODE
