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
    CREATE TABLE IF NOT EXISTS shift_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    INSERT OR IGNORE INTO shift_parts (code, label, start_time, end_time, sort_order, is_active)
    VALUES
      ('open', '오픈', '09:00', '18:00', 0, 1),
      ('middle', '미들', '12:00', '21:00', 1, 1),
      ('close', '마감', '15:00', '00:00', 2, 1)
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
