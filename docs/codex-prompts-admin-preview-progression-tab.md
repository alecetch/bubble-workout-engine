# Codex Prompt — Admin Preview: Progression Tab

## What to build

Add a **Progression** tab to the admin program preview page (`/admin/preview`). The tab lets you input recent working weights for up to 6 estimation families (squat, hinge, horizontal press, vertical press, horizontal pull, vertical pull), click Generate, and immediately see what load/rep/outcome the progression decision engine would recommend for each exercise in the generated program.

This is a read-only admin testing tool. No database writes. No fake rows inserted anywhere.

---

## Context — read these files before starting

1. **`api/src/routes/adminPreview.js`** — the route that powers the preview page. `buildPreviewInputs` fetches exercise catalogue rows (including `load_estimation_metadata` JSONB via `SELECT *`). `createPreviewHandler` is the POST handler for `/admin/preview/generate`. Study how `buildPreviewInputs` and `buildPreviewMeta` work, and how the pipeline result is assembled into the response.

2. **`api/src/services/progressionDecisionService.js`** — contains:
   - `buildDecision({ row, programType, profileName, profile, rankOverride, history, config })` — the pure function that takes a prescription row + a history array and returns an outcome object (`increase_load`, `increase_reps`, `hold`, `deload_local`, or `null`). Currently private.
   - `loadProgressionConfig(db, programType)` — loads config from DB and returns `{ config, rankOverrides }`. Currently private.
   - `makeDefaultProgressionConfig(programType)` — pure, already exported via `_test`.
   - `rankKey(rank)` — maps rank integer to key string (`0→"beginner"`, `1→"intermediate"`, etc.). Currently private.
   - `resolveProfileName(config, programType, purpose)` — resolves `profileName` from config. Currently private.
   - The `_test` export at the bottom of the file.

3. **`api/admin/preview.html`** — the single-file admin UI. Uses vanilla JS in a `<script type="module">` block. The `renderProgram` function builds the HTML for each program type panel. The `Generate` button handler assembles the POST body and renders results. Study the existing CSS variables and component classes (`.badge`, `.phase-label`, `.seg`, `.item`, etc.) — reuse them.

4. **`migrations/V56__add_load_estimation_metadata_to_exercise_catalogue.sql`** — shows that `load_estimation_metadata` is a JSONB column on `exercise_catalogue`. The field `estimation_family` inside that JSON is the key used to match anchor lifts to exercises (values: `"squat"`, `"hinge"`, `"horizontal_press"`, `"vertical_press"`, `"horizontal_pull"`, `"vertical_pull"`).

---

## Part 1 — `progressionDecisionService.js`: promote private functions to named exports

Add the following as named exports alongside the existing `makeProgressionDecisionService` export. Do not remove or change any existing exports or the `_test` block.

```js
export { buildDecision, loadProgressionConfig, rankKey, resolveProfileName };
```

These are already tested functions — you are only changing their visibility.

---

## Part 2 — `adminPreview.js`: add progression preview logic

### 2a — Import the newly exported functions

At the top of the file, add to the existing import from `progressionDecisionService.js`:

```js
import {
  makeProgressionDecisionService,
  buildDecision,
  loadProgressionConfig,
  rankKey,
  resolveProfileName,
} from "../services/progressionDecisionService.js";
```

### 2b — Build an estimation family index from the exercise catalogue

In `buildPreviewInputs`, after `exerciseRows` is fetched, build and return an index that maps `exercise_id → estimation_family`:

```js
const estimationFamilyByExerciseId = Object.fromEntries(
  exerciseRows
    .filter(r => r.load_estimation_metadata?.estimation_family)
    .map(r => [String(r.exercise_id), String(r.load_estimation_metadata.estimation_family)])
);
```

Add `estimationFamilyByExerciseId` to the return value of `buildPreviewInputs`.

### 2c — Add `anchor_lifts` parameter to `createPreviewHandler`

In `createPreviewHandler`, after reading `programTypes` from `req.body`, read:

```js
const anchorLifts = Array.isArray(req.body?.anchor_lifts) ? req.body.anchor_lifts : [];
```

