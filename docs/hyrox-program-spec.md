# Hyrox Program Spec — v1 Design Reference

**Type:** Coaching & programming design reference
**Audience:** Developers implementing `program_type = "hyrox"`
**Companion:** `docs/codex-prompts-hyrox.md` (implementation prompts)
**Date:** 2026-03-13

---

## 1. Core principle: Hyrox is a run → station sport

The structural DNA of a Hyrox race is:

```
1km run → station
1km run → station
(× 8)
```

Every Hyrox training session should reflect this. Athletes must regularly experience:

- running before entering a station
- station work under aerobic fatigue
- returning to running after a station
- pacing themselves across repeated aerobic loads

This is not generic conditioning. It is race preparation.

**Non-negotiable rule for all Hyrox engine and endurance days:**
At least 2–3 of the 4 blocks per session must begin with a run buy-in.

---

## 2. Training philosophy

Hyrox success is fundamentally a **pacing problem**. Most athletes are strong enough and fit enough to finish a Hyrox race. What separates performers is:

- knowing how hard to run between stations
- arriving at each station under control
- having enough reserve to push through the final wallball station

This means the program must teach:

1. **Race rhythm** — run → arrive → work → leave — repeatedly, under fatigue
2. **Pacing discipline** — negative splits, sustainable output, not exploding early
3. **Station durability** — arriving at wallballs, carries, and sleds with something left
4. **Strength endurance** — the force production to maintain sled and carry performance late in a race

Strength for its own sake is not the goal. Strength that transfers to the sled, the carry, and run-to-station transitions is the goal.

---

## 3. Day types

Hyrox programming uses **three day types**, cycling by index across the week.

### 3.1 Engine day (`day_focus: "engine"`)

**Purpose:** Race rhythm, aerobic threshold, run-station conditioning

**Session format:** 4 × 8-min AMRAP blocks, 60s recovery between blocks

**Programming rules:**
- At least 3 of 4 blocks **must** begin with a run buy-in
- At least 1 block pairs a run with a core race station (wallball, burpee broad jump, sandbag lunge, ski/row erg, sled push/pull)
- At least 1 block per session should include a **carry** exposure
- At least 1 block per session should include a **wallball** exposure (directly or via station slot rotation)
- Session pace intent: sustainable, consistent, race-realistic — not sprint-and-collapse

**Example engine session (50 min):**
```
Block A — 8-min AMRAP
  400m run (buy-in)
  20 wallballs

Block B — 8-min AMRAP
  400m run (buy-in)
  300m ski erg

Block C — 8-min AMRAP
  50m farmer carry
  20 sandbag lunges

Block D — 8-min AMRAP
  400m run (buy-in)
  10 burpee broad jumps
```

### 3.2 Power day (`day_focus: "power"`)

**Purpose:** Lower-body force production, sled capacity, carry strength, station durability

**Session format:**
- Block A: strength singles (2 exercises, 3–5 sets each)
- Blocks B/C/D: 8-min AMRAP circuits

**Programming rules:**
- Block A **must** be a genuine strength / force-production anchor:
  - Prefer pairings like: front squat + push press, trap bar deadlift + push press, split squat + push press, heavy lunge + push press
  - **Do not** default to squat + row — horizontal pull volume does not improve sled push, sled pull, or carry performance as directly as vertical pushing power
  - Prioritise: lower-body force, vertical or overhead pressing power, trunk stiffness, carry transfer
- Block B should include **sled work** (push + pull if available, or fallback to carry)
- Blocks B/C/D should collectively include: sled, carry, and wallball within the session
- At least 1 AMRAP block should include a run buy-in
- Race-transfer emphasis: every exercise in the session should either build race-station capacity or improve the transitions between them

**Example power session (50 min):**
```
Block A — Strength singles (4 sets × 3–5 reps, 3-min rest)
  Front squat
  Push press

Block B — 8-min AMRAP
  20m sled push
  20m sled pull
  20 wallballs

Block C — 8-min AMRAP
  400m run (buy-in)
  50m farmer carry

Block D — 8-min AMRAP
  300m ski erg
  15 push presses
```

### 3.3 Endurance day (`day_focus: "endurance"`)

**Purpose:** Extended aerobic engine, threshold capacity, longer race-rhythm exposure

**Session format:** 4 × 10-min AMRAP blocks, 90s recovery between blocks

**Key distinction from engine day:**
- All 4 blocks have run buy-ins (vs 3/4 on engine day)
- Longer time cap (10 min vs 8 min) — more total aerobic volume per block
- Pacing intent is threshold/aerobic steady-state, not near-maximal
- This is where longer engine exposure lives in v1: 4 × 10-min sustained work

**Programming rules:**
- All 4 blocks begin with a run buy-in
- Station pairs should reflect race-order variety (erg, carry, lunge, wallball)
- Pacing cue: if athletes are significantly faster in block 4 than block 1, they paced incorrectly

