/**
 * SQLite connection (Node's built-in `node:sqlite`, no native build step).
 *
 * One synchronous connection for the whole process — fine for a single-user
 * app. Schema is applied idempotently on first import; the TW securities master
 * is seeded from the bundled JSON if the table is empty.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!existsSync(paths.dataDir)) mkdirSync(paths.dataDir, { recursive: true });

export const db = new DatabaseSync(paths.dbFile);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

const schema = readFileSync(resolve(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

migrate();
seedTwSecurities();

/**
 * Small forward-only migration runner keyed on PRAGMA user_version.
 * schema.sql handles table creation; migrations here handle renames/backfills.
 */
function migrate(): void {
  const row = db.prepare('PRAGMA user_version').get() as unknown as { user_version: number };
  let version = row.user_version ?? 0;

  const steps: (() => void)[] = [
    // 1: holdings -> holding_lots (early rename; copies any existing rows)
    () => {
      const has = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='holdings'")
        .get();
      if (has) {
        db.exec(`
          INSERT INTO holding_lots (ticker, shares, cost_basis, currency, purchase_date, notes, created_at)
          SELECT ticker, quantity, cost_basis, currency, opened_at, note, COALESCE(opened_at, datetime('now'))
          FROM holdings;
          DROP TABLE holdings;
        `);
      }
    },
  ];

  for (; version < steps.length; version++) {
    db.exec('BEGIN');
    try {
      steps[version]!();
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

// ── typed query helpers ────────────────────────────────────────────────────
// node:sqlite returns `Record<string, SQLOutputValue>`; these narrow to our
// row shapes (callers own the SQL, so the cast is deliberate).
type Param = string | number | bigint | boolean | null | Uint8Array;

export function all<T>(sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...(params as never[])) as unknown as T[];
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as unknown as T | undefined;
}

export function run(sql: string, ...params: Param[]) {
  return db.prepare(sql).run(...(params as never[]));
}

function seedTwSecurities(): void {
  const countRow = db.prepare('SELECT COUNT(*) AS c FROM tw_securities').get() as unknown as {
    c: number;
  };
  if (countRow.c > 0) return;
  if (!existsSync(paths.twSecuritiesSeed)) {
    console.warn('[db] tw-securities.seed.json missing — search limited until the refresh job runs');
    return;
  }
  const seed = JSON.parse(readFileSync(paths.twSecuritiesSeed, 'utf-8')) as {
    items: { ticker: string; name: string; market: string; type: string }[];
  };
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO tw_securities (ticker, name, market, type, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    for (const s of seed.items) insert.run(s.ticker, s.name, s.market, s.type, now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(`[db] seeded ${seed.items.length} Taiwan securities`);
}