Shape of each entry (all fields optional):
```js
{ estimationFamily: string, loadKg: number, reps: number, rir?: number }
```

### 2d — After the pipeline runs, compute progression decisions

After `const results = await Promise.allSettled(...)` and after `previews` is assembled, add:

```js
const progressionPreviews = {};

if (anchorLifts.length > 0) {
  // Build a lookup: family → anchor entry
  const anchorByFamily = Object.fromEntries(
    anchorLifts
      .filter(a => a.estimationFamily && a.loadKg != null && a.reps != null)
      .map(a => [String(a.estimationFamily), a])
  );

  for (const programType of programTypes) {
    const preview = previews[programType];
    if (!preview?.ok) continue;

    // Load progression config for this program type
    const { config, rankOverrides } = await loadProgressionConfig(db, programType);
    const rankOverride = rankOverrides?.[rankKey(fitnessRank)] ?? {};

    // Collect all exercises from week 1 across all days
    const week1 = (preview.program?.weeks ?? []).find(w => w.week_index === 1);
    if (!week1) continue;

    const decisions = [];
    for (const day of (week1.days ?? [])) {
      for (const seg of (day.segments ?? [])) {
        for (const item of (seg.items ?? [])) {
          const exerciseId = String(item.ex_id ?? "");
          const family = cached.estimationFamilyByExerciseId?.[exerciseId];
          const anchor = family ? anchorByFamily[family] : null;

          if (!anchor) {
            decisions.push({
              exercise_id: exerciseId,
              exercise_name: cached.exerciseNameMap[exerciseId] ?? exerciseId,
              day: day.day_index,
              family: family ?? null,
              anchor_load_kg: null,
              outcome: null,
              skipped_reason: family ? "no anchor provided for this family" : "no estimation family on exercise",
            });
            continue;
          }

          // Build a 2-entry synthetic history (satisfies evidence_requirement_multiplier: 1)
          const syntheticHistory = [
            { log_id: "synthetic-1", weight_kg: anchor.loadKg, reps_completed: anchor.reps, rir_actual: anchor.rir ?? 2 },
            { log_id: "synthetic-2", weight_kg: anchor.loadKg, reps_completed: anchor.reps, rir_actual: anchor.rir ?? 2 },
          ];

          // Build a minimal prescription row for buildDecision
          const exerciseRow = cached.exerciseRows.find(r => String(r.exercise_id) === exerciseId) ?? {};
          const row = {
            exercise_id: exerciseId,
            purpose: seg.purpose ?? "main",
            reps_prescribed: item.reps_prescribed ?? "",
            intensity_prescription: item.intensity ?? "",
            is_loadable: exerciseRow.is_loadable ?? true,
            equipment_items_slugs: exerciseRow.equipment_items_slugs ?? [],
          };

          const profileName = resolveProfileName(config, programType, row.purpose);
          const profile = config.lever_profiles?.[profileName] ?? {};

          const decision = buildDecision({
            row,
            programType,
            profileName,
            profile,
            rankOverride,
            history: syntheticHistory,
            config,
          });

          decisions.push({
            exercise_id: exerciseId,
            exercise_name: cached.exerciseNameMap[exerciseId] ?? exerciseId,
            day: day.day_index,
            family,
            prescribed_reps: item.reps_prescribed ?? "",
            anchor_load_kg: anchor.loadKg,
            outcome: decision?.outcome ?? "not_applicable",
            primary_lever: decision?.primary_lever ?? null,
            recommended_load_kg: decision?.recommended_load_kg ?? null,
            recommended_reps_target: decision?.recommended_reps_target ?? null,
            confidence: decision?.confidence ?? null,
            reasons: decision?.reasons ?? [],
          });
        }
      }
    }

    progressionPreviews[programType] = decisions;
  }
}
```

### 2e — Include `progression_preview` in the response

In the `return res.json(...)` call, add:

```js
return res.json({
  ok: true,
  meta: buildPreviewMeta(...),
  previews,
  progression_preview: progressionPreviews,
});
```

---

## Part 3 — `preview.html`: add Anchor Lifts input and Progression tab

