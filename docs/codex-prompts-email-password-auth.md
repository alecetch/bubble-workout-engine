# Codex Prompts — Email / Password Authentication

Implements Option B from the auth architecture review: replace the device-identity
dev login with a real email/password credential flow, JWT-based session management,
and secure token storage on mobile.

## Scope

- Email + password registration and login
- Short-lived JWT access token + rotatable refresh token
- New `requireAuth` middleware replacing `requireInternalToken` on user-facing routes
- Mobile: `LoginScreen`, `RegisterScreen`, secure token storage, auto-refresh
- No email verification in this scope (can be added later)
- No password reset flow in this scope (`ResetPasswordScreen` already exists as a stub)
- No OAuth / social login in this scope

## Prompt sequence

- AUTH-0: Fix the immediate `bubble_client_profile_id` bug in `handleUsersMe`
- AUTH-A: DB migrations and API dependencies
- AUTH-B: Auth service (register, login, token issue, refresh, logout)
- AUTH-C: Auth routes (`POST /api/auth/register`, `/login`, `/refresh`, `/logout`)
- AUTH-D: `requireAuth` JWT middleware + protect user-facing routes
- AUTH-E: Mobile — token storage module and API client update
- AUTH-F: Mobile — `LoginScreen` and `RegisterScreen`
- AUTH-G: Mobile — `AuthNavigator` and `WelcomeLoginScreen` wiring

---

## Prompt AUTH-0 — Fix handleUsersMe residual Bubble column reference

```
You are working in api/server.js of a Node/Express API (ESM modules).

## Context

The PATCH /users/me route handler (handleUsersMe) contains inline SQL that
references a column that was dropped from the schema in migration V30:

  WHERE id::text = $2 OR bubble_client_profile_id = $2

bubble_client_profile_id no longer exists. This causes a PostgreSQL
"column does not exist" error whenever a clientProfileId is provided
in the request body, producing a 500 response.

## Task

In api/server.js, find the UPDATE client_profile statement inside handleUsersMe
(around line 519-526). Update the WHERE clause:

  FROM: WHERE id::text = $2 OR bubble_client_profile_id = $2
  TO:   WHERE id::text = $2

Do not change anything else in this file.

## Verification

  cd api && node --check server.js
  # Must succeed

  cd api && npm test -- --test-concurrency=1
  # Must pass
```

---

## Prompt AUTH-A — DB migrations and API dependencies

```
You are working in the api/ directory and migrations/ directory of a
Node/Express API backed by PostgreSQL, managed with Flyway.

## Context

This prompt adds the database tables and columns needed for email/password
authentication and sets up the required npm packages. No application logic
changes in this prompt.

## Task

### 1. Install npm packages in api/

  cd api && npm install bcryptjs jsonwebtoken

bcryptjs is pure JS (no native build step, compatible with Fly.io Docker).
jsonwebtoken is the standard Node JWT library.

### 2. Create migrations/V33__add_email_password_auth.sql

This migration adds email/password columns to app_user and creates the
refresh token table.

  -- Email/password credentials on app_user.
  -- subject_id remains NOT NULL; for registered users it is set to the
  -- normalized email address. existing device-identity rows are unaffected.
  ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS password_hash text;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_email
    ON app_user (lower(email))
    WHERE email IS NOT NULL;

  -- Refresh tokens. Stored as SHA-256 hex hash; the raw token is never
  -- persisted. Single-use: each refresh rotates to a new token.
  CREATE TABLE IF NOT EXISTS auth_refresh_token (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash  text        NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_refresh_token_user
    ON auth_refresh_token (user_id);

### 3. Add environment variable validation in api/server.js

Find the startup validation block that checks ENGINE_KEY and INTERNAL_API_TOKEN
(around lines 65-106). Add validation for two new required variables:

  JWT_SECRET       — minimum 32 characters
  JWT_ISSUER       — any non-empty string (e.g. "workout-engine")

Use the same pattern as the existing ENGINE_KEY check. Server must refuse
to start if either variable is missing or too short.

### 4. Update api/.env.example (if it exists) or document in a comment

Add the new variables:
  JWT_SECRET=<min-32-char-random-string>
  JWT_ISSUER=workout-engine
  # Optional overrides (defaults shown):
  JWT_ACCESS_TTL_SECONDS=3600
  JWT_REFRESH_TTL_DAYS=30

## Verification

  docker compose run --rm flyway migrate
  # V33 must show as Successfully applied

  docker compose exec db psql -U postgres -d postgres -c "
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'app_user'
      AND column_name IN ('email', 'password_hash');
  "
  # Must return two rows

  docker compose exec db psql -U postgres -d postgres -c "
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'auth_refresh_token';
  "
  # Must return one row

  cd api && node -e "import('./src/db.js').then(() => console.log('ok'))"
  # Must succeed (package imports work)
```