**Example endurance session (60 min):**
```
Block A — 10-min AMRAP
  400m run (buy-in)
  300m row erg

Block B — 10-min AMRAP
  400m run (buy-in)
  25 wallballs

Block C — 10-min AMRAP
  400m run (buy-in)
  50m farmer carry

Block D — 10-min AMRAP
  400m run (buy-in)
  20 sandbag lunges
```

**Note on longer engine work:**
The endurance day's 10-min blocks naturally produce higher run volume than engine day (same distance, more rounds, more time). For true long-engine sessions (8km run, 8 × 1km intervals, 40-min threshold piece), a future `hyrox_long_engine` day type should be defined. For v1, the 10-min block format is the primary longer-engine delivery mechanism.

---

## 4. Weekly structures

Day templates cycle by index: `[engine_day, power_day, endurance_day]`

| Days/week | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|---|---|---|---|---|---|
| 3 | Engine | Power | Endurance | — | — |
| 4 | Engine | Power | Endurance | Engine | — |
| 5 | Engine | Power | Endurance | Power | Engine |

**Why this rotation works:**
- 3-day: covers all three training modes, one exposure each
- 4-day: adds a second engine day, which most athletes benefit from most
- 5-day: doubles power work for advanced/elite athletes
- No back-to-back power days (avoids neuromuscular fatigue accumulation)

---

## 5. Weekly programming minimums

These are non-negotiable minimums for every Hyrox week, regardless of day count:

| Requirement | Minimum |
|---|---|
| Run buy-in blocks | ≥ 6 across the week (≥ 2–3 per engine/endurance day) |
| Carry exposure | ≥ 1 per week (advanced/peak phases: ≥ 2) |
| Wallball exposure | ≥ 1 per week (build/peak phases: after run or carry/lunge) |
| Strength anchor | ≥ 1 (power day Block A) |
| Endurance session | ≥ 1 (endurance day, or engine day as fallback) |

---

## 6. Carry and wallball: race-limiter rules

### Carries

Farmer's carry is race station 6 and a major limiting factor for many athletes. It should not be treated as an optional variety exercise.

**Carry placement rules:**
- Appears at least once per week in every Hyrox program
- May appear as Block C anchor on engine days (no run buy-in needed — carry fatigue is inherent)
- Must appear in power day Block B/C alongside sled work
- In peak phases: appears twice per week (engine + power days both include carry)
- Valid substitution when sled is unavailable — carries are the best sled fallback

### Wallballs

Wallball is race station 8 — the final station, performed at maximum fatigue. It is consistently cited as the biggest race-day limiter.

**Wallball placement rules:**
- Appears at least once per week in every Hyrox program
- Must appear **after running** in at least one block per week — this is the race transfer
- In build/peak phases: should also appear after carries or lunges (cumulative lower-body fatigue)
- Acceptable wallball block patterns:
  - `400m run → 20 wallballs` ← priority pattern
  - `sandbag lunge → 20 wallballs`
  - `farmer carry → 20 wallballs`
  - `long interval → 25 wallballs`

---

## 7. Race station ordering and simulation

### Using `hyrox_station_index`

The official Hyrox race station order (as stored in `hyrox_station_index`):

| Index | Station |
|---|---|
| 1 | Ski Erg |
| 2 | Sled Push |
| 3 | Sled Pull |
| 4 | Burpee Broad Jump |
| 5 | Row Erg |
| 6 | Farmer's Carry |
| 7 | Sandbag Lunge |
| 8 | Wallball |

**For regular training sessions:**
Sessions do not need to follow race order. Mixing station order in training is intentional — athletes must learn to manage each station regardless of what came before it.

**For race simulation days:**
When a simulation day is used, the `hyrox_station_index` ordering must be preserved. Partial simulations should use consecutive race-order stations. Examples:
- Stations 1–3: ski erg, sled push, sled pull
- Stations 6–8: farmer carry, sandbag lunge, wallball (this covers the brutal final third)
- Stations 2–5: sled push, sled pull, burpee broad jump, row erg

### Race simulation: phase-based, not default

Race simulation is optional and phase-controlled. It should not appear in every week.

**Recommended simulation schedule:**
- Week 3 (end of BASELINE): 3-station partial simulation — introduces the format without full race stress
- Week 7 (PEAK): 5-station race rehearsal — full race conditions for confidence

**Implementation in v1:**
Race simulation days are a deferred feature. The `hyrox_station_index` metadata is built into the catalogue now so this can be added without schema changes later. When implemented, simulation should be:
- A separate day template (`race_sim_day`, focus: `"simulation"`)
- Activated via a PGC config flag (`race_simulation.enabled: true`) at specific week offsets
- Uses `hyrox_station_index` ordering explicitly in slot definitions

---

## 8. Buy-in execution: honest v1 description

The `is_buy_in: true` flag on the first item in an AMRAP segment is a **display and narration hint** in v1. It tells the app and narration system that this exercise should be positioned as a gateway movement before the main station work.

