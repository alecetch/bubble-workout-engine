# Deload Week Spec

**Type:** Coaching design + architecture analysis
**Status:** Analysis only — no implementation

---

## Part 1 — Coaching assessment by program type

### 1.1 What a deload actually is

A deload week is a planned reduction in training stress to allow accumulated fatigue to dissipate, supercompensation to occur, and the athlete to return to the next block primed rather than depleted. It is not a rest week — movement patterns, frequency, and exercise selection are all maintained. Only the stress variables are reduced.

The two primary levers are:
- **Volume** (sets × reps, or rounds for circuit/conditioning work)
- **Intensity proximity** (how close to failure each set is taken — RIR)

A well-designed deload touches both. A volume-only deload is incomplete if the athlete is still grinding every set to failure.

---

### 1.2 Hypertrophy deload

**Primary stress accumulation:** volume — high weekly sets per muscle group, moderate-to-high proximity to failure across the block.

**Deload prescription:**
- Reduce total sets by **30–40%** (multiplier ~0.65). Keep the same number of exercises.
- Increase RIR target by **2 points** on all working sets. If an exercise was prescribed at RIR 1, deload week is RIR 3. This is the most important adjustment and is often omitted from simple implementations.
- Rep ranges stay unchanged. Do not reduce reps — the neuromuscular recruitment pattern should be preserved.
- Exercise selection stays identical — no swapping or simplification needed.
- Frequency (days/week) stays the same.

**Rationale:** Hypertrophy fatigue is primarily peripheral (muscular damage, metabolic fatigue). Volume reduction directly addresses this. The RIR adjustment ensures the athlete is not digging deeper into the fatigue hole even while performing the same movements.

**Common mistakes to avoid:**
- Keeping volume the same but just "going lighter" — without a rep scheme change this is vague and athlete-dependent.
- Removing exercises entirely — this disrupts pattern retention and makes week 5 feel like starting over.
- Prescribing an arbitrary 50% reduction — this is too deep and makes the deload week feel pointless.

---

### 1.3 Strength deload

**Primary stress accumulation:** neural fatigue — heavy loads, high CNS demand, RIR-based intensity close to 1RM.

**Deload prescription:**
- Reduce total sets by **30–40%** (multiplier ~0.65). Main compound sets are where the biggest cut lands.
- Increase RIR target by **2–3 points** on compound lifts. Strength-focused athletes working at RIR 1 on peak weeks should deload to RIR 3–4. This is essential — neural fatigue cannot be addressed by load reduction alone if the athlete is still straining through every set.
- Do not reduce load by prescription — the RIR increase naturally results in the athlete selecting a lighter working weight, which is appropriate and self-regulating.
- Accessory work (C/D slots) can reduce slightly more aggressively (multiplier ~0.6) as it carries less carryover importance.
- Frequency and exercise selection unchanged.

**Rationale:** Neural fatigue from heavy compound lifting (squat, deadlift, press) dissipates relatively quickly (48–72 hours) but accumulates significantly across a 3–4 week block. A proper deload creates a physiological and psychological reset before the next loading phase.

**Distinction from hypertrophy:** The RIR bump matters more here. For strength athletes, performing the same patterns at genuinely submaximal effort (RIR 3+) while cutting sets is a complete deload. For hypertrophy athletes, the volume cut carries more weight than the RIR adjustment.

---

### 1.4 Conditioning deload

**Primary stress accumulation:** cardiorespiratory and metabolic — sustained aerobic/anaerobic output across repeated rounds, high work:rest ratios.

**Deload prescription:**
- Reduce total rounds by **30–40%** (multiplier ~0.65). This is the primary lever — fewer rounds means less total metabolic volume.
- Intensity prescription does not change by prescription, but narration cues should explicitly signal sub-threshold effort: "focus on breathing control, not output."
- Session duration can remain the same — the removed rounds become active recovery (light movement, mobility).
- Exercise selection unchanged — keep the same patterns to maintain motor efficiency.
- Frequency unchanged.

**Rationale:** Conditioning fatigue is primarily metabolic and hormonal (cortisol accumulation from sustained high-output work). Round reduction directly addresses this. Unlike strength, intensity targets cannot be adjusted via RIR — effort in conditioning is self-regulating. The narration cue is therefore the primary coaching mechanism for intensity adjustment.

**Important distinction:** Conditioning deloads should feel meaningfully easier than the preceding build weeks. If the athlete finishes the deload session feeling the same as a normal session, the round reduction was insufficient or the athlete ignored the effort cues.

