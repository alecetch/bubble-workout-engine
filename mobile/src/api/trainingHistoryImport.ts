import { authGetJson, authPostFormData } from "./client";

export type TrainingHistoryDerivedAnchor = {
  familySlug: string;
  exerciseName: string | null;
  weightKg: number;
  reps: number | null;
  source: string;
};

export type TrainingHistoryWarning = {
  code: string;
  message: string;
};

export type TrainingHistoryImportResult = {
  importId: string;
  status: string;
  derivedAnchorLifts: TrainingHistoryDerivedAnchor[];
  warnings: TrainingHistoryWarning[];
  summary: {
    totalRows: number;
    mappedRows: number;
    unmappedRows: number;
    derivedAnchors: number;
    savedAnchors: number;
  };
};

export type TrainingHistoryImportRecord = {
  importId: string;
  status: string;
  sourceApp: string;
  rowCount: number;
  derivedAnchorCount: number;
  derivedAnchorLifts: TrainingHistoryDerivedAnchor[];
  warnings: TrainingHistoryWarning[];
  importedAt: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDerivedAnchor(raw: unknown): TrainingHistoryDerivedAnchor {
  const row = asObject(raw);
  return {
    familySlug: asString(row.family_slug ?? row.familySlug),
    exerciseName: asNullableString(row.exercise_name ?? row.exerciseName),
    weightKg: asNumber(row.weight_kg ?? row.weightKg),
    reps: row.reps == null ? null : asNumber(row.reps),
    source: asString(row.source),
  };
}

function normalizeWarnings(raw: unknown): TrainingHistoryWarning[] {
  return asArray(raw).map((item) => {
    const row = asObject(item);
    return {
      code: asString(row.code),
      message: asString(row.message),
    };
  });
}

export async function uploadTrainingHistoryCsv(file: {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
}): Promise<TrainingHistoryImportResult> {
  const formData = new FormData();
  formData.append("source_app", "hevy");
  formData.append("file", {
    uri: file.uri,
    name: file.name ?? "import.csv",
    type: file.mimeType ?? "text/csv",
  } as unknown as Blob);

  const raw = await authPostFormData<unknown>("/api/import/training-history", formData);
  const root = asObject(raw);
  const summary = asObject(root.summary);

  return {
    importId: asString(root.import_id ?? root.importId),
    status: asString(root.status),
    derivedAnchorLifts: asArray(root.derived_anchor_lifts ?? root.derivedAnchorLifts).map(normalizeDerivedAnchor),
    warnings: normalizeWarnings(root.warnings),
    summary: {
      totalRows: asNumber(summary.total_rows ?? summary.totalRows),
      mappedRows: asNumber(summary.mapped_rows ?? summary.mappedRows),
      unmappedRows: asNumber(summary.unmapped_rows ?? summary.unmappedRows),
      derivedAnchors: asNumber(summary.derived_anchors ?? summary.derivedAnchors),
      savedAnchors: asNumber(summary.saved_anchors ?? summary.savedAnchors),
    },
  };
}

export async function getTrainingHistoryImport(importId: string): Promise<TrainingHistoryImportRecord> {
  const raw = await authGetJson<unknown>(`/api/import/training-history/${importId}`);
  const root = asObject(raw);
  return {
    importId: asString(root.import_id ?? root.importId),
    status: asString(root.status),
    sourceApp: asString(root.source_app ?? root.sourceApp),
    rowCount: asNumber(root.row_count ?? root.rowCount),
    derivedAnchorCount: asNumber(root.derived_anchor_count ?? root.derivedAnchorCount),
    derivedAnchorLifts: asArray(root.derived_anchor_lifts ?? root.derivedAnchorLifts).map(normalizeDerivedAnchor),
    warnings: normalizeWarnings(root.warnings),
    importedAt: asNullableString(root.imported_at ?? root.importedAt),
  };
}
