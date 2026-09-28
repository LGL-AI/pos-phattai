-- Keep a customer's payment choice with the order across all POS screens.
-- Existing orders used the bank QR flow and retain that default.
ALTER TABLE qr_orders ADD COLUMN payment_preference TEXT NOT NULL DEFAULT 'BANK'
 CHECK(payment_preference IN ('BANK','CASH'));

-- PHAT TAI: feedback URL stays empty until configured by the store owner.
UPDATE pos_store_config SET feedback_url='' WHERE id=1 AND feedback_url IS NULL;
UPDATE pos_store_config SET invoice_url='' WHERE id=1;
