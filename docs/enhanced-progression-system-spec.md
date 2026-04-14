# Enhanced Progression System Spec — Revision 2

## Changelog from Revision 1

The following structural issues from the initial review have been addressed in this revision:

- RIR-unavailable fallback path fully specified (Section 4)
- `progression_group_key` construction fully defined (Section 10)
- All lever profiles referenced in `slot_profile_map` are now defined with examples (Section 3)
- `hyrox_station_load` band format inconsistency resolved (Section 6)
- Finalization trigger for recomputation fully specified (Section 9)
- Local vs global deload interaction with Step 03 specified (Section 8)
- Decision output enum values enumerated (Section 4)
- `evidence_requirement_multiplier` base value defined (Section 3)
- `slot_profile_map` lookup failure fallback specified (Section 4)
- `decision_engine_version` default/fallback specified (Section 3)
- `set_progression_enabled` vs old `weekly_set_step` / `max_extra_sets` layer ownership clarified (Section 3)
- Pipeline step ordering for new override step specified (Section 9)
- Baseline loads / starting weights cold-start interaction addressed (Section 10)
- Schema version and migration path clarified (Section 11)
- `lever_profiles` naming rationale explained replacing the earlier `progression_rules` label (Section 3)
- History filter boundary specified for decision service (Section 9)
- Double progression rep reset behavior explicitly stated (Section 6)

---

## 1. Executive Summary

The current progression model in `bubble-workout-engine` is too limited for the data the system now has available. At present, progression is effectively:

- purpose-gated via `program_generation_config_json.progression.apply_to_purposes`
- rank-scaled via `progression_by_rank_json`
- implemented in the pipeline as a weekly `sets` or `rounds` bump
- optionally reduced by a scheduled deload week

This was a reasonable first step, but it is not sufficient for athlete-responsive programming after the first workout week. It does not explicitly support:

- load progression
- rep progression as a first-class decision
- rest as a progression lever
- RIR-gated decision logic
- explicit `hold` as a normal outcome
- explicit `deload` distinct from `hold`
- program-type-specific progression priorities
- equipment- and exercise-specific load increments
- history-driven decision making using logged performance

The enhanced model should preserve the engine's config-driven philosophy while introducing a second layer of progression logic:

**Layer A — Block-level structural progression**
- still handled by the existing generation pipeline in `03_applyProgression.js`
- controls scheduled week-level set/round shaping and planned deload/taper behavior
- continues to use the current `progression_by_rank_json` deload config

**Layer B — Exercise exposure progression**
- new athlete-specific decision logic in a dedicated service
- uses real workout logs after week 1
- chooses one main progression lever at a time
- uses RIR as the primary progression gate when available; falls back to rep and load trend when RIR is absent
- produces one of: `increase_load`, `increase_reps`, `increase_sets`, `reduce_rest`, `hold`, `deload_local`
- varies by program type, slot purpose, exercise family, implement, and fitness level

**Layer C — Prescription override application**
- a new pipeline step that reads persisted Layer B decisions and applies them to the generated prescription before emission

The recommended architecture is:

- keep scheduled structural progression in the existing pipeline (Layer A)
- add a dedicated progression decision service for post-week-1 athlete-specific progression (Layer B)
- persist progression state and decision history
- apply persisted progression overrides in a later generation step (Layer C)

This approach keeps the system maintainable, auditable, and aligned with the current config and pipeline patterns.

---

## 2. Review of Current JSON

### Current config surfaces

The current progression-related surfaces are:

- `program_generation_config_json.progression.apply_to_purposes`
- top-level `progression_by_rank_json`
- top-level `week_phase_config_json`

Example current rank config:

```json
{
  "elite": {
    "max_extra_sets": 4,
    "weekly_set_step": 1
  },
  "advanced": {
    "max_extra_sets": 3,
    "weekly_set_step": 1
  },
  "beginner": {
    "max_extra_sets": 0,
    "weekly_set_step": 0
  },
  "intermediate": {
    "max_extra_sets": 2,
    "weekly_set_step": 1
  }
}
```

### What the engine currently does

The current implementation in `api/engine/steps/03_applyProgression.js`:

- increments `sets` on `single` segments
- increments `rounds` on circuit-like segments
- uses `weekly_set_step` and `max_extra_sets` from the rank-specific block
- applies a scheduled deload via `progCfg.deload.week`, `set_multiplier`, and `rir_bump`
- does not use workout logs, load history, or RIR

The `deload` block read by Step 03 currently lives inside the per-rank entry in `progression_by_rank_json`:

```json
{
  "intermediate": {
    "max_extra_sets": 2,
    "weekly_set_step": 1,
    "deload": {
      "week": 4,
      "apply_to_all": true,
      "set_multiplier": 0.7,
      "rir_bump": 2
    }
  }
}
```

Step 03 reads `progCfg.deload` directly. This must remain in place.

The compiled config contract in `api/engine/resolveCompiledConfig.js` currently exposes:

- `progression.progressionByRank` — the full `progression_by_rank_json` object
- `progression.weekPhaseConfig` — the full `week_phase_config_json` object
- `progression.totalWeeksDefault`
- `progression.applyToPurposes`

### Current limitations

1. **Progression is mostly week-based, not performance-based**
   - it progresses according to week number, not athlete response

2. **Only sets/rounds are first-class progression levers**
   - there is no explicit load or rep progression model

3. **No RIR-gated logic**
   - the engine cannot decide whether an athlete was sufficiently far from failure to progress

4. **No explicit hold outcome**
   - the current model either progresses by schedule or deloads by schedule

5. **No explicit local deload logic**
   - there is only week-level scheduled volume reduction

6. **No exercise-aware increment logic**
   - a barbell squat, cable lateral raise, dumbbell bench, and sled push need different increment behavior

7. **No program-type-specific progression priorities**
   - hypertrophy, strength, conditioning, and HYROX should not all progress the same way

8. **No use of logged history**
   - the engine already has workout logging and history routes, but progression does not consume them

9. **`progression_by_rank_json` is overloaded**
   - it mixes structural set-step scheduling with deload config and will now also need to carry rank scaling for the new decision model

10. **Cannot enforce "one main lever at a time"**
    - because lever selection is not modeled explicitly

---

## 3. Recommended JSON Schema Enhancements

### Naming note: `lever_profiles` not `progression_rules`

The earlier working name `progression_rules` was dropped in favour of `lever_profiles`. A "rule" implies a condition-action pair. A "profile" better describes what this section is: a reusable configuration bundle that defines priorities, strategy references, and constraints for a specific context. Each profile is then referenced by name from `slot_profile_map`. This naming is used consistently throughout the spec.