---

## Prompt AUTH-B — Auth service

```
You are working in the api/src/services/ directory of a Node/Express API
(ESM modules). AUTH-A must be complete before running this prompt.

## Context

This prompt creates the authentication service: credential validation,
token issuance, and refresh token management. No routes yet — just the
service layer.

## Task

Create api/src/services/authService.js with the following exports.
Use only bcryptjs and jsonwebtoken (already installed). Use node:crypto
for the refresh token generation (no extra package needed).

### Constants and helpers

Read the following from process.env with the given defaults:
  JWT_SECRET            — required (validated at startup in AUTH-A)
  JWT_ISSUER            — required (validated at startup in AUTH-A)
  JWT_ACCESS_TTL_SECONDS — default 3600
  JWT_REFRESH_TTL_DAYS   — default 30

BCRYPT_COST_FACTOR = 12 (constant, not configurable)
MAX_PASSWORD_LENGTH = 72 (bcrypt silently truncates at 72 bytes; reject above this)

### export async function registerUser(db, { email, password })

1. Normalise email: trim, lowercase.
2. Validate:
   - email must match a basic format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
   - password must be 8–72 characters
   - If either fails, throw { code: "validation_error", message: "..." }
3. Check for existing user:
   SELECT id FROM app_user WHERE lower(email) = $1 LIMIT 1
   If found, throw { code: "email_in_use", message: "Email already registered" }
4. Hash password: await bcrypt.hash(password, BCRYPT_COST_FACTOR)
5. Insert user:
   INSERT INTO app_user (subject_id, email, password_hash)
   VALUES ($1, $2, $3)
   RETURNING id
   where subject_id = normalised email
6. Insert client_profile for the new user:
   INSERT INTO client_profile (user_id) VALUES ($1) RETURNING id
7. Issue tokens (see issueTokenPair below).
8. Return { accessToken, refreshToken, userId, clientProfileId }

### export async function loginUser(db, { email, password })

1. Normalise email: trim, lowercase.
2. Fetch user:
   SELECT id, password_hash FROM app_user WHERE lower(email) = $1 LIMIT 1
   If not found, throw { code: "invalid_credentials", message: "Invalid email or password" }
   (Do NOT distinguish "user not found" from "wrong password" in the error message.)
3. Verify password: await bcrypt.compare(password, row.password_hash)
   If false, throw { code: "invalid_credentials", message: "Invalid email or password" }
4. Fetch clientProfileId:
   SELECT id FROM client_profile WHERE user_id = $1 LIMIT 1
5. Issue tokens.
6. Return { accessToken, refreshToken, userId, clientProfileId }

### export async function refreshTokens(db, { refreshToken })

1. Hash the incoming token: sha256Hex(refreshToken)
2. Look up in DB:
   SELECT id, user_id, expires_at FROM auth_refresh_token
   WHERE token_hash = $1 LIMIT 1
   If not found, throw { code: "invalid_token", message: "Invalid or expired refresh token" }
3. Check expiry: if expires_at < now(), delete the row and throw same error.
4. Delete the used token (rotation): DELETE FROM auth_refresh_token WHERE id = $1
5. Fetch clientProfileId for the user.
6. Issue a fresh token pair.
7. Return { accessToken, refreshToken, userId, clientProfileId }

### export async function logoutUser(db, { refreshToken })

1. Hash the incoming token.
2. DELETE FROM auth_refresh_token WHERE token_hash = $1
3. Return { ok: true } regardless of whether a row was found (idempotent).

### Internal: issueTokenPair(db, userId, clientProfileId)

Issues a JWT access token and a new refresh token. Never exported directly.

JWT:
  algorithm: HS256
  payload: { sub: userId, iss: JWT_ISSUER }
  expiresIn: JWT_ACCESS_TTL_SECONDS seconds

Refresh token:
  raw = crypto.randomBytes(32).toString('hex')  (64-char hex string)
  hash = sha256Hex(raw)
  expires_at = now + JWT_REFRESH_TTL_DAYS days
  INSERT INTO auth_refresh_token (user_id, token_hash, expires_at) VALUES (...)

Return { accessToken: <signed JWT>, refreshToken: raw }

### Internal: sha256Hex(value)

  import { createHash } from 'node:crypto';
  return createHash('sha256').update(value).digest('hex');

## Verification

  node --check api/src/services/authService.js
  # Must succeed

  cd api && npm test -- --test-concurrency=1
  # Existing tests must still pass (no new tests required in this prompt)
```

