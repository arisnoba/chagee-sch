import { createClient } from "@libsql/client";

async function hasColumn(client: ReturnType<typeof createClient>, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.execute(`PRAGMA table_info(${tableName})`);
  return result.rows.some((row) => {
    const record = row as Record<string, unknown>;
    return record.name === columnName || record[1] === columnName;
  });
}

async function addColumnIfMissing(
  client: ReturnType<typeof createClient>,
  tableName: string,
  columnName: string,
  definition: string
): Promise<void> {
  if (await hasColumn(client, tableName, columnName)) return;

  try {
    await client.execute(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate column name")) return;
    throw error;
  }
}

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
      part_preferences TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await addColumnIfMissing(
    client,
    "employees",
    "part_preferences",
    "part_preferences TEXT NOT NULL DEFAULT '{}'"
  );

  await client.execute(`
    UPDATE employees
    SET part_preferences = json_object(
      'open', open_preference,
      'middle', middle_preference,
      'close', close_preference
    )
    WHERE part_preferences IS NULL
      OR part_preferences = ''
      OR part_preferences = '{}'
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
