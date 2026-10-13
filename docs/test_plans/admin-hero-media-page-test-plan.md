# Admin hero media page test plan

Automated API tests cover URL routing, file status, coverage fallback methods, stable key creation, partial updates, soft deletion, restoration, promotion/import dependencies, and deterministic seed generation. The database migration is verified with Flyway and the full API suite.

Manual checks:

1. Open `/admin/hero-media` from the Hero Images navigation item. Confirm strength uses hypertrophy imagery and HYROX shows generic fallbacks.
2. Upload a 1080 px or wider strength lower-body image, map it, and generate a new strength program. Confirm the new program uses it and an existing program retains its prior hero.
3. Deactivate and restore a mapping and confirm the matrix refreshes.
4. Run Sync All to Flyway, confirm clean status, and confirm a second Flyway migration makes no changes.
5. With production promotion configured, promote one row and confirm it appears in production `/admin/hero-media/list`.

There is no automated browser harness for the server-rendered admin pages, so the UI checks remain manual.