---

## Prompt AUTH-C — Auth routes

```
You are working in the api/ directory of a Node/Express API (ESM modules).
AUTH-B must be complete before running this prompt.

## Context

This prompt adds the four authentication HTTP routes. All four are unauthenticated
(no token required to call them). Rate limiting is applied to the credential
routes to resist brute force.

## Task

### 1. Create api/src/routes/auth.js

Import:
  import express from 'express';
  import { registerUser, loginUser, refreshTokens, logoutUser }
    from '../services/authService.js';
  import rateLimit from 'express-rate-limit';

Create a rate limiter for credential routes:
  const credentialLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 20,                     // 20 attempts per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, code: 'rate_limited', error: 'Too many attempts. Try again later.' },
  });

export const authRouter = express.Router();

#### POST /api/auth/register

  authRouter.post('/register', credentialLimiter, async (req, res) => {
    const { email, password } = req.body ?? {};
    try {
      const result = await registerUser(pool, { email, password });
      return res.status(201).json({ ok: true, ...result });
    } catch (err) {
      if (err.code === 'validation_error') {
        return res.status(400).json({ ok: false, code: err.code, error: err.message });
      }
      if (err.code === 'email_in_use') {
        return res.status(409).json({ ok: false, code: err.code, error: err.message });
      }
      req.log.error({ event: 'auth.register.error', err: err?.message });
      return res.status(500).json({ ok: false, code: 'internal_error', error: publicInternalError(err) });
    }
  });

Response shape (201):
  { ok: true, access_token, refresh_token, user_id, client_profile_id }

#### POST /api/auth/login

  authRouter.post('/login', credentialLimiter, async (req, res) => { ... });

Same shape as register. Returns 401 for invalid_credentials, 400 for
validation_error, 500 for unexpected errors. Status 200 on success.

#### POST /api/auth/refresh

  authRouter.post('/refresh', async (req, res) => { ... });

Accepts: { refresh_token: string } in body.
Returns 200: { ok: true, access_token, refresh_token }
Returns 401 for invalid_token.
No credential rate limiter (refresh tokens are already single-use and expire).

#### POST /api/auth/logout

  authRouter.post('/logout', async (req, res) => { ... });

Accepts: { refresh_token: string } in body.
Calls logoutUser. Always returns 200 { ok: true }.
Never exposes whether the token existed.

### 2. Mount the router in api/server.js

Add near the other router mounts:
  import { authRouter } from './src/routes/auth.js';
  app.use('/api/auth', authRouter);

Import pool and publicInternalError inside auth.js (they are already
used in server.js — follow the same import pattern).

## Verification

  cd api && node --check src/routes/auth.js
  # Must succeed

  cd api && npm test -- --test-concurrency=1
  # Existing tests must pass
```

---

## Prompt AUTH-D — requireAuth middleware and route protection