### Design goals

The enhanced config should:

- remain config-driven
- stay inside the existing `program_generation_config_json` philosophy
- separate base progression logic from rank overrides
- allow program-type-specific lever priorities
- allow reusable increment and deload profiles
- support future admin editing and validation

### Layer ownership: which fields belong where

**Step 03 (`03_applyProgression.js`) reads from `progression_by_rank_json[rank]`:**

- `max_extra_sets` — unchanged
- `weekly_set_step` — unchanged
- `deload.week`, `deload.set_multiplier`, `deload.rir_bump`, `deload.apply_to_all` — unchanged

These fields must not be removed from `progression_by_rank_json`. Step 03 is not being changed.

**New Layer B decision service reads from `program_generation_config_json.progression`:**

- `lever_profiles`
- `slot_profile_map`
- `load_increment_profiles`
- `implement_increment_overrides`
- `rest_progression_profiles`
- `rep_progression_profiles`
- `deload_rules`
- `history`
- `outcomes`

**New `progression_by_rank_json` fields (in addition to existing fields):**

- `evidence_requirement_multiplier`
- `rir_progress_gate_offset`
- `load_increment_scale`
- `set_progression_enabled`
- `rest_reduction_aggressiveness`

### `decision_engine_version` default

The `progression` block inside `program_generation_config_json` should declare the version of the decision engine to use. If absent, the default is `"v1"`, meaning only Layer A structural progression runs. The new logic activates when `"v2"` is present.

```json
{
  "progression": {
    "decision_engine_version": "v2"
  }
}
```

### Full recommended `program_generation_config_json.progression` structure

```json
{
  "progression": {
    "apply_to_purposes": ["main", "secondary", "accessory"],
    "decision_engine_version": "v2",

    "history": {
      "lookback_exposures_exact": 3,
      "lookback_exposures_equivalent": 2,
      "minimum_exact_exposures_for_full_confidence": 2,
      "allow_equivalent_history_fallback": true,
      "history_filter": {
        "require_program_day_is_completed": true,
        "require_is_draft_false": true
      }
    },

    "outcomes": {
      "allow_multiple_levers_same_exposure": false,
      "allow_secondary_rest_adjustment_with_density_progression": true
    },

    "lever_profiles": {
      "hypertrophy_main": {
        "priority_order": ["reps", "load", "sets", "hold", "deload"],
        "rest_strategy": "stable",
        "load_increment_profile": "compound_moderate",
        "rep_progression_profile": "double_progression_main",
        "set_progression_profile": "hypertrophy_sets",
        "deload_profile": "standard_local"
      },
      "hypertrophy_secondary": {
        "priority_order": ["reps", "load", "hold", "deload"],
        "rest_strategy": "stable",
        "load_increment_profile": "compound_moderate",
        "rep_progression_profile": "double_progression_secondary",
        "set_progression_profile": "hypertrophy_sets",
        "deload_profile": "standard_local"
      },
      "hypertrophy_accessory": {
        "priority_order": ["reps", "sets", "hold", "deload"],
        "rest_strategy": "allow_reduce",
        "load_increment_profile": "small_isolation",
        "rep_progression_profile": "double_progression_accessory",
        "set_progression_profile": "hypertrophy_sets",
        "deload_profile": "standard_local"
      },
      "strength_main": {
        "priority_order": ["load", "reps", "hold", "deload"],
        "rest_strategy": "increase_if_needed",
        "load_increment_profile": "barbell_strength",
        "rep_progression_profile": "tight_strength_reps",
        "set_progression_profile": "planned_only",
        "deload_profile": "strength_local"
      },
      "strength_secondary": {
        "priority_order": ["load", "reps", "hold", "deload"],
        "rest_strategy": "stable",
        "load_increment_profile": "compound_moderate",
        "rep_progression_profile": "tight_strength_reps",
        "set_progression_profile": "planned_only",
        "deload_profile": "strength_local"
      },
      "strength_accessory": {
        "priority_order": ["reps", "load", "hold", "deload"],
        "rest_strategy": "stable",
        "load_increment_profile": "small_isolation",
        "rep_progression_profile": "double_progression_accessory",
        "set_progression_profile": "planned_only",
        "deload_profile": "standard_local"
      },
      "conditioning_main": {
        "priority_order": ["rest", "volume", "hold", "deload"],
        "rest_strategy": "density_primary",
        "rest_progression_profile": "conditioning_density",
        "volume_increment_step": 1,
        "deload_profile": "conditioning_local"
      },
      "conditioning_secondary": {
        "priority_order": ["rest", "volume", "hold", "deload"],
        "rest_strategy": "density_primary",
        "rest_progression_profile": "conditioning_density",
        "volume_increment_step": 1,
        "deload_profile": "conditioning_local"
      },
      "conditioning_accessory": {
        "priority_order": ["rest", "hold", "deload"],
        "rest_strategy": "density_primary",
        "rest_progression_profile": "conditioning_density",
        "deload_profile": "conditioning_local"
      },
      "hyrox_station_main": {
        "priority_order": ["rest", "volume", "load", "hold", "deload"],
        "rest_strategy": "race_density",
        "rest_progression_profile": "hyrox_density",
        "load_increment_profile": "hyrox_station",
        "deload_profile": "hyrox_local"
      },
      "hyrox_station_secondary": {
        "priority_order": ["rest", "volume", "hold", "deload"],
        "rest_strategy": "race_density",
        "rest_progression_profile": "hyrox_density",
        "deload_profile": "hyrox_local"
      },
      "hyrox_station_accessory": {
        "priority_order": ["rest", "hold", "deload"],
        "rest_strategy": "race_density",
        "rest_progression_profile": "hyrox_density",
        "deload_profile": "hyrox_local"
      }
    },

    "slot_profile_map": {
      "hypertrophy": {
        "main": "hypertrophy_main",
        "secondary": "hypertrophy_secondary",
        "accessory": "hypertrophy_accessory"
      },
      "strength": {
        "main": "strength_main",
        "secondary": "strength_secondary",
        "accessory": "strength_accessory"
      },
      "conditioning": {
        "main": "conditioning_main",
        "secondary": "conditioning_secondary",
        "accessory": "conditioning_accessory"
      },
      "hyrox": {
        "main": "hyrox_station_main",
        "secondary": "hyrox_station_secondary",
        "accessory": "hyrox_station_accessory"
      }
    },

    "slot_profile_fallback": "hypertrophy_accessory",

    "load_increment_profiles": {
      "barbell_strength": {
        "rounding_mode": "nearest_available",
        "default_available_increments_kg": [1.25, 2.5, 5.0],
        "bands": [
          { "min_load_kg": 0, "max_load_kg": 60, "increment_kg": 2.5 },
          { "min_load_kg": 60, "max_load_kg": 140, "increment_kg": 5.0 },
          { "min_load_kg": 140, "increment_kg": 2.5 }
        ]
      },
      "compound_moderate": {
        "rounding_mode": "nearest_available",
        "default_available_increments_kg": [1.25, 2.5, 5.0],
        "bands": [
          { "min_load_kg": 0, "max_load_kg": 40, "increment_kg": 2.5 },
          { "min_load_kg": 40, "max_load_kg": 100, "increment_kg": 5.0 },
          { "min_load_kg": 100, "increment_kg": 2.5 }
        ]
      },
      "small_isolation": {
        "rounding_mode": "nearest_available",
        "default_available_increments_kg": [1.0, 2.0],
        "bands": [
          { "min_load_kg": 0, "max_load_kg": 15, "increment_kg": 1.0 },
          { "min_load_kg": 15, "increment_kg": 2.0 }
        ]
      },
      "hyrox_station": {
        "rounding_mode": "fixed",
        "default_increment_kg": 5.0,
        "bands": [
          { "min_load_kg": 0, "max_load_kg": 40, "increment_kg": 5.0 },
          { "min_load_kg": 40, "increment_kg": 10.0 }
        ]
      }
    },

    "implement_increment_overrides": {
      "sled_push": { "increment_kg": 5.0 },
      "sled_pull": { "increment_kg": 5.0 },
      "carry": { "increment_kg": 2.5 },
      "wallball": { "increment_kg": 1.0 },
      "sandbag_lunge": { "increment_kg": 2.5 },
      "dumbbell": { "increment_kg": 2.0, "rounding_mode": "nearest_pair" },
      "cable": { "increment_kg": 2.5 },
      "machine": { "increment_kg": 2.5 }
    },

    "rest_progression_profiles": {
      "conditioning_density": {
        "default_action": "reduce_rest",
        "rest_step_sec": 10,
        "minimum_rest_sec": 20,
        "progress_gate": {
          "required_success_exposures": 2,
          "max_rir_drop_from_target": 0.5
        },
        "failure_response": {
          "increase_rest_sec": 15
        }
      },
      "hyrox_density": {
        "default_action": "reduce_rest",
        "rest_step_sec": 15,
        "minimum_rest_sec": 30,
        "progress_gate": {
          "required_success_exposures": 2,
          "max_rir_drop_from_target": 0.5
        },
        "failure_response": {
          "increase_rest_sec": 15
        }
      },
      "stable_strength_rest": {
        "default_action": "hold_rest",
        "increase_rest_on_failure_sec": 30,
        "max_rest_sec": 240
      }
    },

    "rep_progression_profiles": {
      "double_progression_main": {
        "mode": "within_range_then_load",
        "rep_range_expansion_step": 1,
        "require_top_of_range_exposures": 2,
        "on_load_increase_reset_reps_to": "bottom_of_range"
      },
      "double_progression_secondary": {
        "mode": "within_range_then_load",
        "rep_range_expansion_step": 1,
        "require_top_of_range_exposures": 2,
        "on_load_increase_reset_reps_to": "bottom_of_range"
      },
      "double_progression_accessory": {
        "mode": "within_range_then_sets",
        "rep_range_expansion_step": 1,
        "require_top_of_range_exposures": 1,
        "on_load_increase_reset_reps_to": "bottom_of_range"
      },
      "tight_strength_reps": {
        "mode": "load_first_small_rep_backfill",
        "rep_range_expansion_step": 0,
        "allow_rep_progression_only_when_load_not_ready": true
      }
    },

    "deload_rules": {
      "standard_local": {
        "underperformance_exposure_threshold": 2,
        "rir_miss_threshold": 1.5,
        "load_drop_threshold_pct": 5,
        "response": {
          "load_drop_pct": 5,
          "set_multiplier": 0.75,
          "rir_bump": 2
        }
      },
      "strength_local": {
        "underperformance_exposure_threshold": 2,
        "rir_miss_threshold": 1.5,
        "load_drop_threshold_pct": 5,
        "response": {
          "load_drop_pct": 7,
          "set_multiplier": 0.8,
          "rir_bump": 1,
          "rest_increase_sec": 30
        }
      },
      "conditioning_local": {
        "underperformance_exposure_threshold": 2,
        "pace_drop_threshold_pct": 7,
        "response": {
          "rest_increase_sec": 20,
          "volume_multiplier": 0.8
        }
      },
      "hyrox_local": {
        "underperformance_exposure_threshold": 2,
        "pace_drop_threshold_pct": 10,
        "response": {
          "rest_increase_sec": 30,
          "volume_multiplier": 0.8
        }
      }
    }
  }
}
```

