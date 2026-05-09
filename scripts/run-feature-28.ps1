# Test credentials are intentionally plain strings — these are local dev/CI accounts only.
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingPlainTextForPassword', 'TestPassword')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingPlainTextForPassword', 'CompletePassword')]
param(
    [ValidateSet("all", "01-auth-login", "02-start-workout", "03-settings-edit-name", "04-paywall", "05-program-complete")]
    [string]$Flow = "all",

    # Credentials for the main test account (flows 01-04).
    # Defaults are read from mobile/.maestro/maestro.env if the file exists.
    [string]$TestEmail,
    [string]$TestPassword,

    # Credentials for the program-complete test account (flow 05 only).
    # Defaults are read from mobile/.maestro/maestro.env if the file exists.
    [string]$CompleteEmail,
    [string]$CompletePassword,

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

function Get-ApiContainerState {
    $containerId = ((& docker compose ps -q api) -join "").Trim()
    if (-not $containerId) { return $null }

    $state = ((& docker inspect -f "{{.State.Status}} {{.State.ExitCode}}" $containerId) -join "").Trim()
    if ($LASTEXITCODE -ne 0) { return $null }
    return $state
}

function Wait-ApiHealth($Url, $TimeoutSeconds = 180) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastError = $null

    do {
        try {
            $response = Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 5
            if ($response.ok -eq $true) { return }
        } catch {
            $lastError = $_.Exception.Message
        }

        $state = Get-ApiContainerState
        if ($state -match "^(exited|dead) ") {
            Write-Host ""
            Write-Host "API container stopped while waiting for health. Recent logs:" -ForegroundColor Yellow
            & docker compose logs api --tail 80 | Out-Host
            throw "API container stopped before $Url became ready. Container state: $state"
        }

        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    Write-Host ""
    Write-Host "API did not become healthy. Recent logs:" -ForegroundColor Yellow
    & docker compose logs api --tail 80 | Out-Host
    Write-Host ""
    Write-Host "API container processes:" -ForegroundColor Yellow
    & docker compose exec -T api sh -lc "ps -ef" | Out-Host

    if ($lastError) {
        throw "Timed out waiting for $Url. Last error: $lastError"
    }
    throw "Timed out waiting for $Url"
}

function Wait-AdbDevice($TimeoutSeconds = 120) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $devices = (& adb devices | Select-String "emulator.*device$")
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

function Escape-SqlLiteral($Value) {
    return [string]$Value -replace "'", "''"
}

function Invoke-Psql($Sql) {
    & docker compose exec -T db psql -U app -d app -v ON_ERROR_STOP=1 -c $Sql | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "psql command failed" }
}

function Set-TestUserSubscription($Email, $Status) {
    $safeEmail = Escape-SqlLiteral $Email
    if ($Status -eq "expired") {
        Invoke-Psql "UPDATE app_user SET subscription_status = 'expired', trial_expires_at = now() - interval '1 day', subscription_expires_at = NULL WHERE lower(email) = lower('$safeEmail');"
        return
    }

    if ($Status -eq "trialing") {
        Invoke-Psql "UPDATE app_user SET subscription_status = 'trialing', trial_expires_at = now() + interval '14 days', subscription_expires_at = NULL WHERE lower(email) = lower('$safeEmail');"
        return
    }

    throw "Unsupported subscription status: $Status"
}

function Invoke-JsonPost($Uri, $Body, $Headers = @{}) {
    $json = $Body | ConvertTo-Json -Depth 12
    return Invoke-RestMethod -Method Post -Uri $Uri -Headers $Headers -ContentType "application/json" -Body $json -TimeoutSec 120
}

# Provisions the main test account (flows 01-04): Strength Block, multi-day program.
function Initialize-TestUserAndProgram($ApiBaseUrl, $EngineKey) {
    Step "Ensuring main test account ($TestEmail) and Strength Block exist"

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

    Set-TestUserSubscription $TestEmail "trialing"
    Invoke-Psql "UPDATE program SET program_title = 'Strength Block', status = 'active', is_primary = true WHERE id = '$programId';"
}

