# PowerShell Command Reference — Bubble Workout Engine

## Docker Compose

### Daily workflow
```powershell
# Start all services (detached)
docker compose up -d

# Start with a fresh rebuild (e.g. after Dockerfile or dependency changes)
docker compose up -d --build

# Stop all services
docker compose down

# Stop and wipe volumes (nuclear — destroys DB data, MinIO data)
docker compose down -v

# View logs (all services)
docker compose logs -f

# View logs for a specific service
docker compose logs -f api
docker compose logs -f db
docker compose logs -f flyway

```

### API container
```powershell
# Restart the API (picks up env changes; does NOT reload volume mounts)
docker compose restart api

# Force-recreate the API (reloads volume mounts, env vars — resets in-memory profiles)
docker compose up -d --force-recreate api

# Open a shell inside the API container
docker compose exec api sh

# Run a one-off Node script inside the API container
docker compose exec api node scripts/dev_reset_program_data.mjs
```

### Rebuild / clean
```powershell
# Remove stopped containers (keep volumes)
docker compose rm -f

# Remove a specific service's container
docker compose rm -f api

# Prune unused Docker images (free up disk space)
docker image prune -f

# Full nuclear clean: stop, remove containers + volumes + orphans
docker compose down -v --remove-orphans
```

---

## Flyway Migrations

> **Note:** In this project, the working command is `docker compose run --rm flyway` (no `migrate` subcommand). The migrate command is baked into the Docker Compose service definition.

```powershell
# Run pending migrations (versioned V__ and repeatable R__ that changed)
#docker compose --profile tools run --rm flyway # try the next line instead
docker compose --profile tools up flyway

# Check migration status / history
docker compose --profile tools run --rm flyway info

# Validate migrations without running them
docker compose --profile tools run --rm flyway validate

# Repair the flyway_schema_history table (fix failed migrations)
docker compose --profile tools run --rm flyway repair
```

> Repeatable migrations (`R__*.sql`) re-run whenever their checksum changes.
> Versioned migrations (`V__*.sql`) only run once.

---

## PostgreSQL

### Connect via psql (inside the db container)
```powershell
# Open a psql session
docker compose exec db psql -U app -d app

# Run a quick one-liner query
docker compose exec db psql -U app -d app -c "SELECT * FROM flyway_schema_history ORDER BY installed_rank;"

# Dump the database to a file
docker compose exec db pg_dump -U app app > backup.sql

# Restore a dump
Get-Content backup.sql | docker compose exec -T db psql -U app app
```

### Useful psql commands (run inside psql session)
```sql
\dt                          -- list tables
\d workout_segment           -- describe table
\dn                          -- list schemas
SELECT version();            -- postgres version
SELECT current_database();   -- confirm which DB you're in

-- Check current schema version
SELECT version, description, installed_on FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;

-- Check row counts
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;
```

---

## API (Node / Express)

```powershell
# Install dependencies (run inside api/ directory)
cd api
npm ci

# Start the API server locally (outside Docker)
npm start

# Run tests
npm test

# Run a specific test file
node --test src/tests/myTest.test.js

# Import scripts
node scripts/dev_reset_program_data.mjs
node scripts/importExerciseCatalogueFromCsv.js
node scripts/import_bubble_exports.mjs
npm run qa:history
npm run qa:seeds
```

---

## Expo (Mobile)

All commands run from the `mobile/` directory.

```powershell
cd mobile

# Start the Expo dev server (tunnel mode — good for physical devices on any network)
npx expo start --tunnel

# Start targeting iOS simulator
npx expo start --ios

# Start targeting Android emulator
npx expo start --android

# Clear Metro cache and start fresh
npx expo start -c

# Install dependencies
npm install

# Check for dependency issues
npx expo-doctor

# Upgrade Expo SDK
npx expo install expo@latest

# Run TypeScript type-check
npx tsc --noEmit
```

---

## EAS (Expo Application Services)

All commands run from the `mobile/` directory.