### Recommended `progression_by_rank_json` evolution

The existing fields `max_extra_sets`, `weekly_set_step`, and `deload` must remain and continue to be read by Step 03 unchanged. Add the following new fields alongside them:

- `evidence_requirement_multiplier` — scales the base value of `minimum_exact_exposures_for_full_confidence` declared in the `history` block. Example: if `minimum_exact_exposures_for_full_confidence` is `2` and the multiplier is `1.5`, the effective requirement is `3` exposures rounded up.
- `rir_progress_gate_offset` — added to the RIR gate threshold at decision time. Negative values make the gate stricter (require more RIR headroom to progress). Positive values relax it.
- `load_increment_scale` — multiplied against the resolved base increment before rounding. `0.5` for elite means half the standard increment per step.
- `set_progression_enabled` — when `false`, the Layer B decision service will never return `increase_sets`. Layer A structural set progression in Step 03 still runs normally based on `weekly_set_step`.
- `rest_reduction_aggressiveness` — multiplied against the `rest_step_sec` in the rest progression profile. `0.8` means the athlete's rest reduces more slowly than the config default.

```json
{
  "progression_by_rank_json": {
    "beginner": {
      "max_extra_sets": 0,
      "weekly_set_step": 0,
      "deload": {
        "week": 4,
        "apply_to_all": true,
        "set_multiplier": 0.7,
        "rir_bump": 2
      },
      "evidence_requirement_multiplier": 0.8,
      "rir_progress_gate_offset": 0.5,
      "load_increment_scale": 1.0,
      "set_progression_enabled": false,
      "rest_reduction_aggressiveness": 0.75
    },
    "intermediate": {
      "max_extra_sets": 2,
      "weekly_set_step": 1,
      "deload": {
        "week": 4,
        "apply_to_all": true,
        "set_multiplier": 0.65,
        "rir_bump": 2
      },
      "evidence_requirement_multiplier": 1.0,
      "rir_progress_gate_offset": 0.0,
      "load_increment_scale": 1.0,
      "set_progression_enabled": true,
      "rest_reduction_aggressiveness": 1.0
    },
    "advanced": {
      "max_extra_sets": 3,
      "weekly_set_step": 1,
      "deload": {
        "week": 4,
        "apply_to_all": true,
        "set_multiplier": 0.65,
        "rir_bump": 2
      },
      "evidence_requirement_multiplier": 1.25,
      "rir_progress_gate_offset": -0.25,
      "load_increment_scale": 0.75,
      "set_progression_enabled": true,
      "rest_reduction_aggressiveness": 0.9
    },
    "elite": {
      "max_extra_sets": 4,
      "weekly_set_step": 1,
      "deload": {
        "week": 4,
        "apply_to_all": true,
        "set_multiplier": 0.6,
        "rir_bump": 2
      },
      "evidence_requirement_multiplier": 1.5,
      "rir_progress_gate_offset": -0.5,
      "load_increment_scale": 0.5,
      "set_progression_enabled": true,
      "rest_reduction_aggressiveness": 0.8
    }
  }
}
```