```
You are working in the api/src/middleware/ directory and api/server.js.
AUTH-C must be complete before running this prompt.

## Context

This prompt creates the JWT validation middleware and switches user-facing
routes from requireInternalToken to requireAuth. Server-to-server routes
(admin, pipeline) keep requireInternalToken.

## Task

### 1. Create api/src/middleware/requireAuth.js

  import jwt from 'jsonwebtoken';

  export function makeRequireAuth(secret = process.env.JWT_SECRET, issuer = process.env.JWT_ISSUER) {
    return function requireAuth(req, res, next) {
      const authHeader = req.headers['authorization'] ?? '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (!token) {
        return res.status(401).json({ ok: false, code: 'unauthorized', error: 'Missing authorization token' });
      }

      try {
        const decoded = jwt.verify(token, secret, { issuer, algorithms: ['HS256'] });
        req.auth = { ...(req.auth ?? {}), user_id: decoded.sub };
        return next();
      } catch (err) {
        const isExpired = err.name === 'TokenExpiredError';
        return res.status(401).json({
          ok: false,
          code: isExpired ? 'token_expired' : 'invalid_token',
          error: isExpired ? 'Token expired' : 'Invalid token',
        });
      }
    };
  }

  export const requireAuth = makeRequireAuth();

### 2. Update api/src/middleware/chains.js

Add a new chain:

  import { requireAuth } from './requireAuth.js';

  export const userAuth = [requireAuth];

Keep the existing internalApi, internalWithUser, and adminOnly chains unchanged.

### 3. Update route protection in api/server.js

Import requireAuth and the userAuth chain.

Switch the following routes from requireInternalToken to requireAuth:

  GET  /api/me                   → requireAuth
  GET  /me                       → requireAuth  (deprecated path)
  POST /api/client-profiles      → requireAuth
  POST /client-profiles          → requireAuth  (deprecated path)
  GET  /api/client-profiles/:id  → requireAuth
  GET  /client-profiles/:id      → requireAuth  (deprecated path)
  PATCH /api/client-profiles/:id → requireAuth
  PATCH /client-profiles/:id     → requireAuth  (deprecated path)
  PATCH /api/users/me            → requireAuth
  PATCH /users/me                → requireAuth  (deprecated path)

Keep requireInternalToken on:
  POST /api/generate-plan-v2      (server-to-server pipeline calls)
  All /admin/* routes
  All /api/admin/* routes

### 4. Update handleMe in server.js to use req.auth.user_id

handleMe currently reads userId from req.query via readRequestedUserId.
With requireAuth, the user identity is in req.auth.user_id (the UUID).

Update handleMe:

  FROM: const userId = readRequestedUserId(req.query);
        if (!userId) { return 400 }
        const profile = await getProfileByUserId(userId);
        return res.json({ id: userId, clientProfileId: profile?.id ?? null });

  TO:   const userId = req.auth.user_id;   // UUID from JWT
        const profile = await getProfileById(userId)
          ?? await getProfileByUserId(userId);
          // getProfileById(UUID) covers registered users whose profile
          // is linked by user_id = UUID.
          // Fallback to getProfileByUserId for any legacy subject_id lookup.
        return res.json({ id: userId, clientProfileId: profile?.id ?? null });

  Note: getProfileById now only matches on cp.id::text = $1. Since userId
  is a UUID, this correctly finds the profile by the app_user.id FK.
  Remove the query param fallback entirely — identity comes from the token.

### 5. Update handleCreateClientProfile in server.js

  FROM: const userId = readRequestedUserId(req.query);
  TO:   const userId = req.auth.user_id;  // UUID from JWT

  The upsertUser call (upsertUser(userId)) will now receive a UUID.
  Since UUIDs are not valid subject_id values (they collide with no
  existing device-id format), upsertUser's ON CONFLICT (subject_id)
  will never match existing rows. This is correct — registration already
  created the app_user row. upsertUser becomes a safe no-op for
  registered users. No change needed to upsertUser itself.

  Update getProfileByUserId(userId) → getProfileById(userId):
  For registered users, the profile is found by cp.user_id = app_user.id,
  which getProfileById handles via id::text = $1 when userId is the UUID.

### 6. Update handleUsersMe in server.js

  FROM: const userId = readRequestedUserId({ ...req.query, ...req.body });
  TO:   const userId = req.auth.user_id;

  The clientProfileId linking logic and the rest of the handler remain.
  (The bubble_client_profile_id bug was fixed in AUTH-0.)

### 7. Update history and segment log routes

Find all routes that use internalWithUser middleware (requireInternalToken
+ resolveUser). For user-scoped routes (history, segment log, read program),
replace internalWithUser with requireAuth.

For each route using resolveUser:
  - resolveUser reads user_id from req.query and sets req.auth.user_id
  - With requireAuth, req.auth.user_id is already set from the JWT
  - The resolveUser step is no longer needed on these routes
  - Remove it from the chain for JWT-protected routes

Keep resolveUser only if a route must support both JWT and server-side
query-param identity (e.g. pipeline routes).

## Verification

  cd api && node --check src/middleware/requireAuth.js
  # Must succeed

  cd api && npm test -- --test-concurrency=1
  # All tests must pass
  # Note: tests that mock requireInternalToken may need to be updated
  # to either mock requireAuth or inject req.auth.user_id directly.
  # Update any such test — do not skip them.
```

