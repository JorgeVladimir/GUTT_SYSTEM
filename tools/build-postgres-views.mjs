// Conversor limitado a las 12 vistas inspeccionadas del esquema de origen.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './_env.mjs';
const dir = join(REPO_ROOT, 'db/postgres');
const source = JSON.parse(readFileSync(join(dir, 'source/sqlserver-schema.json'), 'utf8'));
const keywords = new Set('CREATE VIEW AS SELECT FROM WHERE LEFT JOIN ON IS NOT NULL CASE WHEN THEN ELSE END AND OR COALESCE'.split(' '));
const output = [];
for (const view of source.modules.filter(m => m.ObjectType === 'VIEW')) {
  if (!view.Definition) throw new Error(`Vista sin definicion: ${view.ObjectName}`);
  const sql = view.Definition.replace(/--[^\r\n]*|'(?:[^']|'')*'|[A-Za-z_][A-Za-z_0-9]*|\+/g, token => {
    if (token.startsWith('--')) return '';
    if (token.startsWith("'")) return token;
    if (token === '+') return '||'; // Solo concatenacion de nombres en estas vistas.
    if (token.toUpperCase() === 'ISNULL') return 'COALESCE';
    return keywords.has(token.toUpperCase()) ? token.toUpperCase() : `"${token}"`;
  });
  output.push(sql.trim());
}
writeFileSync(join(dir, '004_views.sql'), '-- Vistas de origen con identificadores exactos.\n' + output.join('\n\n') + '\n');
console.log(`Vistas preparadas: ${output.length}`);