---

## 4. Recommended Progression Decision Model

### Valid enum values

The decision service must use these exact string values to enable stable testing and serialization.

**`outcome`**
- `increase_load`
- `increase_reps`
- `increase_sets`
- `reduce_rest`
- `hold`
- `deload_local`

**`confidence`**
- `high` — full exact history, clear signal
- `medium` — partial history or slightly mixed signals
- `low` — equivalent history only, or thin data
- `insufficient` — no usable history; hold always

**`evidence_source`**
- `exact_history` — exact exercise match used
- `equivalent_history` — equivalent key fallback used
- `baseline_load` — onboarding baseline load used as seed
- `structural_only` — no history; Layer A structural prescription only
- `no_history` — no usable data; hold

### RIR availability and fallback

The entire decision model is gated on `achieved_rir`, which is not yet stored. The following fallback chain must be implemented from the start.

**When `achieved_rir` is available:**
- use RIR as the primary progression gate as described in Step 4 below

**When `achieved_rir` is not available but rep and load data are:**
- fall through to rep-only evidence
- use `estimated_1rm_kg` trend as a proxy: stable or improving 1RM at similar rep counts implies adequate RIR
- cap confidence at `"medium"` when relying on this proxy
- treat as equivalent to `achieved_rir >= target_rir` for gating purposes, subject to the capped confidence

**When neither RIR nor rep/load data are available:**
- outcome is always `hold` with confidence `"insufficient"`

### Inputs

The decision model should use:

- `target_reps` or `target_rep_range` (min and max)
- `target_rir`
- `target_rest_sec`
- `prescribed_sets` or `prescribed_rounds`
- `achieved_reps` (per set, or best set)
- `achieved_load_kg`
- `achieved_rir` (optional — fallback path if absent)
- `estimated_1rm_kg` (proxy when RIR absent)
- recent exact exercise history (keyed by `exercise:{exercise_id}`)
- recent equivalent exercise history (keyed by equivalence key, as fallback)
- fitness level / rank
- program type
- segment purpose
- exercise class, family, and implement
- current week phase label
- previous progression decision outcome and streak counts from `exercise_progression_state`

### Priority principle

Only one main lever should progress at a time. The engine must not advance load, reps, and sets simultaneously. The only exception is density-style conditioning work where `allow_secondary_rest_adjustment_with_density_progression` is `true`, which permits a rest reduction to accompany a volume increase, but only in that specific context.

### Decision flow

#### Step 1: Resolve the lever profile

1. Look up `slot_profile_map[programType][purpose]` to get the profile name.
2. If the lookup fails (unknown program type or purpose), use `slot_profile_fallback` from config (default `"hypertrophy_accessory"`). Log a warning.
3. Look up the named profile in `lever_profiles`.
4. If `decision_engine_version` is absent or `"v1"`, skip the Layer B decision entirely and return `null` (Layer A structural only).

#### Step 2: Build evidence

Query workout history using the following priority:

1. Exact exercise history keyed by `exercise:{exercise_id}`, filtered to `program_day.is_completed = TRUE AND segment_exercise_log.is_draft = FALSE`, ordered by `program_day.scheduled_date DESC`, limited to `lookback_exposures_exact`.
2. If fewer than `minimum_exact_exposures_for_full_confidence` (scaled by `evidence_requirement_multiplier`) exact exposures are found, check whether `allow_equivalent_history_fallback` is `true` and query equivalent history up to `lookback_exposures_equivalent`.

Apply the rank multiplier to the minimum exposure requirement:
```
effective_min_exposures = ceil(minimum_exact_exposures_for_full_confidence * evidence_requirement_multiplier)
```

If total usable exposures is zero, return `hold` with `confidence: "insufficient"`.

#### Step 3: Score readiness

Compute from available history:

- `rep_success`: did the athlete achieve the target rep range top on recent exposures?
- `rir_gap`: `achieved_rir - target_rir` (positive = more reserve than needed)
- `load_trend`: stable, improving, or declining
- `underperformance_streak`: from `exercise_progression_state.underperformance_streak`
- `progress_streak`: from `exercise_progression_state.progress_streak`
- `confidence_level`: based on source and count of exposures

Produce a readiness label:
- `strong_progress` — clear multi-exposure signal, good RIR headroom
- `possible_progress` — signal present but not fully confirmed
- `hold` — signals mixed or insufficient
- `deload_candidate` — repeated underperformance present

#### Step 4: Apply the RIR gate

Apply the effective RIR threshold adjusted by `rir_progress_gate_offset`:
```
effective_rir_gate = target_rir + rir_progress_gate_offset
```

Interpretation:

| Condition | Implication |
|---|---|
| `achieved_rir >= effective_rir_gate + 0.5` | Strong readiness; progression likely appropriate |
| `effective_rir_gate - 0.5 <= achieved_rir < effective_rir_gate + 0.5` | Acceptable; progression possible with supporting evidence |
| `achieved_rir < effective_rir_gate - 0.5` | Progression should usually be blocked; hold |
| `achieved_rir < effective_rir_gate - 1.5` on 2+ exposures | Strong deload candidate |

When RIR is absent, substitute with the 1RM proxy as described above, capping confidence at `"medium"`.

#### Step 5: Check deload conditions before choosing a progression lever

