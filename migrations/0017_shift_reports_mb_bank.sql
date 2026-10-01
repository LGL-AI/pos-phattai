-- PHAT TAI v1.5.7: shift-group reporting + MB receiving account from store QR card.
ALTER TABLE pos_shift_schedules ADD COLUMN shift_name TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_shift_group ON pos_shift_schedules(work_date,start_time,end_time,shift_name);

UPDATE pos_store_config
SET bank_label='MB',
    bank_bin='970422',
    bank_account='00706885602',
    bank_name='HO KINH DOANH COM GIO HEO',
    updated_by='system-phattai-v1.5.7',
    updated_at='2026-09-29T08:10:00.000Z',
    version=version+1
WHERE id=1;
