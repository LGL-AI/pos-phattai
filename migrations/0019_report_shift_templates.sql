-- Shop-defined shifts for reporting (name + start/end, Vietnam time). Owner edits them in the
-- Reports screen, so a shift report no longer depends on staff schedules existing for that day.
ALTER TABLE pos_store_config ADD COLUMN report_shifts TEXT NOT NULL DEFAULT '[]';