Before proceeding to lever selection, check the `deload_rules` profile referenced by the lever profile. Deload takes priority over any progression lever if:

- `underperformance_streak >= underperformance_exposure_threshold`, AND
- `rir_gap < -(rir_miss_threshold)` on repeated exposures, OR
- load has declined by `>= load_drop_threshold_pct` at equivalent effort

If deload is indicated, return outcome `deload_local` immediately without evaluating levers.

#### Step 6: Choose one primary lever

Follow the profile's `priority_order`. Evaluate each lever in sequence and select the first one for which readiness conditions are met.

The profile's priority order for hypertrophy main is `["reps", "load", "sets", "hold", "deload"]`. This means the engine should try to progress reps first. If reps cannot progress, try load. If load cannot progress, try sets (if `set_progression_enabled`). If none qualify, output `hold`.

`hold` and `deload` in the priority order act as terminal fallbacks, not levers to "progress". `hold` should be returned when no lever qualifies. `deload` in the priority order is reached only if `deload_candidate` readiness was scored in Step 3 but not caught by the hard deload check in Step 5.

#### Step 7: Lever-specific readiness checks

**`increase_reps`**
- athlete is below the top of the prescribed rep range
- RIR gate met
- recent trend is stable or improving

**`increase_load`**
- top of rep range achieved on required consecutive exposures (per `require_top_of_range_exposures`)
- RIR gate met
- appropriate load increment is available and non-zero after applying `load_increment_scale`

**`increase_sets`**
- `set_progression_enabled` is `true` for this rank
- profile allows sets in `priority_order`
- no primary lever qualified above
- current prescribed sets is below an implicit cap (can be derived from `max_extra_sets` in rank config)

**`reduce_rest`**
- profile's `rest_strategy` is `"density_primary"`, `"race_density"`, or `"allow_reduce"`
- reps or output maintained
- RIR gate met
- current rest is above `minimum_rest_sec` in the rest progression profile

**`hold`**
- signals are mixed or weak
- insufficient evidence
- no other lever qualifies
- scheduled deload week is active (defer to Layer A outcome)

### Recommended decision output

```json
{
  "outcome": "increase_load",
  "primary_lever": "load",
  "recommended_load_delta_kg": 2.5,
  "recommended_rep_delta": 0,
  "recommended_set_delta": 0,
  "recommended_rest_delta_sec": 0,
  "confidence": "high",
  "evidence_source": "exact_history",
  "evidence_exposure_count": 3,
  "reasons": [
    "top of target rep range achieved on 2 consecutive exposures",
    "achieved RIR met target by >= 0.5"
  ]
}
```

All numeric deltas default to `0`. When `outcome` is `deload_local`, the deltas reflect the deload response from the matching `deload_rules` entry (negative load delta, negative set delta, positive rest delta).

### `slot_profile_fallback` behaviour

When a profile name cannot be resolved from `slot_profile_map`, the service must:
1. Use the `slot_profile_fallback` profile name from config
2. Set `confidence: "low"`
3. Append `"profile_fallback_used"` to `reasons`

---

## 5. Program-Type-Specific Logic

### Hypertrophy

Priority order for main: `reps → load → sets → hold → deload`

- Use double progression for all loadable work. Progress reps within the target range first. Once the athlete hits the top of the range on `require_top_of_range_exposures` consecutive exposures at target RIR, increase load and reset reps to the bottom of the range.
- `on_load_increase_reset_reps_to: "bottom_of_range"` must be explicitly implemented. After a load increase, the prescribed rep target for the next session is the lower bound of the rep range, not the previously achieved rep count.
- Set progression should apply to accessories and some secondary work. Heavy compounds at main slots should not gain sets from Layer B decisions; set growth at main slots is handled by Layer A.
- Rest is mostly stable. Accessories may use `allow_reduce` to progress density.
- `hold` is a normal and expected outcome each week for most exercises.

### Strength

Priority order for main: `load → reps → hold → deload`

- Main compounds should progress load cautiously and only with strong evidence.
- Rep progression is secondary and modest: a single rep added to a work set counts.
- Sets are mostly planned; Layer B does not add sets at main or secondary slots.
- Rest should not be reduced. If the athlete repeatedly underperforms, increasing rest is preferable to reducing load.
- Advanced and elite athletes require more evidence (higher `evidence_requirement_multiplier`) before load increases.

### Conditioning

Priority order for main: `rest → volume → hold → deload`

- Reducing rest is the primary progression lever. External load is not the priority.
- Use repeatability and sustained output as evidence. Pace stability across a session is more relevant than a single-set max.
- RIR still contributes but the primary gate for density work is sustained output.
- Volume progression (adding a round or station repeat) is the secondary lever.
- Load progresses only when density and volume are stable and the profile explicitly includes `load` in its priority order.
- Deload logic should focus on declining density or repeatability at similar effort.

### HYROX

Priority order for main: `rest → volume → load → hold → deload`

- Prioritise race-specific repeatability over pure station loading.
- Station load progresses only when it does not degrade overall session quality.
- Rest reductions and repeatability improvements are primary levers.
- Station load increments are implement-specific. Use `implement_increment_overrides` to apply the correct increment by implement type.
- Evidence of deteriorating overall session quality (multiple stations underperforming together) is a systemic signal. Treat as global deload candidate and defer to scheduled deload in `week_phase_config_json` rather than applying local deload to every station.

---

## 6. Load Increment Model

### Increment resolution order

When resolving the load increment for a given exercise:

1. Check `implement_increment_overrides[implement]` — if present, use that increment and rounding mode
2. Otherwise, resolve the profile from `lever_profiles[profile_name].load_increment_profile`
3. Within the profile, find the matching band for the athlete's current load
4. Apply `load_increment_scale` from `progression_by_rank_json[rank]`
5. Round to the nearest available increment defined by `default_available_increments_kg` using `rounding_mode`

### Rounding modes

- `nearest_available` — round to the nearest value in `default_available_increments_kg`
- `nearest_pair` — for dumbbells, round to the nearest dumbbell pair increment (typically 2 kg steps)
- `fixed` — use the increment as-is without further rounding

### Double progression rep reset

When `increase_load` is the outcome under a `double_progression_*` rep profile:
- The `recommended_load_delta_kg` is the resolved increment
- `recommended_rep_delta` must be set to `-(current_reps - rep_range_min)` to reset reps to the bottom of the range
- Both values must appear in the decision output, and both must be applied by Layer C

### Upper vs lower body

Use the band structure in the load increment profile to handle differences naturally. Lower-body barbell work tends to use larger increments at lower loads. No separate upper/lower flag is needed in the profile; the band breakpoints handle this.