---

## Prompt AUTH-E — Mobile token storage and API client update

```
You are working in the mobile/ directory of a React Native / Expo app (TypeScript).
AUTH-D must be complete before running this prompt.

## Context

The mobile API client currently sends X-Engine-Key on all requests and
appends user_id/bubble_user_id query params for identity. With JWT auth,
user-facing requests must instead send Authorization: Bearer <token>.

The ENGINE_KEY is retained only for routes that still require it
(generate-plan-v2 and any server-to-server calls). User identity no longer
comes from a query param — it comes from the JWT.

expo-secure-store must be added for JWT storage. AsyncStorage (cleartext)
must not store tokens.

## Task

### 1. Install expo-secure-store

  cd mobile && npx expo install expo-secure-store

### 2. Create mobile/src/api/tokenStorage.ts

Thin wrapper around expo-secure-store. Keeps storage keys in one place.

  import * as SecureStore from 'expo-secure-store';

  const KEYS = {
    accessToken: 'auth:access_token',
    refreshToken: 'auth:refresh_token',
  } as const;

  export async function getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.accessToken);
  }

  export async function getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.refreshToken);
  }

  export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.accessToken, accessToken);
    await SecureStore.setItemAsync(KEYS.refreshToken, refreshToken);
  }

  export async function clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.accessToken);
    await SecureStore.deleteItemAsync(KEYS.refreshToken);
  }

### 3. Create mobile/src/api/authApi.ts

Thin typed wrappers for the four auth endpoints. Use plain apiFetch
(no engine key needed — auth routes have no auth requirement).

  import { apiFetch } from './client';

  export type AuthTokens = {
    access_token: string;
    refresh_token: string;
    user_id: string;
    client_profile_id: string;
  };

  export type RefreshResponse = {
    access_token: string;
    refresh_token: string;
  };

  export async function apiRegister(email: string, password: string): Promise<AuthTokens> {
    return apiFetch('/api/auth/register', {
      method: 'POST',
      body: { email, password },
    });
  }

  export async function apiLogin(email: string, password: string): Promise<AuthTokens> {
    return apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  }

  export async function apiRefresh(refreshToken: string): Promise<RefreshResponse> {
    return apiFetch('/api/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    });
  }

  export async function apiLogout(refreshToken: string): Promise<void> {
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    });
  }

### 4. Update mobile/src/api/client.ts

The goal is: requests to user-facing API routes carry Authorization: Bearer <token>.
The engine key continues to be sent by engineFetch for pipeline routes.

Add a new exported function authenticatedFetch that:
  - Reads the access token from tokenStorage
  - Adds Authorization: Bearer <token> header
  - On 401 response with code: 'token_expired', attempts one token refresh:
      - Reads refresh token from tokenStorage
      - Calls POST /api/auth/refresh
      - If refresh succeeds: saves new tokens, retries the original request once
      - If refresh fails (401 or network error): calls clearTokens(), then
        throws an ApiError with status 401 and code 'session_expired' so
        the app can redirect to Login
  - On any other non-2xx: throws ApiError as normal

  export async function authenticatedFetch<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> { ... }

Add typed convenience wrappers:
  authGetJson, authPostJson, authPatchJson, authDeleteJson

These mirror the existing engineGetJson / enginePatchJson pattern.

Do not modify engineFetch — it is still used for pipeline and admin calls
that require X-Engine-Key.

### 5. Update mobile/src/api/me.ts

Replace engineGetJson → authGetJson, remove getUserIdentityQueryString:
  FROM: return engineGetJson<MeResponse>(`/me?${query}`);
  TO:   return authGetJson<MeResponse>('/api/me');

Replace enginePatchJson → authPatchJson, remove query string:
  FROM: return enginePatchJson<MeResponse, LinkClientProfilePayload>(`/users/me?${query}`, payload);
  TO:   return authPatchJson<MeResponse, LinkClientProfilePayload>('/api/users/me', payload);

### 6. Update mobile/src/api/clientProfiles.ts

Find calls that use engineGetJson/enginePostJson/enginePatchJson for
/client-profiles routes. Replace with authGetJson/authPostJson/authPatchJson.
Remove getUserIdentityQueryString from these calls.
Use /api/client-profiles (not the deprecated /client-profiles path).

## Verification

  cd mobile && npx tsc --noEmit
  # Must succeed with zero errors
```