```powershell
cd mobile

# Log in to EAS
eas login

# Check current logged-in account
eas whoami

# Configure EAS for this project (first time)
eas build:configure

# Create a development build (installs on device, enables dev features)
eas build --profile development --platform ios
eas build --profile development --platform android

# Create a preview build (internal distribution)
eas build --profile preview --platform ios
eas build --profile preview --platform android

# Create a production build
eas build --profile production --platform all

# List recent builds
eas build:list

# Submit a build to the App Store / Play Store
eas submit --platform ios
eas submit --platform android

# Publish an OTA update (no new build required)
eas update --channel production --message "Fix: HYROX program type routing"

# List OTA update channels
eas channel:list

# View update history for a channel
eas update:list --channel production
```

---

## Git

```powershell
# Status / diff
git status
git diff
git diff --staged

# Stage and commit
git add -p                          # interactive staging (review hunks)
git commit -m "your message"

# Branch management
git branch                          # list local branches
git branch -a                       # list all branches (including remote)
git checkout -b feature/my-branch   # create and switch to new branch
git checkout main                   # switch to main
git branch -d feature/my-branch     # delete branch (safe — won't delete unmerged)

# Sync with remote
git fetch origin
git pull origin main
git push origin HEAD                # push current branch
git push -u origin feature/my-branch  # push and set upstream

# Rebase / merge
git rebase main                     # rebase current branch onto main
git merge --no-ff feature/my-branch # merge with a merge commit

# Undo things (safe)
git restore <file>                  # discard unstaged changes to a file
git restore --staged <file>         # unstage a file (keep changes)
git revert HEAD                     # create a new commit that undoes the last commit

# Stash
git stash                           # stash uncommitted changes
git stash pop                       # restore most recent stash
git stash list                      # list all stashes

# Log / inspect
git log --oneline -20               # last 20 commits, compact
git log --oneline --graph --all     # visual branch graph
git show HEAD                       # show last commit diff
git blame <file>                    # see who changed each line

# GitHub CLI
gh pr create                        # open PR creation wizard
gh pr list                          # list open PRs
gh pr checkout 123                  # check out PR #123 locally
gh pr merge 123 --squash            # merge PR with squash
gh issue list                       # list issues
```

---

## Fly.io (Production Deployment)

```powershell
# Authenticate
fly auth login

# Check current app status
fly status

# Deploy to production
fly deploy

# Deploy a specific service (if using multi-app setup)
fly deploy --app bubble-workout-api

# View live logs
fly logs
fly logs --app bubble-workout-api

# Open an SSH session into a running machine
fly ssh console

# Run a one-off command on a machine
fly ssh console -C "node scripts/check_seeds.mjs"

# Scale machines
fly scale count 2                   # run 2 instances
fly scale vm shared-cpu-1x          # change VM size

# Manage secrets (env vars)
fly secrets list
fly secrets set SOME_KEY=some_value
fly secrets unset SOME_KEY

# Manage Postgres (if using Fly Postgres)
fly postgres connect -a my-pg-app
fly postgres backup list -a my-pg-app

# Check releases / deployment history
fly releases
fly releases --image                # include Docker image hashes
```

---

## MinIO

```powershell
# Access MinIO web console
# http://localhost:9001  (user: minioadmin / pass: minioadmin)

# Open a shell into the minio container
docker compose exec minio sh

# List buckets via mc (inside the container or using mc locally)
docker compose exec minio-init mc ls local/

# List contents of the media-assets bucket
docker compose exec minio-init mc ls --recursive local/media-assets/

# Copy a file into the bucket
docker compose exec minio-init mc cp /path/to/file.png local/media-assets/program_day/file.png

# Re-seed MinIO from local assets
docker compose run --rm minio-seed
```

---

## Windows / PowerShell Utilities

```powershell
# Find what's using a port (e.g. 3000)
netstat -ano | Select-String ":3000"
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess

# Kill a process by PID
Stop-Process -Id <PID> -Force

# Set an environment variable for the current session
$env:MY_VAR = "value"

# Read an env file into the current session
Get-Content api/.env | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim())
  }
}

# Watch a file for changes (tail -f equivalent)
Get-Content -Path api/logs/app.log -Wait

# Find a string in files recursively
Select-String -Path "api/**/*.js" -Pattern "GOAL_TO_PROGRAM_TYPE" -Recurse

# Check Node / npm versions
node --version
npm --version

# Check Docker version
docker --version
docker compose version
```