### Rank scaling interaction

After the band increment is resolved, multiply by `load_increment_scale`:
```
final_increment = round_to_nearest_available(band_increment * load_increment_scale)
```

If the scaled increment rounds to zero, use the smallest available increment instead. Never return a zero increment as a progression outcome; instead return `hold`.

---

## 7. Rest Progression Model

### Rest strategy modes

| Strategy | Meaning |
|---|---|
| `stable` | Rest does not change unless a deload is applied |
| `allow_reduce` | Rest may be reduced if `reduce_rest` lever is selected |
| `increase_if_needed` | Rest may increase if repeated underperformance is detected |
| `density_primary` | Rest reduction is the first progression lever |
| `race_density` | Rest reduction is the first lever with race-specific minimum floor |

### When rest can be reduced

- Profile strategy is `density_primary`, `race_density`, or `allow_reduce`
- Reps or output have been maintained across `required_success_exposures` exposures
- RIR remains at or above the adjusted gate threshold
- Current rest is above the profile's `minimum_rest_sec`
- `rest_reduction_aggressiveness` is applied: `effective_step = rest_step_sec * rest_reduction_aggressiveness`

### When rest stays fixed

- Strategy is `stable`
- Athlete has not met success criteria
- Current rest is already at `minimum_rest_sec`

### When rest may increase

- Strategy is `increase_if_needed`
- Repeated failure is detected (underperformance streak >= threshold)
- Strength work is degrading at similar prescription
- A local deload response includes `rest_increase_sec`

### Config example

```json
{
  "rest_progression_profiles": {
    "conditioning_density": {
      "default_action": "reduce_rest",
      "rest_step_sec": 10,
      "minimum_rest_sec": 20,
      "progress_gate": {
        "required_success_exposures": 2,
        "max_rir_drop_from_target": 0.5
      },
      "failure_response": {
        "increase_rest_sec": 15
      }
    }
  }
}
```

---

## 8. Deload Logic

### Explicit distinction between hold, local deload, and global deload

| Outcome | Meaning | Source |
|---|---|---|
| `hold` | Prescription unchanged. Athlete not ready but not regressing. | Layer B |
| `deload_local` | One exercise or movement is pulled back. | Layer B |
| Global deload | Scheduled low-volume week across the full session. | Layer A (Step 03) |

### Hold

`hold` is a normal valid outcome. It should not be treated as failure. Use `hold` when:

- athlete is not clearly ready to progress
- evidence is insufficient
- signals are mixed
- current prescription appears appropriate
- a scheduled deload week is active (defer to Layer A)

### Local deload

Apply to a specific exercise or progression group when the `deload_rules` profile is triggered.

**Triggers:**
- `underperformance_streak >= underperformance_exposure_threshold`
- `rir_gap < -(rir_miss_threshold)` on two or more recent exposures
- load has declined by `>= load_drop_threshold_pct` at equivalent effort

**Response from config:**
- `load_drop_pct`: reduce current load by this percentage, then round to nearest available increment
- `set_multiplier`: multiply current prescribed sets by this value, round down, minimum 1
- `rir_bump`: increase prescribed RIR target by this amount
- `rest_increase_sec`: optionally increase rest

### Interaction with Step 03 global deload

Step 03 handles scheduled global deloads using `progCfg.deload.week`. When the scheduled deload week is active:

- Step 03 applies its `set_multiplier` and `rir_bump` to all exercises structurally
- The new `07_applyExerciseProgressionOverrides` step runs **after** Step 03 in the pipeline
- When the Layer B decision for an exercise on a scheduled deload week is `hold`, the override step makes no changes and Step 03's result stands
- When the Layer B decision is `deload_local`, the override step applies the local deload values. If both Step 03 and the local deload response reduce sets, the override step should take the **lower** of the two resulting set counts (not multiply them together)
- The override step must check `week_phase_config_json` to detect scheduled deload weeks and suppress progression outcomes (`increase_load`, `increase_reps`, etc.) during those weeks, replacing them with `hold`

### Distinguishing local vs global fatigue

**Likely local fatigue (apply local deload):**
- only one or a small number of exercises are underperforming
- same movement pattern repeatedly fails
- rest of the week's training looks stable

**Likely systemic fatigue (flag for review, defer to scheduled global deload):**
- many exercises are simultaneously underperforming
- RIR is broadly worse than target
- multiple sessions show the same pattern

Global fatigue detection from log data is out of scope for v1. The first implementation should prioritise:

- scheduled global deloads via Step 03
- evidence-based local deloads via Layer B

---

## 9. Where This Logic Should Run

### Recommended architecture

**Layer A — existing:** Step 03 continues unchanged, handling week-phase structural set/round progression and scheduled deloads.

**Layer B — new:** A dedicated progression decision service runs after workout logs are finalized. It produces and persists progression decisions to `exercise_progression_state` and `exercise_progression_decision`.

**Layer C — new:** A new pipeline step `07_applyExerciseProgressionOverrides.js` runs after `06_emitPlan.js`. It reads persisted progression state for the user and program type, matches exercises to their progression keys, and applies overrides to the emitted prescription before the program is saved.

### Pipeline step order

The full pipeline after this change:

```
01_buildProgramFromDefinition
02_segmentProgram
03_applyProgression        <- Layer A (unchanged)
04_applyRepRules
05_applyNarration
06_emitPlan
07_applyExerciseProgressionOverrides  <- new Layer C
```

Step 07 receives the output of Step 06 (the fully emitted plan) and the user's persisted progression state. It returns the modified plan with load, rep, set, and rest overrides applied.

### When Layer B runs

The finalization trigger is: `program_day.is_completed` transitions to `TRUE`.

The route that sets `is_completed = TRUE` on `program_day` should call the progression decision service as a post-commit side effect. This should be synchronous in v1 for simplicity, and can be moved to a background queue in a later phase if latency becomes a concern.

The service should:
1. Identify all exercises in the completed day via `program_exercise` and `segment_exercise_log`
2. For each exercise, gather history and run the decision flow
3. Upsert `exercise_progression_state`
4. Append rows to `exercise_progression_decision`

### History filter boundary

The progression history service must filter its queries identically to `historyExercise.js`:

```sql
AND program_day.is_completed = TRUE
AND segment_exercise_log.is_draft = FALSE
```

This is the canonical filter for "real completed performance data" in this system. Do not query in-draft or uncompleted session data.

### Why not read time

Read-time computation would make prescriptions unstable across requests, be difficult to audit, and harder to test.

### Why not only in Step 03