# Provisions the complete-program test account (flow 05): 1-day program scheduled for today.
function Initialize-CompleteUserAndProgram($ApiBaseUrl, $EngineKey) {
    Step "Ensuring complete-flow test account ($CompleteEmail) and Final Block exist"

    $loginBody = @{ email = $CompleteEmail; password = $CompletePassword }
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
                throw "$CompleteEmail already exists locally, but not with the expected password."
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
    preferred_days = ARRAY['mon'],
    minutes_per_session = 45,
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

    if (-not $programId) { throw "Could not resolve or generate an active program for $CompleteEmail." }

    # Trim to one day scheduled for today so TodayScreen shows "Start Workout" and
    # getProgramEndCheck returns isLastScheduledDayComplete: true after completion.
    Invoke-Psql "WITH keep AS (SELECT id FROM program_day WHERE program_id = '$programId' ORDER BY week_number ASC, day_number ASC LIMIT 1) DELETE FROM program_day WHERE program_id = '$programId' AND id NOT IN (SELECT id FROM keep);"
    Invoke-Psql "WITH keep AS (SELECT id FROM program_calendar_day WHERE program_id = '$programId' ORDER BY week_number ASC, global_day_index ASC LIMIT 1) DELETE FROM program_calendar_day WHERE program_id = '$programId' AND id NOT IN (SELECT id FROM keep);"
    Invoke-Psql "UPDATE program_day SET scheduled_date = CURRENT_DATE, week_number = 1 WHERE program_id = '$programId';"
    Invoke-Psql "UPDATE program_calendar_day SET scheduled_date = CURRENT_DATE, scheduled_weekday = to_char(CURRENT_DATE, 'Dy'), week_number = 1 WHERE program_id = '$programId';"
    Invoke-Psql "UPDATE program SET program_title = 'Final Block', status = 'active', is_primary = true WHERE id = '$programId';"

    Write-Host "Final Block ready: 1 training day scheduled for $(Get-Date -Format 'yyyy-MM-dd')"
}

# ---------------------------------------------------------------------------
# Resolve credentials: params > maestro.env > hardcoded defaults
# ---------------------------------------------------------------------------
$maestroEnvPath = Join-Path $mobileDir ".maestro\maestro.env"
if (-not $TestEmail)        { $TestEmail        = Read-DotEnvValue $maestroEnvPath "TEST_EMAIL" }
if (-not $TestPassword)     { $TestPassword     = Read-DotEnvValue $maestroEnvPath "TEST_PASSWORD" }
if (-not $CompleteEmail)    { $CompleteEmail    = Read-DotEnvValue $maestroEnvPath "E2E_COMPLETE_EMAIL" }
if (-not $CompletePassword) { $CompletePassword = Read-DotEnvValue $maestroEnvPath "E2E_COMPLETE_PASSWORD" }

if (-not $TestEmail)        { $TestEmail        = "e2e@example.com" }
if (-not $TestPassword)     { $TestPassword     = "E2ePass123!" }
if (-not $CompleteEmail)    { $CompleteEmail    = "e2e-complete@example.com" }
if (-not $CompletePassword) { $CompletePassword = "E2eComplete123!" }

# ---------------------------------------------------------------------------
# Infrastructure setup
# ---------------------------------------------------------------------------
Set-Location $repoRoot

Step "Starting local API services"
& docker compose up -d db api | Out-Host
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

# EXPO_PUBLIC_API_BASE_URL is set to the LAN IP so the mobile app on the emulator
# can reach the host, but this script runs on the host itself and must use localhost.
$apiBaseUrl = "http://localhost:3000"

$engineKey = Read-DotEnvValue (Join-Path $repoRoot "api\.env") "ENGINE_KEY"
if (-not $engineKey) { throw "ENGINE_KEY not found in api/.env" }

Wait-ApiHealth "$apiBaseUrl/health" 600
Write-Host "API ready at $apiBaseUrl"

