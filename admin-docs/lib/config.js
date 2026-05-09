import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Absolute path to the docs/ directory.
// Set DOCS_ROOT in .env for an explicit path, otherwise defaults to ../docs
// relative to admin-docs/ (i.e. the sibling docs/ folder in the repo root).
export const DOCS_ROOT = process.env.DOCS_ROOT
  ? process.env.DOCS_ROOT
  : join(__dirname, '..', '..', 'docs');
