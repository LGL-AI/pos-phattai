-- PT-29: the receipt names who took the money. Kept on the order/bill at payment time, so a reprint
-- shows the same person even after the account is renamed or deactivated.
ALTER TABLE qr_orders ADD COLUMN paid_by TEXT;
ALTER TABLE qr_orders ADD COLUMN paid_by_name TEXT NOT NULL DEFAULT '';
ALTER TABLE pos_bills ADD COLUMN paid_by TEXT;
ALTER TABLE pos_bills ADD COLUMN paid_by_name TEXT NOT NULL DEFAULT '';
