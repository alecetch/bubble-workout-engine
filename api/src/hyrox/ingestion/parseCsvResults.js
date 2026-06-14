import fs from "node:fs";
import path from "node:path";
import { normaliseResult } from "./normaliseResult.js";
import { validateResult } from "../validation/validateResult.js";

export async function* parseCsvRows(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  let field = "";
  let row = [];
  let inQuotes = false;
  let sawAnyByte = false;

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i += 1) {
      const ch = chunk[i];

      if (!sawAnyByte) {
        sawAnyByte = true;
        if (ch === "\ufeff") continue;
      }

      if (inQuotes) {
        if (ch === "\"") {
          const next = chunk[i + 1];
          if (next === "\"") {
            field += "\"";
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === "\"") inQuotes = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        yield row;
        row = [];
      } else if (ch !== "\r") {
        field += ch;
      }
    }
  }

  if (inQuotes) throw new Error(`Malformed CSV (unclosed quote): ${filePath}`);
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    yield row;
  }
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = row[index] ?? "";
  });
  return obj;
}

export async function parseCsvFile(filePath, options = {}) {
  const records = [];
  let headers = null;
  let rowNumber = 0;
  const sourceFile = options.sourceFile ?? path.basename(filePath);

  for await (const row of parseCsvRows(filePath)) {
    if (!headers) {
      headers = row.map((h) => String(h ?? "").trim().replace(/^\ufeff/, ""));
      continue;
    }
    rowNumber += 1;
    const raw = rowToObject(headers, row);
    const record = normaliseResult(raw, { rowNumber, sourceFile });
    const validation = validateResult(record);
    records.push({ ...record, validation });
  }

  return records;
}
