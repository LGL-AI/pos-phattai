-- PHAT TAI v1.5: customer orders first, kitchen prints immediately, staff collects payment later.
-- Reverse the previous payment-first kitchen trigger without touching historical orders.
DROP TRIGGER IF EXISTS pos_kitchen_after_payment;
DROP TRIGGER IF EXISTS pos_accept_qr;
DROP TRIGGER IF EXISTS pos_create_staff;
DROP TRIGGER IF EXISTS pos_items_change;

-- QR customer order is accepted by the server immediately. The kitchen job is
-- created in the same D1 transaction as the order insert via this trigger.
CREATE TRIGGER pos_create_qr_kitchen AFTER INSERT ON qr_orders
WHEN NEW.source='QR' AND NEW.status='ACCEPTED'
BEGIN
  INSERT INTO pos_kitchen_jobs(id,order_id,revision,kind,items_json,created_at,updated_at)
  VALUES('kitchen:'||NEW.id||':1',NEW.id,1,'NEW',NEW.items_json,NEW.created_at,NEW.created_at);
END;

-- Orders keyed directly by staff also print to kitchen immediately.
CREATE TRIGGER pos_create_staff AFTER INSERT ON qr_orders
WHEN NEW.source='POS' AND NEW.status='ACCEPTED'
BEGIN
  INSERT INTO pos_kitchen_jobs(id,order_id,revision,kind,items_json,created_at,updated_at)
  VALUES('kitchen:'||NEW.id||':1',NEW.id,1,'NEW',NEW.items_json,NEW.created_at,NEW.created_at);
END;

-- Add/cancel deltas continue to create kitchen jobs before payment.
CREATE TRIGGER pos_items_change AFTER UPDATE OF items_json ON qr_orders
WHEN NEW.kitchen_revision>OLD.kitchen_revision AND NEW.status!='PAID'
BEGIN
  INSERT INTO pos_kitchen_jobs(id,order_id,revision,kind,items_json,created_at,updated_at)
  VALUES('kitchen:'||NEW.id||':'||NEW.kitchen_revision,NEW.id,NEW.kitchen_revision,
         NEW.last_change_kind,NEW.last_delta_json,NEW.updated_at,NEW.updated_at);
END;