### 3a — Add the Anchor Lifts input section to the controls panel

After the `<div class="sep"></div>` that precedes the "Show narration" checkbox (around line 181 of the current file), insert a collapsible anchor lifts section:

```html
<div class="sep"></div>
<details id="anchor-lifts-section" style="font-size:12px">
  <summary style="cursor:pointer;color:var(--muted);padding:2px 0">Anchor lifts (for progression)</summary>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 8px;margin-top:6px;min-width:420px">
    <!-- One row per family: label | kg input | reps input -->
    <!-- families: squat, hinge, horizontal_press, vertical_press, horizontal_pull, vertical_pull -->
  </div>
</details>
```

Render the 6 family rows inside that grid. Use the family slug as `data-family` on each row's inputs. Labels from the spec:

| slug | label |
|---|---|
| `squat` | Squat |
| `hinge` | Hinge |
| `horizontal_press` | Horiz. Press |
| `vertical_press` | Vert. Press |
| `horizontal_pull` | Horiz. Pull |
| `vertical_pull` | Vert. Pull |

Each row: `<span style="color:var(--muted)">Label</span>` + `<input type="number" data-family="squat" data-field="kg" placeholder="kg" style="width:64px;...">` + `<input type="number" data-family="squat" data-field="reps" placeholder="reps" style="width:48px;...">`.

Style the inputs to match the existing inline inputs on the page (`padding:4px 8px;font-size:12px;border:1px solid var(--border);border-radius:6px`).

### 3b — Read anchor lifts when building the request body

In the `Generate` button click handler, after the `body` object is constructed, add:

```js
const anchorLifts = [];
document.querySelectorAll("#anchor-lifts-section [data-family][data-field='kg']").forEach(kgInput => {
  const family = kgInput.dataset.family;
  const repsInput = document.querySelector(`#anchor-lifts-section [data-family="${family}"][data-field="reps"]`);
  const loadKg = parseFloat(kgInput.value);
  const reps = parseInt(repsInput?.value ?? "", 10);
  if (Number.isFinite(loadKg) && loadKg > 0 && Number.isFinite(reps) && reps > 0) {
    anchorLifts.push({ estimationFamily: family, loadKg, reps, rir: 2 });
  }
});
if (anchorLifts.length > 0) body.anchor_lifts = anchorLifts;
```

### 3c — Add a `renderProgressionTab` function

Add this function near `renderProgram`:

```js
function renderProgressionTab(decisions) {
  if (!decisions || decisions.length === 0) {
    return `<div class="panel-empty">No progression decisions — add anchor lifts above and regenerate.</div>`;
  }

  const rows = decisions.map(d => {
    if (!d.outcome || d.skipped_reason) {
      return `<tr>
        <td>${esc(d.exercise_name)}</td>
        <td>Day ${esc(String(d.day ?? ""))}</td>
        <td>${esc(d.family ?? "—")}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td>
        <td style="color:var(--muted);font-style:italic">${esc(d.skipped_reason ?? "")}</td>
      </tr>`;
    }
    const outcomeClass = d.outcome === "increase_load" || d.outcome === "increase_reps" ? "ok"
      : d.outcome === "deload_local" ? "err"
      : "warn";
    const recommendation = d.recommended_load_kg != null ? `${d.recommended_load_kg} kg`
      : d.recommended_reps_target != null ? `${d.recommended_reps_target} reps`
      : "—";
    return `<tr>
      <td>${esc(d.exercise_name)}</td>
      <td>Day ${esc(String(d.day ?? ""))}</td>
      <td>${esc(d.family ?? "—")}</td>
      <td>${esc(d.prescribed_reps ?? "")}</td>
      <td>${esc(String(d.anchor_load_kg ?? "—"))}</td>
      <td class="${outcomeClass}" style="font-weight:600">${esc(d.outcome)}</td>
      <td>${esc(recommendation)}</td>
      <td style="color:var(--muted);font-size:11px">${esc((d.reasons ?? []).join(" "))}</td>
    </tr>`;
  });

  return `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead>
      <tr style="border-bottom:2px solid var(--border);text-align:left">
        <th style="padding:4px 8px">Exercise</th>
        <th>Day</th>
        <th>Family</th>
        <th>Prescribed</th>
        <th>Anchor (kg)</th>
        <th>Outcome</th>
        <th>Recommended</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join("")}
    </tbody>
  </table>`;
}
```

### 3d — Add a "Progression" sub-tab to each program type panel

Modify `renderProgram` to wrap the existing weeks/debug HTML in a tabbed layout. Each program type panel gets two sub-tabs: **Program** (existing content) and **Progression** (new).

Add this CSS to the `<style>` block:

```css
.sub-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 10px; }
.sub-tab { padding: 5px 14px; cursor: pointer; border: none; background: transparent; color: var(--muted); font-size: 12px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.sub-tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }
.sub-panel { display: none; }
.sub-panel.active { display: block; }
```

Modify `renderProgram` to return:

```js
const panelId = `prog-panel-${type}-${Date.now()}`;  // unique per render
return `
  <div class="sub-tabs">
    <button class="sub-tab active" data-panel="${panelId}-program">Program</button>
    <button class="sub-tab" data-panel="${panelId}-progression">Progression</button>
  </div>
  <div id="${panelId}-program" class="sub-panel active">
    <!-- existing prog-hdr, weeks, debug HTML here -->
  </div>
  <div id="${panelId}-progression" class="sub-panel">
    <!-- renderProgressionTab content injected in the Generate handler -->
  </div>`;
