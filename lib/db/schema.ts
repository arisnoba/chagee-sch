import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  employmentType: text("employment_type", { enum: ["fulltime", "parttime"] }).notNull(),
  availableDays: text("available_days").notNull(), // JSON array: ["mon","tue",...]
  openPreference: text("open_preference", { enum: ["like", "neutral", "dislike"] }).notNull().default("neutral"),
  middlePreference: text("middle_preference", { enum: ["like", "neutral", "dislike"] }).notNull().default("neutral"),
  closePreference: text("close_preference", { enum: ["like", "neutral", "dislike"] }).notNull().default("neutral"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const shiftLogs = sqliteTable("shift_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  date: text("date").notNull(), // YYYY-MM-DD
  shiftType: text("shift_type", { enum: ["open", "middle", "close", "off"] }).notNull(),
  dayType: text("day_type", { enum: ["weekday", "weekend", "holiday"] }).notNull(),
  weekLabel: text("week_label").notNull(), // e.g. "2025-W20"
  isConfirmed: integer("is_confirmed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const schedules = sqliteTable("schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekLabel: text("week_label").notNull().unique(), // e.g. "2025-W20"
  startDate: text("start_date").notNull(), // YYYY-MM-DD (Sunday)
  status: text("status", { enum: ["draft", "confirmed"] }).notNull().default("draft"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  confirmedAt: text("confirmed_at"),
});

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type ShiftLog = typeof shiftLogs.$inferSelect;
export type NewShiftLog = typeof shiftLogs.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