---

### 1.5 HYROX deload (taper)

**Primary stress accumulation:** combination — aerobic volume from repeated AMRAP blocks, neuromuscular fatigue from station work, cumulative run volume.

**Deload vs taper distinction:** For HYROX, the final week of an 8-week block is better described as a **taper** than a deload. The goal is to arrive at race day (or the next training block) fresh, sharp, and with race rhythm preserved — not just recovered. This is a meaningful difference: a pure deload removes volume without preserving race specificity; a taper reduces volume while keeping race-specific patterns intact.

**Taper prescription:**
- Reduce total block volume (rounds) by **25–35%** — slightly less aggressive than a pure deload because maintaining race-movement patterns has high priority.
- Keep run buy-ins present on engine and endurance days — the run-to-station transition pattern is the most race-specific element and must not be dropped.
- Station prescriptions (distance/time equivalents) can be held at ~75% of peak week targets.
- Power day Block A (strength anchor) should still occur but at ~60% of peak volume.
- Narration should explicitly frame this as race preparation, not recovery: "sharpen transitions, preserve race rhythm, arrive fresh."

**The existing CONSOLIDATE phase is correct for HYROX:** The current `last_week_mode: "consolidate"` in the HYROX config is architecturally appropriate. The CONSOLIDATE label already carries the right coaching intent in the seed narration copy. The HYROX final week should **not** be relabelled DELOAD — it has distinct race-specific intent that differs from a true deload.

---

## Part 2 — Architecture analysis

### 2.1 What the engine already supports

Inspecting the live DB and pipeline code reveals that the architecture **already has partial deload support that is not yet being used**:

**In `03_applyProgression.js` (lines 74–82):**
```js
const dl = progCfg.deload || null;
if (dl && toInt(dl.week, 0) === toInt(weekIndex, 0)) {
  const dlAll = dl.apply_to_all !== undefined ? yes(dl.apply_to_all) : true;
  if (dlAll || purposeAllowed) {
    let mult = dl.set_multiplier ?? 0.7;
    const deloadSets = Math.round(baseSets * mult);
    return Math.max(1, deloadSets);
  }
}
```
The progression step already reads a `deload.week` and `deload.set_multiplier` from `progression_by_rank_json` and applies it to both sets (single segments) and rounds (circuit segments). This is the core volume reduction mechanism and it works for all four program types.

**In `05_applyNarration.js` (lines 440–442):**
```js
if (lastMode === "deload") out[out.length - 1] = "DELOAD";
```
The narration step already recognises `last_week_mode: "deload"` in `week_phase_config_json` and can label the final week as DELOAD in the phase sequence. No code change needed.

**What exists in live DB configs:**

| config_key | total_weeks | last_week_mode | deload in progression_by_rank? |
|---|---|---|---|
| `hypertrophy_default_v1` | 4 | `consolidate` | No |
| `strength_default_v1` | 4 | `consolidate` | No |
| `conditioning_default_v1` | 4 | `consolidate` | No |
| `hyrox_default_v1` | 8 | `consolidate` | No |

All four configs use `consolidate` and none have a `deload` block. The consolidate label is currently a soft taper in narration only — it does not reduce volume. This is the gap.

---

### 2.2 What is missing

**Gap 1 — No volume reduction in deload week (hypertrophy, strength, conditioning)**

The consolidate phase currently only affects narration labels and copy text. It does not trigger any set or rounds reduction in step 3 because no `deload` block exists in `progression_by_rank_json`. Fixing this requires only a config seed change — no code.

**Gap 2 — RIR is not adjusted during deload week**

The progression step adjusts `sets` and `rounds` but has no mechanism to modify `rir_target` for deload weeks. For hypertrophy and strength, increasing RIR by 2 during the deload week is an important coaching prescription. This requires a small code change in `03_applyProgression.js` to write a `rir_deload_bump` value onto items during the deload week, and a corresponding read in `04_applyRepRules.js` to add it to the applied `rir_target`. This is a small but meaningful enhancement.

**Gap 3 — HYROX taper is correct as-is but volume is not reduced**

The HYROX consolidate week currently only changes narration copy — the actual block rounds remain at full volume. To make the consolidate week a true taper, the `deload` block should be added to `progression_by_rank_json` with a moderate multiplier (~0.7) and `apply_to_all: true`. Importantly, `last_week_mode` should stay `"consolidate"` (not `"deload"`) to preserve the race-specific narration intent.

