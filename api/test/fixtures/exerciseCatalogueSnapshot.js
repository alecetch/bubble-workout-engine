import assert from "node:assert/strict";

export function exerciseValues(catalogue, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...catalogue.matchAll(new RegExp(`INSERT INTO (?:public\\.)?exercise_catalogue \\(\\s*([^)]*)\\) VALUES \\(\\r?\\n  '${escapedId}',([\\s\\S]*?)\\r?\\n\\)\\r?\\nON CONFLICT`, 'g'))];
  assert.equal(blocks.length, 1, `Expected one INSERT block for ${id}`);
  const columns = blocks[0][1].split(',').map(column => column.trim());
  // Each SQL value occupies its own line. Never split on commas, which may
  // occur inside quoted names, ARRAY[...] expressions, or JSON values.
  const values = [`'${id}'`, ...blocks[0][2].trim().split(/\r?\n/).map(line => line.trim().replace(/,$/, ''))];
  assert.equal(values.length, columns.length, `Column/value mismatch for ${id}`);
  return {
    fields: Object.fromEntries(columns.map((column, i) => [column, values[i]])),
    rank: Number(values[4]), archived: values[5] === 'true',
    hyroxRole: columns.includes('hyrox_role') ? values[columns.indexOf('hyrox_role')] : undefined,
  };
}
