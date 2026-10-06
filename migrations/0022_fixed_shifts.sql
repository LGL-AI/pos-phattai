-- Fixed shifts (owner's request 06/10/2026): a shift with fixed hours and a list of staff that repeats every day
-- from its start date until the owner changes it. The Worker turns each one into the ordinary per-day rows of
-- pos_shift_schedules, one day at a time (generated_until), so attendance, swaps, leave and shift reports keep
-- working unchanged, and a day the manager deletes (leave, replacement) is not filled in again.
CREATE TABLE pos_fixed_shifts (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 staff_json TEXT NOT NULL DEFAULT '[]',
 starts_on TEXT NOT NULL,
 generated_until TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(start_time<end_time)
);
CREATE INDEX idx_fixed_shifts_active ON pos_fixed_shifts(active,generated_until);
ALTER TABLE pos_shift_schedules ADD COLUMN fixed_shift_id TEXT;
CREATE INDEX idx_shift_schedules_fixed ON pos_shift_schedules(fixed_shift_id,work_date);
CREATE TRIGGER pos_sync_pos_fixed_shifts_insert AFTER INSERT ON pos_fixed_shifts
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_fixed_shifts_update AFTER UPDATE ON pos_fixed_shifts
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
