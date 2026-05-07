param(
    [ValidateSet("all", "01-auth-login", "02-start-workout")]
    [string]$Flow = "all",

    [string]$TestEmail = "testuser@example.com",
    [string]$TestPassword = "TestPass123!",
    [string]$AvdName = $env:FEATURE28_AVD
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$mobileDir = Join-Path $repoRoot "mobile"
$logsDir = Join-Path $repoRoot "logs"

function Step($Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Read-DotEnvValue($Path, $Name) {
    if (-not (Test-Path $Path)) { return $null }

    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $parts = $trimmed.Split("=", 2)
        if ($parts.Count -eq 2 -and $parts[0].Trim() -eq $Name) {
            return $parts[1].Trim().Trim('"').Trim("'")
        }
    }

    return $null
}

function Wait-HttpOk($Url, $TimeoutSeconds = 90) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 5
            if ($response.ok -eq $true) { return }
        } catch {
            Start-Sleep -Seconds 2
        }
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for $Url"
}

function Wait-AdbDevice($TimeoutSeconds = 120) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $devices = (& adb devices 2>&1 | Select-String "emulator.*device$")
        if ($devices) { return }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for an Android emulator. Start a Pixel API 34 emulator, or pass -AvdName <name>."
}

function Get-FirstLine($ScriptBlock) {
    return ((& $ScriptBlock 2>&1 | Select-Object -First 1) -join "").Trim()
}

function Wait-Port($Port, $TimeoutSeconds = 90) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listener) { return }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for localhost:$Port"
}

function Invoke-Psql($Sql) {
    & docker compose exec -T db psql -U app -d app -v ON_ERROR_STOP=1 -c $Sql | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "psql command failed" }
}

function Invoke-JsonPost($Uri, $Body, $Headers = @{}) {
    $json = $Body | ConvertTo-Json -Depth 12
    return Invoke-RestMethod -Method Post -Uri $Uri -Headers $Headers -ContentType "application/json" -Body $json -TimeoutSec 120
}

function Ensure-TestUserAndProgram($ApiBaseUrl, $EngineKey) {
    Step "Ensuring local Feature 28 test account and Strength Block exist"

    $loginBody = @{ email = $TestEmail; password = $TestPassword }
    $auth = $null

    try {
        $auth = Invoke-JsonPost "$ApiBaseUrl/api/auth/login" $loginBody
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
        if ($status -ne 401) { throw }

        try {
            $auth = Invoke-JsonPost "$ApiBaseUrl/api/auth/register" $loginBody
        } catch {
            $registerStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            if ($registerStatus -eq 409) {
                throw "$TestEmail already exists locally, but not with the expected password."
            }
            throw
        }
    }

    $userId = $auth.user_id
    $profileId = $auth.client_profile_id
    if (-not $userId -or -not $profileId) {
        throw "Auth response did not include user_id and client_profile_id."
    }

    $profileSql = @"
UPDATE client_profile
SET main_goals_slugs = ARRAY['strength'],
    fitness_level_slug = 'intermediate',
    fitness_rank = 1,
    equipment_preset_slug = 'commercial_gym',
    equipment_items_slugs = ARRAY['barbell','dumbbell','bench','rack','cable','lat_pulldown','leg_press'],
    preferred_days = ARRAY['mon','wed','fri'],
    minutes_per_session = 60,
    height_cm = 180,
    weight_kg = 80,
    sex = 'male',
    age_range = '30-39',
    program_type_slug = 'strength',
    onboarding_step_completed = 3,
    onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
    anchor_lifts_skipped = true,
    updated_at = now()
WHERE id = '$profileId';
"@
    Invoke-Psql $profileSql

    $programs = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/api/programs/active" -Headers @{
        Authorization = "Bearer $($auth.access_token)"
    } -TimeoutSec 30

    $programId = $null
    if ($programs.programs -and $programs.programs.Count -gt 0) {
        $programId = $programs.programs[0].program_id
    } else {
        $generated = Invoke-JsonPost "$ApiBaseUrl/generate-plan-v2" @{
            user_id = $userId
            client_profile_id = $profileId
            programType = "strength"
            anchor_date_ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        } @{ "x-engine-key" = $EngineKey }
        $programId = $generated.program_id
    }

    if (-not $programId) { throw "Could not resolve or generate an active program for $TestEmail." }

    Invoke-Psql "UPDATE program SET program_title = 'Strength Block', status = 'active', is_primary = true WHERE id = '$programId';"
}

