import { parse } from "csv-parse/sync";
import { makeAnchorLiftService } from "./anchorLiftService.js";

export function normalizeExerciseName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toFloat(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toInt(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

function toDateOnly(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function daysAgoIso(now, days) {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}

export function pickBestWorkingSet(rows) {
  const eligible = rows.filter(
    (row) => row.weight_kg != null && row.weight_kg > 0 && row.reps != null && row.reps >= 3 && row.reps <= 12,
  );
  if (!eligible.length) return null;
  eligible.sort((a, b) => {
    if (b.weight_kg !== a.weight_kg) return b.weight_kg - a.weight_kg;
    if (b.performed_at !== a.performed_at) return b.performed_at > a.performed_at ? 1 : -1;
    return Math.abs(a.reps - 5) - Math.abs(b.reps - 5);
  });
  return eligible[0];
}

export function makeTrainingHistoryImportService(db, options = {}) {
  const anchorLiftService = makeAnchorLiftService(db);
  const now = typeof options.now === "function" ? options.now : () => new Date();

  async function processHevyCsv({ csvBuffer, userId, clientProfileId }) {
    let records;
    try {
      records = parse(csvBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (err) {
      throw Object.assign(new Error(`CSV parse error: ${err.message}`), { code: "csv_parse_error" });
    }

    const first = records[0] ?? {};
    const hasRequiredColumns =
      ("Exercise Name" in first || "exercise_name" in first) &&
      ("Date" in first || "date" in first) &&
      ("Weight" in first || "weight" in first) &&
      ("Reps" in first || "reps" in first);
    if (records.length > 0 && !hasRequiredColumns) {
      throw Object.assign(new Error("CSV parse error: missing required Hevy columns"), { code: "csv_parse_error" });
    }

    const cutoffIso = daysAgoIso(now(), 90);
    const normalized = [];

    for (const record of records) {
      const rawName = record["Exercise Name"] ?? record.exercise_name ?? "";
      const performedAt = toDateOnly(record.Date ?? record.date ?? "");
      if (!performedAt || performedAt < cutoffIso) continue;

      normalized.push({
        raw_exercise_name: rawName,
        normalized_name: normalizeExerciseName(rawName),
        weight_kg: toFloat(record.Weight ?? record.weight ?? ""),
        reps: toInt(record.Reps ?? record.reps ?? ""),
        performed_at: performedAt,
      });
    }

    const uniqueNames = [...new Set(normalized.map((row) => row.normalized_name))];
    const aliasResult = uniqueNames.length > 0
      ? await db.query(
        `SELECT source_name_normalized, exercise_id, estimation_family
         FROM exercise_import_alias
         WHERE source_app = 'hevy'
           AND source_name_normalized = ANY($1::text[])
           AND is_active = TRUE`,
        [uniqueNames],
      )
      : { rows: [] };
    const aliasMap = new Map(aliasResult.rows.map((row) => [row.source_name_normalized, row]));

    const byFamily = new Map();
    const rowTraces = [];
    let unmappedCount = 0;

    for (const row of normalized) {
      const alias = aliasMap.get(row.normalized_name);
      if (!alias || !alias.estimation_family) {
        unmappedCount += 1;
        rowTraces.push({
          raw_exercise_name: row.raw_exercise_name,
          mapped_exercise_id: null,
          mapped_estimation_family: null,
          weight_kg: row.weight_kg,
          reps: row.reps,
          performed_at: row.performed_at,
          mapping_confidence: "none",
          warning_code: "unmapped_exercise_name",
        });
        continue;
      }

      const family = alias.estimation_family;
      if (!byFamily.has(family)) byFamily.set(family, []);
      byFamily.get(family).push({
        ...row,
        mapped_exercise_id: alias.exercise_id,
        mapped_estimation_family: family,
      });
      rowTraces.push({
        raw_exercise_name: row.raw_exercise_name,
        mapped_exercise_id: alias.exercise_id,
        mapped_estimation_family: family,
        weight_kg: row.weight_kg,
        reps: row.reps,
        performed_at: row.performed_at,
        mapping_confidence: "alias",
        warning_code: null,
      });
    }

    const bestSetKeys = new Set();
    for (const [family, rows] of byFamily) {
      const best = pickBestWorkingSet(rows);
      if (!best) continue;
      bestSetKeys.add(`${family}|${best.performed_at}|${best.weight_kg}|${best.reps}`);
    }

    const derivedAnchors = [];
    for (const [family, rows] of byFamily) {
      const best = pickBestWorkingSet(rows);
      if (!best) continue;
      derivedAnchors.push({
        estimationFamily: family,
        exerciseId: best.mapped_exercise_id,
        exerciseName: best.raw_exercise_name,
        loadKg: best.weight_kg,
        reps: best.reps,
        rir: null,
        skipped: false,
        source: "history_import",
        sourceDetailJson: { source_app: "hevy", performed_at: best.performed_at },
      });
    }

    const importStatus = derivedAnchors.length === 0
      ? "failed"
      : unmappedCount > 0
        ? "completed_with_warnings"
        : "completed";

    const importR = await db.query(
      `INSERT INTO training_history_import
         (user_id, client_profile_id, source_app, status, summary_json)
       VALUES ($1, $2, 'hevy', 'processing', '{}'::jsonb)
       RETURNING id`,
      [userId, clientProfileId],
    );
    const importId = importR.rows[0].id;

    const warnings = [];
    let savedAnchors = [];
    if (derivedAnchors.length > 0 && clientProfileId) {
      try {
        savedAnchors = await anchorLiftService.upsertAnchorLifts(clientProfileId, derivedAnchors);
      } catch (err) {
        warnings.push({ code: "anchor_upsert_error", message: err.message });
      }
    } else if (!clientProfileId) {
      warnings.push({ code: "no_client_profile", message: "No client profile - anchors not saved." });
    }

    if (unmappedCount > 0) {
      warnings.push({
        code: "unmapped_exercise_name",
        message: `Could not map ${unmappedCount} row${unmappedCount === 1 ? "" : "s"} to a supported estimation family.`,
      });
    }

    if (rowTraces.length > 0) {
      try {
        for (const trace of rowTraces) {
          await db.query(
            `INSERT INTO training_history_import_row
               (import_id, raw_exercise_name, mapped_exercise_id, mapped_estimation_family,
                weight_kg, reps, performed_at, mapping_confidence, warning_code, is_best_set)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              importId,
              trace.raw_exercise_name,
              trace.mapped_exercise_id,
              trace.mapped_estimation_family,
              trace.weight_kg,
              trace.reps,
              trace.performed_at,
              trace.mapping_confidence,
              trace.warning_code,
              trace.mapped_estimation_family != null &&
                bestSetKeys.has(
                  `${trace.mapped_estimation_family}|${trace.performed_at}|${trace.weight_kg}|${trace.reps}`,
                ),
            ],
          );
        }
      } catch {
        // Row-level trace persistence is best-effort only.
      }
    }

    const summaryJson = {
      total_rows: normalized.length,
      mapped_rows: normalized.length - unmappedCount,
      unmapped_rows: unmappedCount,
      derived_anchors: derivedAnchors.length,
      saved_anchors: savedAnchors.length,
      warnings,
      derived_anchor_lifts_snapshot: derivedAnchors.map((anchor) => ({
        family_slug: anchor.estimationFamily,
        exercise_name: anchor.exerciseName ?? null,
        weight_kg: anchor.loadKg,
        reps: anchor.reps,
        source: anchor.source,
      })),
    };

    await db.query(
      `UPDATE training_history_import
       SET status = $1,
           summary_json = $2,
           completed_at = now()
       WHERE id = $3`,
      [importStatus, JSON.stringify(summaryJson), importId],
    );

    return {
      import_id: importId,
      status: importStatus,
      derived_anchor_lifts: derivedAnchors.map((anchor) => ({
        family_slug: anchor.estimationFamily,
        exercise_name: anchor.exerciseName ?? null,
        weight_kg: anchor.loadKg,
        reps: anchor.reps,
        source: anchor.source,
      })),
      warnings,
      summary: summaryJson,
    };
  }

  async function getImport(importId, userId) {
    const { rows } = await db.query(
      `SELECT id, source_app, status, summary_json, created_at, completed_at
       FROM training_history_import
       WHERE id = $1
         AND user_id = $2`,
      [importId, userId],
    );
    return rows[0] ?? null;
  }

  return { processHevyCsv, getImport };
}