Step 03 is designed for deterministic week-based shaping. Mixing athlete-specific log analysis there would overload a clean responsibility boundary and cause Step 03 to run before actual execution data exists for the week.

### Persistence vs dynamic computation

Persist the progression state. Do not recompute dynamically on every read. This ensures:

- the same prescription is returned for repeated reads
- decisions are auditable via the decision log
- generation can be tested independently of live athlete data

---

## 10. Data Model / API Impacts

### Progression group key construction

This must be consistent across all services. The following keying strategy is required.

**Exact key** (primary): used for all state and decision rows
```
exercise:{exercise_id}
```
Example: `exercise:a3f8c2d1-...`

**Equivalence key** (fallback for history lookup only): used only when exact history is insufficient. Never used as the primary key for state rows.
```
family:{movement_family}|purpose:{purpose}|implement:{implement_type}|rep_zone:{rep_zone}
```
Example: `family:squat|purpose:main|implement:barbell|rep_zone:4_6`

The `rep_zone` is derived from the target rep range in the generated `program_exercise` row. Map as follows:
- max reps <= 5: `rep_zone: "1_5"`
- max reps <= 8: `rep_zone: "6_8"`
- max reps <= 12: `rep_zone: "9_12"`
- max reps > 12: `rep_zone: "13_plus"`

When an exercise changes due to selector variation (a different exercise fills the same slot), the new exercise gets its own `exercise:{new_exercise_id}` exact key. If it has no exact history, the equivalence key lookup covers it.

### Baseline loads cold-start

The new `Step2bBaselineLoadsScreen.tsx` onboarding screen captures anchor lift baseline loads (load, reps, RIR) for named estimation families before the first program is generated.

These baseline entries should seed `exercise_progression_state` as the initial state for the matching exercises in the athlete's first program. The seed process should:

1. Match each anchor lift entry to its `exercise_id`
2. Compute implied 1RM from the baseline load, reps, and RIR
3. Write an `exercise_progression_state` row with:
   - `current_load_kg_override` = baseline load
   - `last_outcome` = `hold`
   - `evidence_source` = `baseline_load`
   - `confidence` = `low`
4. Write an `exercise_progression_decision` row recording the seed event

When Layer C applies overrides during the first generated program, it should use these baseline state rows to set the initial prescribed load. This eliminates the cold-start problem for athletes who completed onboarding.

### Recommended new tables

#### `exercise_progression_state`

One row per user + progression key. Upserted after each finalized session.

```sql
CREATE TABLE exercise_progression_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  progression_key TEXT NOT NULL,
  program_type TEXT NOT NULL,
  exercise_id UUID NULL,
  purpose TEXT NOT NULL,
  current_load_kg_override NUMERIC(8,2) NULL,
  current_rep_target_override INT NULL,
  current_set_override INT NULL,
  current_rest_sec_override INT NULL,
  last_outcome TEXT NOT NULL DEFAULT 'hold',
  last_primary_lever TEXT NULL,
  progress_streak INT NOT NULL DEFAULT 0,
  underperformance_streak INT NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'insufficient',
  evidence_source TEXT NOT NULL DEFAULT 'no_history',
  last_decided_at TIMESTAMPTZ NULL,
  last_source_program_day_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, progression_key, program_type)
);
```

#### `exercise_progression_decision`

Append-only audit log. One row per decision event.