**What it does in v1:**
- Narration generates "Complete the run first, then cycle through the remaining movements"
- App may display the buy-in item with a visual distinction
- Slot ordering ensures buy-in is always item[0] in the AMRAP

**What it does NOT do in v1:**
- It does not enforce a "complete X distance, then for remaining time do Y" execution model
- Athletes still see the full AMRAP structure and decide their own pacing
- There is no engine-level enforcement of "run, then begin AMRAP clock"

**Future phase — proper buy-in execution model:**
A future extension should introduce:
```
segment_execution_mode: "buy_in_then_amrap_remainder"
```
This would enable the true Hyrox block structure:
- Complete the buy-in (e.g., 500m run) once
- In the remaining time, cycle through the station work as many times as possible

This is a meaningful UX improvement for advanced Hyrox programming. It requires app-side changes beyond this v1 spec.

---

## 9. Progression: v1 framing and future roadmap

### v1 progression vector

In v1, the primary progression mechanism is `rounds` — the target round count for each AMRAP block. This fits the existing architecture cleanly. Beginners maintain 3 rounds; intermediate/advanced athletes progress toward 4+ over the 8-week program.

**Honest assessment of rounds-as-progression:**
This is an approximation. In a real AMRAP, the athlete completes as many rounds as possible — the target is a pacing signal, not a hard limit. Progressively higher targets are a valid way to signal increasing demand, but it creates a "circuit fitness" feel if over-emphasised.

### Future progression vectors (post-v1)

The following progression mechanisms should be prioritised in a v2 design:

| Vector | Example | Value |
|---|---|---|
| Distance progression | 400m → 500m runs | More race-specific load |
| Station volume progression | 20 → 25 wallballs | Higher station demand |
| Rest reduction | 60s → 45s between blocks | Closer to race recovery |
| Simulation exposure | None → partial → full race | Mental and physical race prep |
| Race-order progression | Random station order → race order | Specificity |

The 8-week v1 program's phase labels (BASELINE, BUILD, PEAK, CONSOLIDATE) are designed to accommodate these progressions in later implementations without changing the phase schema.

---

## 10. Phase structure and 8-week plan

### Phase sequence

| Week | Phase | Key emphasis |
|---|---|---|
| 1 | BASELINE | Learn movements, establish pacing, sub-maximal effort |
| 2 | BASELINE | Repeat baseline, build block familiarity |
| 3 | BUILD | Add round targets, introduce race-rhythm intensity |
| 4 | BUILD | Increase station volume or carry/wallball demand |
| 5 | BUILD | (Optional: partial race simulation on endurance day) |
| 6 | PEAK | Near race-intensity effort across all blocks |
| 7 | PEAK | Race rehearsal intensity, simulation if configured |
| 8 | CONSOLIDATE | Reduce volume, sharpen transitions, arrive fresh |

### Deload

No explicit deload week in the default 8-week plan. CONSOLIDATE week functions as a taper. For 12-week variants, a deload at week 4 is recommended.

---

## 11. v1 scope vs future-phase features

### In v1

- Three day types: engine, power, endurance
- 8-minute AMRAP blocks (engine/power) and 10-minute AMRAP blocks (endurance)
- `is_buy_in` as display/narration hint
- `hyrox_station_index` in catalogue (ready for simulation)
- `post_segment_rest_sec` for 60s/90s inter-block recovery
- `time_cap_sec` per block from PGC
- Rounds-based progression (v1 proxy)
- 8-week program with 4 phases
- Carry and wallball coverage enforced via slot design, not engine rules

### Deferred to future phases

| Feature | Phase |
|---|---|
| Race simulation day template | Phase 2 |
| True buy-in execution mode (`buy_in_then_amrap_remainder`) | Phase 2 |
| Longer engine day type (`hyrox_long_engine`: 8km run, intervals) | Phase 2 |
| Distance-based progression (400m → 500m) | Phase 3 |
| Rest reduction as progression vector | Phase 3 |
| `day_focus` as rep rule matching field | Phase 3 |
| 12-week program variant | Phase 3 |

---

## 12. Exercise and slot design rules (summary)

| Rule | Enforcement mechanism |
|---|---|
| Run buy-in on ≥3 engine blocks | `is_buy_in: true` + slot ordering in PGC day template |
| Run buy-in on all 4 endurance blocks | `is_buy_in: true` on all 4 block-A slots |
| Carry in engine day | Block C uses `mp: "carry"` as primary slot |
| Wallball in engine day | Block A uses `sw: "wallball"` as station slot |
| Wallball in power day | Block B or D includes `sw: "wallball"` |
| Sled in power day | Block B uses `mp: "sled_push"` + `mp: "sled_pull"` with carry fallback |
| Strength anchor in power day | Block A `preferred_segment_type: "single"`, `mp: "squat"` + `mp: "push_vertical"` |
| Station fallback when sled unavailable | `fill_fallback_slot` pointing to carry slot |