---

### 2.3 Recommended implementation approach

**Two layers of change:**

**Layer 1 — Config-only (seed changes, no code):**
All volume reduction is handled entirely via `R__seed_program_generation_config.sql`. No pipeline code needs to change.

For `hypertrophy_default_v1` and `strength_default_v1`:
- Change `last_week_mode` from `"consolidate"` to `"deload"` in `week_phase_config_json`
- Add a `DELOAD` entry to `phase_labels` with an appropriate display label
- Add `DELOAD` copy text (focus + notes) that communicates reduced effort intent
- Add a `deload` block to every rank in `progression_by_rank_json`:
  ```json
  "deload": { "week": 4, "set_multiplier": 0.65, "apply_to_all": true }
  ```
  Note: `week` must match `total_weeks_default` (currently 4 for both). For rank-specific tuning, advanced/elite could use a slightly lower multiplier (more volume preserved) since they accumulate and manage fatigue differently from beginners.

For `conditioning_default_v1`:
- Same as above — `last_week_mode: "deload"`, deload block with `set_multiplier: 0.65`
- Rounds reduction (circuits) is already handled by the same `computeSetsForWeek` path
- Add conditioning-specific DELOAD copy: "Sub-threshold effort. Focus on breathing control, not output."

For `hyrox_default_v1`:
- Keep `last_week_mode: "consolidate"` — do not change to deload
- Add `deload` block with `set_multiplier: 0.70` (less aggressive taper than pure deload)
- This gives the HYROX consolidate week an actual volume reduction for the first time while preserving the race-taper narration intent

**Layer 2 — Small code change for RIR adjustment (recommended, not strictly required for v1):**

In `03_applyProgression.js`, within the deload branch:
- Read an optional `rir_bump` integer from the deload config block (e.g. `dl.rir_bump ?? 2`)
- Write `it.deload_rir_bump = rir_bump` onto each item during the deload week
- In `04_applyRepRules.js`, after applying the rep rule, if `item.deload_rir_bump` is set, add it to the item's `rir_target`

This is approximately 10–15 lines of code across two files and makes the deload physiologically complete for hypertrophy and strength. It is optional for conditioning (RIR is not a conditioning metric) and HYROX (effort is self-regulated in AMRAPs).

---

### 2.4 Deload week as the final week — always

The `deload.week` config value should always equal `total_weeks_default`. This is a coach-authored invariant: the deload is always the last week of the block. The engine does not need to compute this dynamically — it reads the explicit config value.

If a user selects a shorter program length (e.g. 3 weeks from a 4-week default), the deload config will reference week 4 which will not exist. The progression step already handles this gracefully — the deload branch only fires when `weekIndex === dl.week`, so a shorter program simply produces no deload week. This is acceptable for v1.

A future enhancement would be to make the deload week relative (always the last week regardless of program length), which would require changing `deload.week` from an absolute integer to a relative marker like `"last"`. This is not needed for the initial implementation.

---

### 2.5 Summary of changes by program type

| Program | last_week_mode | Deload in progression config | RIR bump | Code change? |
|---------|---------------|------------------------------|----------|--------------|
| Hypertrophy | `consolidate` → `deload` | Add `{ week: 4, set_multiplier: 0.65, rir_bump: 2 }` | Yes (RIR +2) | Layer 2 optional |
| Strength | `consolidate` → `deload` | Add `{ week: 4, set_multiplier: 0.65, rir_bump: 2 }` | Yes (RIR +2) | Layer 2 optional |
| Conditioning | `consolidate` → `deload` | Add `{ week: 4, set_multiplier: 0.65 }` | No | None |
| HYROX | Keep `consolidate` | Add `{ week: 8, set_multiplier: 0.70 }` | No | None |

Layer 1 alone (config seed changes only) produces a functionally correct deload for all four program types. Layer 2 (RIR adjustment) makes hypertrophy and strength deloads physiologically complete and is recommended.

---

### 2.6 What does not need to change

- **Exercise selection**: The deload week uses identical exercises to the preceding build weeks. No new slot logic, no movement simplification. This is correct — movement pattern continuity is important for deload week.
- **Rep ranges**: Unchanged. Deload reduces sets and RIR, not reps.
- **Frequency**: Same number of days per week.
- **Segment structure**: Same number of segments per day.
- **Emitter and mobile read path**: No changes. The deload state is fully expressed in the program JSON via adjusted sets, rounds, and optionally rir_target — the emitter and read path handle this transparently.