```sql
CREATE TABLE exercise_progression_decision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  program_id UUID NULL,
  program_day_id UUID NULL,
  exercise_id UUID NULL,
  progression_key TEXT NOT NULL,
  decision_outcome TEXT NOT NULL,
  primary_lever TEXT NULL,
  recommended_load_delta_kg NUMERIC(8,2) NULL,
  recommended_rep_delta INT NULL,
  recommended_set_delta INT NULL,
  recommended_rest_delta_sec INT NULL,
  confidence TEXT NOT NULL,
  evidence_source TEXT NOT NULL,
  evidence_exposure_count INT NULL,
  evidence_summary_json JSONB NULL,
  decision_context_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Optional additions to existing logging

RIR is already captured as `rir_actual NUMERIC(3,1) NULL` on `segment_exercise_log` (present since V1). The column is already read by `progressionDecisionService.js`. No migration is needed. All spec references to `logged_rir` should be read as `rir_actual`.

### API impacts

**Route that sets `is_completed = TRUE` on `program_day`:**
- After committing the `is_completed` update, call the progression decision service synchronously
- The progression decision service result does not need to be returned in the response body

**Read program route:**
- Optionally annotate each `program_exercise` in the emitted response with `progression_hint` metadata:
  ```json
  {
    "progression_hint": {
      "outcome": "increase_load",
      "recommended_next_load_kg": 82.5,
      "confidence": "high"
    }
  }
  ```

**Admin / debug routes:**
- Expose the `exercise_progression_decision` table for a given user and program to support observability
- Expose the current `exercise_progression_state` table entries per user

---

## 11. Implementation Plan

### Phase 1: Config and schema foundation

1. Extend `program_generation_config_json.progression` with the new fields:
   - `decision_engine_version`
   - `history`
   - `outcomes`
   - `lever_profiles`
   - `slot_profile_map`
   - `slot_profile_fallback`
   - `load_increment_profiles`
   - `implement_increment_overrides`
   - `rest_progression_profiles`
   - `rep_progression_profiles`
   - `deload_rules`

2. Extend `progression_by_rank_json` with the five new rank scaling fields per rank entry. Keep all existing fields unchanged.

3. Update `api/engine/configValidation.js` to validate the new progression sections.

4. Update `migrations/R__seed_program_generation_config.sql` for all four program types:
   - `hypertrophy_default_v1`
   - `strength_default_v1`
   - `conditioning_default_v1`
   - `hyrox_default_v1`

   These are repeatable migrations that re-run on checksum change. Do not bump the `schema_version` field on the config row; the `decision_engine_version` field inside `progression` is the versioning mechanism for Layer B behavior.

5. Update `api/engine/resolveCompiledConfig.js` to expose the full `progression` block from `program_generation_config_json` on the compiled config output:
   ```js
   progression: {
     ...existing fields,
     config: pgcJson?.progression ?? {}
   }
   ```

### Phase 2: Data capture prerequisites

1. Add `V58__add_logged_rir_to_segment_exercise_log.sql` (nullable column, non-breaking)
2. Add `V59__create_exercise_progression_state.sql`
3. Add `V60__create_exercise_progression_decision.sql`

### Phase 3: Build progression services

1. Add `api/src/services/progressionHistoryService.js`
   - `getExactHistory(db, userId, exerciseId, limit, filter)` — returns array of exposures
   - `getEquivalentHistory(db, userId, equivalenceKey, limit, filter)` — returns array of exposures
   - Always applies `is_completed = TRUE` and `is_draft = FALSE` filter

2. Add `api/src/services/progressionDecisionService.js`
   - `resolveProgressionKey(exerciseId)` — returns exact key
   - `resolveEquivalenceKey(exercise, purpose, repRange)` — returns equivalence key
   - `resolveRepZone(repRangeMax)` — returns rep zone label
   - `resolveLoadIncrement(currentLoad, leverProfile, rankConfig, exerciseMeta)` — returns increment in kg or zero
   - `scoreReadiness(history, prescription, rankConfig)` — returns readiness label and confidence
   - `decideProgression(context)` — runs the full decision flow, returns decision output object
   - `upsertProgressionState(db, userId, progressionKey, decision)` — writes state row
   - `appendProgressionDecision(db, userId, context, decision)` — writes audit row

3. Add `api/src/services/progressionSeedService.js`
   - `seedFromBaselineLoads(db, userId, anchorLiftEntries)` — seeds progression state from onboarding baseline

### Phase 4: Integrate with generation

1. Keep `03_applyProgression.js` unchanged (Layer A)
2. Add `api/engine/steps/07_applyExerciseProgressionOverrides.js` (Layer C)
   - Accepts emitted plan and `progressionStateByKey` map
   - Matches each program_exercise to its progression key
   - Applies load / rep / set / rest deltas from state
   - Suppresses progression outcomes during scheduled deload weeks
   - Applies the lower of local deload and structural deload when both are active
   - Emits `progression_override_debug` annotations on each affected exercise
3. Update `api/engine/generateProgramV2.js` to call `07_applyExerciseProgressionOverrides` after `06_emitPlan`, passing the progression state fetched for the user

### Phase 5: Route and API changes

1. Identify the route that sets `program_day.is_completed = TRUE`
2. Add post-commit call to `progressionDecisionService` for each exercise in the completed day
3. Add `logged_rir` field to `POST /segment-log` body processing in `segmentLog.js`
4. Optionally expose `progression_hint` on program read routes
5. Add admin/debug routes for progression state and decision log

### Phase 6: Rollout

1. Deploy migrations (Phases 1-2) first; all new columns and tables are nullable or additive
2. The `decision_engine_version: "v2"` field in config activates Layer B. Keep it absent (defaulting to `"v1"`) until Phase 3-4 are stable
3. Start with hypertrophy and strength config keys
4. Add conditioning and HYROX after the core system is validated
5. Seed progression state from baseline load entries at onboarding (Phase 3 step 3)

---

## 12. Testing Plan

### Unit tests for decision logic (`progressionDecisionService`)

- Resolves correct lever profile for each program type / purpose combination
- Returns `hold` with `confidence: "insufficient"` when no history
- Returns `hold` with `confidence: "medium"` when relying on 1RM proxy (no RIR)
- RIR gate: blocks progression when `achieved_rir < effective_rir_gate - 0.5`
- RIR gate: allows progression when `achieved_rir >= effective_rir_gate + 0.5`
- `rir_progress_gate_offset` modifies the gate threshold correctly for each rank
- Deload is returned before lever evaluation when underperformance streak meets threshold
- Load increment: resolves correct band for given load value
- Load increment: `load_increment_scale` is applied before rounding
- Load increment: scaled increment rounding to zero returns smallest available increment, not zero
- Double progression: rep delta resets to `bottom_of_range` on load increase
- `evidence_requirement_multiplier` scales `minimum_exact_exposures_for_full_confidence` correctly with `ceil`
- `slot_profile_fallback` is used with `confidence: "low"` when profile lookup fails

### Config validation tests

- Valid and invalid `lever_profiles` entries
- `priority_order` entries reference valid outcome strings only
- Referenced profiles exist in their respective profile maps
- `slot_profile_map` entries reference defined lever profiles
- `slot_profile_fallback` references a defined lever profile
- Invalid band shapes in load increment profiles
- Missing `rest_step_sec` or `minimum_rest_sec` in rest progression profiles
- Invalid rank override fields

### Service integration tests

- Exact history used when available and above threshold
- Equivalent history fallback used only when exact history is below threshold
- Both `is_completed = TRUE` and `is_draft = FALSE` filters applied to history queries
- Progression state upserted correctly after decision
- Decision audit row appended with correct fields
- Progression recompute triggered on `program_day.is_completed = TRUE`
- Baseline load seed writes correct state rows with `evidence_source: "baseline_load"`

### Pipeline integration tests

- Step 07 applies load override from progression state to generated exercise
- Step 07 applies rep reset delta correctly after load increase
- Step 07 suppresses progression outcome during scheduled deload week (replaces with `hold`)
- Step 07 takes lower of local deload and Step 03 structural deload when both are active
- Step 07 makes no changes when progression state row is absent (graceful no-op)
- Full pipeline produces stable output given the same progression state input

### Regression cases by program type

**Hypertrophy**
- Reps progress before load (priority order respected)
- Sets do not increase at main slot in early weeks
- `hold` returned when RIR is below gate despite hitting target reps
- Load increases and reps reset to bottom of range after required exposures

**Strength**
- Load progresses before reps at main slot
- Rest is not reduced
- `hold` returned when evidence is insufficient
- Local deload applied after two consecutive underperformance exposures

**Conditioning**
- Rest reduction occurs before volume increase
- `deload_local` returned when density drops by `>= pace_drop_threshold_pct`

**HYROX**
- Rest density is first lever
- Station load uses implement override increment, not generic band
- Station load progression blocked when session-level deterioration is detected

### Hold vs progress vs deload cases

- Clear progress: `strong_progress` readiness, RIR gate met, lever qualifies → outcome is the lever
- Clear hold: mixed signals or `possible_progress` readiness with insufficient evidence
- Clear local deload: `deload_candidate` readiness, underperformance streak met
- Scheduled global deload: outcome is `hold` from Layer B, Step 03 applies structural reduction

### One-lever-at-a-time tests

- Load and reps do not both increase in a single decision output
- Sets do not increase simultaneously with load
- Rest does not reduce simultaneously with load or reps unless `allow_secondary_rest_adjustment_with_density_progression` is explicitly `true` in the profile

### Backward compatibility tests

- Old config rows without `decision_engine_version` default to `"v1"` and skip Layer B
- Structural progression still works when no progression state rows exist for the user
- Engine runs safely when the progression decision service returns an error (graceful fallback to structural prescription)
- `logged_rir` column absence does not break existing log routes or history queries