```

Wire the sub-tab click events after setting panel innerHTML in the Generate handler:

```js
panel.querySelectorAll(".sub-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const panelEl = panel;
    panelEl.querySelectorAll(".sub-tab").forEach(t => t.classList.remove("active"));
    panelEl.querySelectorAll(".sub-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.panel)?.classList.add("active");
  });
});
```

### 3e — Populate the progression sub-panel in the Generate handler

After the existing loop that sets `panel.innerHTML = renderProgram(...)`, add:

```js
const progressionData = data.progression_preview?.[type] ?? [];
const progressionPanelEl = panel.querySelector(".sub-panel:last-child");
if (progressionPanelEl) {
  progressionPanelEl.innerHTML = renderProgressionTab(progressionData);
}
```

---

## Tests to add

Add to `api/src/routes/__tests__/adminPreview.test.js` (or create it alongside the existing `adminPreview.test.js`):

```js
// Test that anchor_lifts in the request body produces progression_preview in the response
test("POST /preview/generate includes progression_preview when anchor_lifts are supplied", async () => {
  // Use the existing mock pattern from the test file.
  // Supply anchor_lifts with squat: 100kg × 5 reps.
  // Assert response.progression_preview.strength is an array.
  // Assert at least one entry has outcome set (not null).
});

// Test that omitting anchor_lifts returns an empty progression_preview
test("POST /preview/generate returns empty progression_preview when no anchor_lifts", async () => {
  // Assert progression_preview is {} or all arrays are empty.
});
```

---

## Constraints

- Do not add any database writes anywhere in this feature
- Do not duplicate `buildDecision` logic — call the function directly after exporting it
- Do not change the shape of the existing `previews` response field
- The anchor lifts section in the UI must be optional — omitting it (leaving all fields blank) produces identical behaviour to the current page
- Keep `preview.html` as a single self-contained file — no external JS modules or build step
- The progression sub-tab must only appear when `progression_preview` data exists for that type; if the array is absent or empty, show the empty-state message instead of a broken table

---

## Verification

1. Open `/admin/preview`, enter token, leave anchor lifts empty, click Generate → page works exactly as before, no Progression data shown
2. Enter `Squat: 100kg / 5 reps`, select Strength, click Generate → Progression tab appears for Strength; Back Squat row shows `outcome: increase_load` and `recommended_load_kg: 105`
3. Enter a weight well below the prescribed target → outcome shows `hold` or `increase_reps`
4. Check Hypertrophy tab with horizontal_press anchor → shows `increase_reps` for bench press variant before `increase_load`
5. Run `npm test` in `api/` → all tests pass