---

## Prompt AUTH-F — LoginScreen and RegisterScreen

```
You are working in the mobile/src/screens/auth/ directory of a React Native
/ Expo app (TypeScript). AUTH-E must be complete before running this prompt.

## Context

DevLoginScreen is the current placeholder auth screen. It generates a
device-bound anonymous ID. This prompt replaces it with real LoginScreen
and RegisterScreen components backed by the new auth API.

The visual style follows exactly the pattern of ResetPasswordScreen.tsx
(the existing form screen in this directory), which uses the shared
theme tokens: colors, spacing, typography, radii from
../../theme/{colors,spacing,typography,components}.

## Task

### 1. Create mobile/src/screens/auth/LoginScreen.tsx

Screen name in navigator: "Login"
Props: NativeStackScreenProps<AuthStackParamList, 'Login'>

State:
  email: string
  password: string
  errorMessage: string | null
  isSubmitting: boolean

handleSubmit:
  1. Trim and lowercase email; if empty, set error and return.
  2. If password empty, set error and return.
  3. Set isSubmitting = true, clear error.
  4. Call apiLogin(email, password).
  5. On success:
     - saveTokens(result.access_token, result.refresh_token)
     - Fetch full profile: getClientProfile(result.client_profile_id)
     - Set identity and session in stores:
         setIdentity({ userId: result.user_id, clientProfileId: result.client_profile_id })
         setSession({ userId: result.user_id, clientProfileId: result.client_profile_id, entryRoute })
         where entryRoute = isOnboardingComplete(profile) ? 'ProgramReview' : 'OnboardingEntry'
     - Invalidate/set queryClient cache for ['me'] and ['clientProfile', id]
  6. On ApiError with status 401: set error "Incorrect email or password."
  7. On any other error: set error "Unable to sign in. Please try again."
  8. Always set isSubmitting = false in finally.

Layout (match ResetPasswordScreen layout pattern):
  - Title: "Sign in"
  - Email field (autoCapitalize="none", keyboardType="email-address")
  - Password field (secureTextEntry={true})
  - Error message in warning color if present
  - "Sign in" primary button (disabled + opacity when isSubmitting)
  - "Don't have an account? Create one" secondary button
    → navigation.navigate('Register')
  - "Back" tertiary link → navigation.goBack()

isOnboardingComplete helper: copy the implementation from DevLoginScreen.tsx
(checks onboardingCompletedAt or onboardingStepCompleted >= 3).

### 2. Create mobile/src/screens/auth/RegisterScreen.tsx

Screen name in navigator: "Register"
Props: NativeStackScreenProps<AuthStackParamList, 'Register'>

State:
  email: string
  password: string
  confirmPassword: string
  errorMessage: string | null
  isSubmitting: boolean

handleSubmit:
  1. Trim email; if empty set error and return.
  2. If password.length < 8, set error "Password must be at least 8 characters." and return.
  3. If password.length > 72, set error "Password is too long." and return.
  4. If password !== confirmPassword, set error "Passwords do not match." and return.
  5. Set isSubmitting = true, clear error.
  6. Call apiRegister(email, password).
  7. On success: same session setup as LoginScreen handleSubmit steps 5a–e.
  8. On ApiError with status 409: set error "An account with this email already exists."
  9. On ApiError with status 400: set error from err.message if available, else "Please check your details."
  10. On any other error: set error "Unable to create account. Please try again."
  11. Always set isSubmitting = false in finally.

Layout:
  - Title: "Create account"
  - Email field
  - Password field (secureTextEntry)
  - Confirm password field (secureTextEntry)
  - Error message if present
  - "Create account" primary button
  - "Already have an account? Sign in" secondary button → navigation.navigate('Login')
  - "Back" link → navigation.goBack()

### 3. Delete mobile/src/screens/auth/DevLoginScreen.tsx

Remove the file. It will be replaced by LoginScreen and RegisterScreen.
Update any import sites — the only import site is AuthNavigator.tsx
(updated in AUTH-G).

## Verification

  cd mobile && npx tsc --noEmit
  # Must succeed with zero errors
```