Step "Checking Android emulator"
# Start the ADB daemon explicitly. No 2>&1 - in PS 5.1 that wraps every stderr
# line as an ErrorRecord and triggers Stop. Without it, stderr prints as plain text.
& adb start-server | Out-Null
$hasDevice = (& adb devices | Select-String "emulator.*device$")
if (-not $hasDevice) {
    if (-not $AvdName) {
        $avds = @(& emulator -list-avds | Where-Object { $_ -match '\S' })
        if (-not $avds) {
            throw "No AVDs found. Create an API 34 AVD in Android Studio first."
        }
        # Pick the first AVD whose config.ini targets android-34.
        foreach ($avd in $avds) {
            $cfgPath = Join-Path $env:USERPROFILE ".android\avd\$avd.avd\config.ini"
            if ((Test-Path $cfgPath) -and (Select-String -Path $cfgPath -Pattern "android-34" -Quiet)) {
                $AvdName = $avd
                break
            }
        }
        if (-not $AvdName) {
            throw "No API 34 AVD found. Available AVDs: $($avds -join ', '). Create an Android 14 / API 34 AVD in Android Studio."
        }
        Write-Host "No emulator running - auto-starting '$AvdName'."
    }

    Start-Process -FilePath "emulator" -ArgumentList @("-avd", $AvdName)
    Wait-AdbDevice
}

$sdk = Get-FirstLine { adb shell getprop ro.build.version.sdk }
$release = Get-FirstLine { adb shell getprop ro.build.version.release }
if ($sdk -ne "34") {
    throw "E2E flows should run on Android 14 / API 34. Current emulator is Android $release / API $sdk."
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

Step "Starting Metro on port 8081 (E2E: REACT_NATIVE_PACKAGER_HOSTNAME=10.0.2.2)"
New-Item -ItemType Directory -Force $logsDir | Out-Null
$metroLog = Join-Path $logsDir "feature28-metro.log"
# Always restart Metro so it uses the emulator-compatible hostname, not whatever
# REACT_NATIVE_PACKAGER_HOSTNAME is set to in .env.local (typically the LAN IP).
$existing = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    $existing | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Write-Host "Stopped existing process on port 8081."
}
# 10.0.2.2 is the Android emulator's loopback alias for the host machine.
# Without --localhost, Metro binds to 0.0.0.0 so the emulator can reach it via 10.0.2.2.
$metroCommand = "Set-Location '$mobileDir'; `$env:REACT_NATIVE_PACKAGER_HOSTNAME='10.0.2.2'; `$env:EXPO_PUBLIC_API_BASE_URL='http://10.0.2.2:3000'; npx.cmd expo start --dev-client --port 8081 *> '$metroLog'"
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $metroCommand) -WindowStyle Hidden
Wait-Port 8081
Write-Host "Metro started. Log: $metroLog"

# ---------------------------------------------------------------------------
# Provisioning
# ---------------------------------------------------------------------------
$flows = if ($Flow -eq "all") {
    @("01-auth-login", "02-start-workout", "03-settings-edit-name", "04-paywall", "05-program-complete")
} else {
    @($Flow)
}

Initialize-TestUserAndProgram $apiBaseUrl $engineKey

if ($flows -contains "05-program-complete") {
    Initialize-CompleteUserAndProgram $apiBaseUrl $engineKey
}

# ---------------------------------------------------------------------------
# Run flows
# ---------------------------------------------------------------------------
Step "Running E2E flow(s): $($flows -join ', ')"

foreach ($name in $flows) {
    $email    = if ($name -eq "05-program-complete") { $CompleteEmail }    else { $TestEmail }
    $password = if ($name -eq "05-program-complete") { $CompletePassword } else { $TestPassword }

    if ($name -eq "04-paywall") {
        Step "Expiring main test account for paywall flow"
        Set-TestUserSubscription $TestEmail "expired"
    }

    Step "Flow: $name  ($email)"
    & (Join-Path $repoRoot "mobile\.maestro\run.ps1") $name -e "TEST_EMAIL=$email" -e "TEST_PASSWORD=$password"
    if ($LASTEXITCODE -ne 0) { throw "Maestro flow failed: $name" }
}

Write-Host ""
Write-Host "All E2E flows passed." -ForegroundColor Green
