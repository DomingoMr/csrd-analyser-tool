import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.resolve(__dirname, '../../data/esrs-resumen.csv');

export async function loadEsrsCatalog() {
  const content = await fs.readFile(csvPath, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true
  });
}
