import pg from "pg";
import type { LadderStore } from "./types.js";

/** In memory: for tests and for a helper without a database (a restart forgets, so steps could repeat: see the README). */
export function createMemoryStore(): LadderStore {
  const data = new Map<string, Map<string, number>>();
  return {
    async claim(letterId, step, at) {
      let m = data.get(letterId);
      if (!m) data.set(letterId, (m = new Map()));
      if (m.has(step)) return false;
      m.set(step, at);
      return true;
    },
    async release(letterId, step) {
      data.get(letterId)?.delete(step);
    },
    async steps(letterId) {
      return new Map(data.get(letterId) ?? []);
    },
  };
}

/** Postgres (Render's free instance is enough): one row per (letter, step); the primary key makes "claim" atomic. */
export async function createPgStore(connectionString: string): Promise<LadderStore> {
  const pool = new pg.Pool({ connectionString, max: 3, ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false } });
  await pool.query("CREATE TABLE IF NOT EXISTS tabella_steps (letter_id text NOT NULL, step text NOT NULL, at bigint NOT NULL, PRIMARY KEY (letter_id, step))");
  return {
    async claim(letterId, step, at) {
      const r = await pool.query("INSERT INTO tabella_steps (letter_id, step, at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [letterId, step, at]);
      return (r.rowCount ?? 0) === 1;
    },
    async release(letterId, step) {
      await pool.query("DELETE FROM tabella_steps WHERE letter_id = $1 AND step = $2", [letterId, step]);
    },
    async steps(letterId) {
      const r = await pool.query("SELECT step, at FROM tabella_steps WHERE letter_id = $1", [letterId]);
      return new Map(r.rows.map((x: { step: string; at: string }) => [x.step, Number(x.at)]));
    },
  };
}