---

## Prompt AUTH-G — AuthNavigator and WelcomeLoginScreen wiring

```
You are working in the mobile/src/navigation/ and mobile/src/screens/auth/
directories of a React Native / Expo app (TypeScript).
AUTH-F must be complete before running this prompt.

## Context

AuthNavigator currently routes: WelcomeLogin → DevLogin → ResetPassword.
DevLogin is removed. The new flow is:
  WelcomeLogin → Login → Register (from Login)
                       ↗
                Register (from WelcomeLogin)

The ResetPasswordScreen is retained as a stub. Its "Not available in dev mode"
message is replaced with a message that will be implemented in a future prompt.

## Task

### 1. Update mobile/src/navigation/AuthNavigator.tsx

New AuthStackParamList:
  WelcomeLogin: undefined
  Login: undefined
  Register: undefined
  ResetPassword: undefined

Remove the DevLogin screen.
Add Login and Register screens.
Import LoginScreen and RegisterScreen from their new files.
Remove the DevLoginScreen import.

The stack:
  <Stack.Screen name="WelcomeLogin" component={WelcomeLoginScreen} />
  <Stack.Screen name="Login" component={LoginScreen} />
  <Stack.Screen name="Register" component={RegisterScreen} />
  <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />

### 2. Update mobile/src/screens/auth/WelcomeLoginScreen.tsx

The current "Continue" button navigates to DevLogin.
Replace with two buttons:

Primary: "Sign in" → navigation.navigate('Login')
Secondary: "Create account" → navigation.navigate('Register')

Remove the "Reset password" button from WelcomeLoginScreen — it is
accessible from LoginScreen instead.

### 3. Update mobile/src/screens/auth/ResetPasswordScreen.tsx

The confirmation message currently says "Not available in dev mode."
Replace with:
  "If an account exists for this email, a reset link will be sent."

This is still a stub (no API call), but no longer claims to be dev-only.

### 4. Update mobile/src/state/session/sessionStore.ts (if needed)

Verify that the session store's setSession action accepts the same shape
as DevLoginScreen was using. If the shape changed in AUTH-F, reconcile
here. No functional change expected.

### 5. Add logout support

In whatever screen or menu handles logout (look for a logout button or
settings screen), ensure logout:
  1. Reads the refresh token from tokenStorage.
  2. Calls apiLogout(refreshToken) — fire and forget (don't block UI on API error).
  3. Calls clearTokens().
  4. Clears session store.
  5. Navigates to WelcomeLogin.

If no logout button exists yet, add a placeholder comment in sessionStore.ts
noting where logout should be triggered.

## Verification

  cd mobile && npx tsc --noEmit
  # Must succeed with zero errors

  # Manual smoke test:
  # 1. Open app → WelcomeLogin shows "Sign in" and "Create account" buttons
  # 2. Tap "Create account" → RegisterScreen appears with email/password/confirm fields
  # 3. Register with a new email → navigates to onboarding or program review
  # 4. Force-quit and reopen app → app checks token, still authenticated
  # 5. Tap "Sign in" on WelcomeLogin → LoginScreen
  # 6. Sign in with same email/password → navigates to program review
  # 7. Sign in with wrong password → "Incorrect email or password." error shown
```

---

## Post-implementation checklist

After all prompts are complete, verify the following:

- `grep -rn "DevLogin\|dev_user_id\|bubble_user_id\|getUserIdentityQueryString" mobile/src/` returns zero results
- `grep -rn "bubble_client_profile_id" api/src/ api/server.js` returns zero results
- All CI tests pass
- `JWT_SECRET` and `JWT_ISSUER` are set in the Fly.io production secrets:
    `flyctl secrets set JWT_SECRET=<value> JWT_ISSUER=workout-engine`
- Verify the refresh token rotation works: two consecutive refreshes with
  the same token should result in the second returning 401
