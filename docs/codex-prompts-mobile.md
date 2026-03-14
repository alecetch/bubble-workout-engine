# Codex Implementation Prompts — Mobile App

Prompts for the React Native mobile app (separate repository).
Each prompt should be executed independently unless a dependency is noted.

---

## Prompt M1 — Segment Type Badge on Day Detail

### Context

You are working in the React Native mobile app codebase.

The **Day Detail** screen displays a list of workout segments fetched from:

```
GET /api/day/:program_day_id/full
```

Each segment in the `segments[]` array now includes two fields:

```json
{
  "segment_type": "superset",
  "segment_type_label": "Superset"
}
```

The `segment_type_label` is a human-readable string ready for direct display. The possible values are:

| `segment_type`  | `segment_type_label` |
|-----------------|----------------------|
| `single`        | `Single`             |
| `superset`      | `Superset`           |
| `giant_set`     | `Giant Set`          |
| `amrap`         | `AMRAP`              |
| `emom`          | `EMOM`               |
| `warmup`        | *(no badge)*         |
| `cooldown`      | *(no badge)*         |

The **Segment Card** component is supposed to show a type badge next to the segment title, but the badge is currently not rendered. The API is already returning the field — it just needs to be wired up in the UI.

---

### Files to read before writing anything

- The Segment Card component file (search for "SegmentCard" or the Day Detail screen file)
- The Day Detail screen to understand how segment data flows down to the card

---

### Task

In the **Segment Card** component:

1. Read `segment.segment_type_label` from the segment object passed as a prop.
2. Render a type badge **only** when `segment_type` is one of: `single`, `superset`, `giant_set`, `amrap`, `emom`. Do **not** render a badge for `warmup` or `cooldown` segments.
3. Position the badge next to (or below) the segment title — match the visual style already used for other badges in the app (pill shape, small text, muted background).
4. Display the `segment_type_label` string as-is — no transformation needed.

---

### Acceptance criteria

- [ ] Superset, Giant Set, Single, AMRAP, EMOM segments each show a badge with the correct label.
- [ ] Warmup and cooldown segments show no badge.
- [ ] Badge text matches the `segment_type_label` value from the API exactly.
- [ ] No hardcoded label strings — always read from `segment.segment_type_label`.
- [ ] No other UI areas are changed.

---

### Reference

- API contract: `docs/api-contracts.md` — Section 9 "Day Full Read" — segment shape
- Screen spec: `docs/mobile-screens.md` — Day Detail — Segment Card row
