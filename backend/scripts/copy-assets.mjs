// Copy non-TS runtime assets into dist/ after `tsc`.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = [['src/db/schema.sql', 'dist/db/schema.sql']];

for (const [from, to] of assets) {
  mkdirSync(dirname(resolve(root, to)), { recursive: true });
  cpSync(resolve(root, from), resolve(root, to));
  console.log(`copied ${from} -> ${to}`);
}
