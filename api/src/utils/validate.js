const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RequestValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "RequestValidationError";
    this.status = 400;
    this.details = details;
  }
}

export function safeString(value, { trim = true, maxLength = null, fallback = "" } = {}) {
  if (value == null) return fallback;
  let text = String(value);
  if (trim) text = text.trim();
  if (Number.isInteger(maxLength) && maxLength >= 0) {
    text = text.slice(0, maxLength);
  }
  return text;
}

export function requireNonEmpty(value, fieldName, options = {}) {
  const text = safeString(value, options);
  if (!text) {
    throw new RequestValidationError(`${fieldName} is required`);
  }
  return text;
}

export function requireUuid(value, fieldName) {
  const text = requireNonEmpty(value, fieldName);
  if (!UUID_RE.test(text)) {
    throw new RequestValidationError(`Invalid ${fieldName}`);
  }
  return text;
}

export function requireEnum(value, fieldName, allowedValues) {
  const text = requireNonEmpty(value, fieldName);
  const allowed = Array.isArray(allowedValues) ? allowedValues : [...allowedValues ?? []];
  if (!allowed.includes(text)) {
    throw new RequestValidationError(`Invalid ${fieldName}`);
  }
  return text;
}

export function clampInt(value, { defaultValue = 0, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(safeString(value), 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}
