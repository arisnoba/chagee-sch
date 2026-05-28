import { createClient } from "@libsql/client";

export async function migrate() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      employment_type TEXT NOT NULL,
      available_days TEXT NOT NULL,
      open_preference TEXT NOT NULL DEFAULT 'neutral',
      middle_preference TEXT NOT NULL DEFAULT 'neutral',
      close_preference TEXT NOT NULL DEFAULT 'neutral',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS shift_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      shift_type TEXT NOT NULL,
      day_type TEXT NOT NULL,
      week_label TEXT NOT NULL,
      is_confirmed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_label TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now')),
      confirmed_at TEXT
    )
  `);
}