Set-Location $repoRoot

Step "Starting local API services"
& docker compose up -d db api | Out-Host
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

$apiBaseUrl = Read-DotEnvValue (Join-Path $mobileDir ".env.local") "EXPO_PUBLIC_API_BASE_URL"
if (-not $apiBaseUrl) {
    $apiBaseUrl = Read-DotEnvValue (Join-Path $mobileDir ".env") "EXPO_PUBLIC_API_BASE_URL"
}
if (-not $apiBaseUrl) { $apiBaseUrl = "http://localhost:3000" }

$engineKey = Read-DotEnvValue (Join-Path $repoRoot "api\.env") "ENGINE_KEY"
if (-not $engineKey) { throw "ENGINE_KEY not found in api/.env" }

Wait-HttpOk "$apiBaseUrl/health"
Write-Host "API ready at $apiBaseUrl"

Step "Checking Android emulator"
$hasDevice = (& adb devices 2>&1 | Select-String "emulator.*device$")
if (-not $hasDevice) {
    if (-not $AvdName) {
        Write-Host "No emulator is running. Available AVDs:"
        & emulator -list-avds | Out-Host
        throw "Start a Pixel Android 14 / API 34 emulator, or rerun with -AvdName <name>."
    }

    Write-Host "Starting emulator '$AvdName'..."
    Start-Process -FilePath "emulator" -ArgumentList @("-avd", $AvdName)
    Wait-AdbDevice
}

$sdk = Get-FirstLine { adb shell getprop ro.build.version.sdk }
$release = Get-FirstLine { adb shell getprop ro.build.version.release }
if ($sdk -ne "34") {
    throw "Feature 28 should run on Android 14 / API 34. Current emulator is Android $release / API $sdk."
}
Write-Host "Emulator ready: Android $release / API $sdk"

Step "Ensuring Expo dev client is installed"
$package = (& adb shell pm list packages com.bubbleworkout.mobile 2>&1 | Select-String "com.bubbleworkout.mobile")
if (-not $package) {
    $apk = Join-Path $mobileDir "android\app\build\outputs\apk\debug\app-debug.apk"
    if (-not (Test-Path $apk)) {
        Step "Debug APK missing; building dev client"
        Push-Location $mobileDir
        & npx.cmd expo run:android
        $buildExit = $LASTEXITCODE
        Pop-Location
        if ($buildExit -ne 0) { throw "expo run:android failed" }
    } else {
        & adb install -r $apk | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "adb install failed" }
    }
}

Step "Starting Metro on port 8081 if needed"
New-Item -ItemType Directory -Force $logsDir | Out-Null
$metroLog = Join-Path $logsDir "feature28-metro.log"
$metroListener = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
if (-not $metroListener) {
    $metroCommand = "Set-Location '$mobileDir'; npx.cmd expo start --dev-client --localhost --port 8081 *> '$metroLog'"
    Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $metroCommand) -WindowStyle Hidden
    Wait-Port 8081
    Write-Host "Metro started. Log: $metroLog"
} else {
    Write-Host "Metro already listening on port 8081"
}

Ensure-TestUserAndProgram $apiBaseUrl $engineKey

Step "Running Maestro Feature 28 flow(s)"
$flows = if ($Flow -eq "all") { @("01-auth-login", "02-start-workout") } else { @($Flow) }
if ($flows -contains "01-auth-login") {
    Step "Clearing app state for login flow"
    & adb shell pm clear com.bubbleworkout.mobile | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Failed to clear app state before login flow" }
}
foreach ($name in $flows) {
    & (Join-Path $repoRoot "mobile\.maestro\run.ps1") $name -e "TEST_EMAIL=$TestEmail" -e "TEST_PASSWORD=$TestPassword"
    if ($LASTEXITCODE -ne 0) { throw "Maestro flow failed: $name" }
}

Write-Host ""
Write-Host "Feature 28 complete." -ForegroundColor Green
