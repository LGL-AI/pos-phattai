-- v1.6.2: metadata for cheap sync and atomic append replay protection.
-- No business records or printer settings are overwritten by this migration.
CREATE TABLE pos_sync_revisions (
 scope TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1)
);
INSERT INTO pos_sync_revisions(scope) VALUES ('catalog'), ('customers'), ('inventory'), ('orders'), ('print'), ('reports'), ('service'), ('shifts'), ('staff'), ('vouchers');

CREATE TABLE pos_order_append_requests (
 request_key TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES qr_orders(id),
 fingerprint TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 base_version INTEGER NOT NULL,
 applied_version INTEGER,
 created_at TEXT NOT NULL
);
CREATE INDEX idx_append_requests_order ON pos_order_append_requests(order_id);
-- A failed compare-and-swap must roll back BOTH request receipt and order.
CREATE TRIGGER pos_append_must_apply BEFORE UPDATE OF applied_version ON pos_order_append_requests
WHEN NEW.applied_version IS NULL
BEGIN
 SELECT RAISE(ABORT,'APPEND_CONFLICT');
END;

CREATE TRIGGER pos_sync_qr_orders_insert AFTER INSERT ON qr_orders
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('orders', 'reports', 'service');
END;
CREATE TRIGGER pos_sync_qr_orders_update AFTER UPDATE ON qr_orders
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('orders', 'reports', 'service');
END;
CREATE TRIGGER pos_sync_qr_orders_delete AFTER DELETE ON qr_orders
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('orders', 'reports', 'service');
END;
CREATE TRIGGER pos_sync_pos_bills_insert AFTER INSERT ON pos_bills
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('orders', 'reports');
END;
CREATE TRIGGER pos_sync_pos_bills_update AFTER UPDATE ON pos_bills
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('orders', 'reports');
END;
CREATE TRIGGER pos_sync_pos_bills_delete AFTER DELETE ON pos_bills
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('orders', 'reports');
END;
CREATE TRIGGER pos_sync_pos_kitchen_jobs_insert AFTER INSERT ON pos_kitchen_jobs
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('print');
END;
CREATE TRIGGER pos_sync_pos_kitchen_jobs_update AFTER UPDATE ON pos_kitchen_jobs
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('print');
END;
CREATE TRIGGER pos_sync_pos_kitchen_jobs_delete AFTER DELETE ON pos_kitchen_jobs
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('print');
END;
CREATE TRIGGER pos_sync_pos_auto_print_config_insert AFTER INSERT ON pos_auto_print_config
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('print');
END;
CREATE TRIGGER pos_sync_pos_auto_print_config_update AFTER UPDATE ON pos_auto_print_config
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('print');
END;
CREATE TRIGGER pos_sync_pos_auto_print_config_delete AFTER DELETE ON pos_auto_print_config
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('print');
END;
CREATE TRIGGER pos_sync_pos_refunds_insert AFTER INSERT ON pos_refunds
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('orders', 'reports');
END;
CREATE TRIGGER pos_sync_pos_refunds_update AFTER UPDATE ON pos_refunds
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('orders', 'reports');
END;
CREATE TRIGGER pos_sync_pos_refunds_delete AFTER DELETE ON pos_refunds
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('orders', 'reports');
END;
CREATE TRIGGER pos_sync_pos_products_insert AFTER INSERT ON pos_products
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_products_update AFTER UPDATE ON pos_products
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_products_delete AFTER DELETE ON pos_products
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_product_modifiers_insert AFTER INSERT ON pos_product_modifiers
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_product_modifiers_update AFTER UPDATE ON pos_product_modifiers
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_product_modifiers_delete AFTER DELETE ON pos_product_modifiers
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_menu_options_insert AFTER INSERT ON pos_menu_options
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_menu_options_update AFTER UPDATE ON pos_menu_options
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_menu_options_delete AFTER DELETE ON pos_menu_options
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_store_config_insert AFTER INSERT ON pos_store_config
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_store_config_update AFTER UPDATE ON pos_store_config
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_store_config_delete AFTER DELETE ON pos_store_config
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('catalog');
END;
CREATE TRIGGER pos_sync_pos_product_inventory_insert AFTER INSERT ON pos_product_inventory
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory', 'catalog');
END;
CREATE TRIGGER pos_sync_pos_product_inventory_update AFTER UPDATE ON pos_product_inventory
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory', 'catalog');
END;
CREATE TRIGGER pos_sync_pos_product_inventory_delete AFTER DELETE ON pos_product_inventory
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory', 'catalog');
END;
CREATE TRIGGER pos_sync_pos_ingredients_insert AFTER INSERT ON pos_ingredients
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory', 'catalog');
END;
CREATE TRIGGER pos_sync_pos_ingredients_update AFTER UPDATE ON pos_ingredients
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory', 'catalog');
END;
CREATE TRIGGER pos_sync_pos_ingredients_delete AFTER DELETE ON pos_ingredients
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory', 'catalog');
END;
CREATE TRIGGER pos_sync_pos_recipes_insert AFTER INSERT ON pos_recipes
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory', 'catalog');
END;
CREATE TRIGGER pos_sync_pos_recipes_update AFTER UPDATE ON pos_recipes
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory', 'catalog');
END;
CREATE TRIGGER pos_sync_pos_recipes_delete AFTER DELETE ON pos_recipes
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory', 'catalog');
END;
CREATE TRIGGER pos_sync_pos_inventory_estimates_insert AFTER INSERT ON pos_inventory_estimates
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory');
END;
CREATE TRIGGER pos_sync_pos_inventory_estimates_update AFTER UPDATE ON pos_inventory_estimates
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory');
END;
CREATE TRIGGER pos_sync_pos_inventory_estimates_delete AFTER DELETE ON pos_inventory_estimates
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory');
END;
CREATE TRIGGER pos_sync_pos_inventory_movements_insert AFTER INSERT ON pos_inventory_movements
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory');
END;
CREATE TRIGGER pos_sync_pos_inventory_movements_update AFTER UPDATE ON pos_inventory_movements
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory');
END;
CREATE TRIGGER pos_sync_pos_inventory_movements_delete AFTER DELETE ON pos_inventory_movements
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory');
END;
CREATE TRIGGER pos_sync_pos_restock_plans_insert AFTER INSERT ON pos_restock_plans
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory');
END;
CREATE TRIGGER pos_sync_pos_restock_plans_update AFTER UPDATE ON pos_restock_plans
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory');
END;
CREATE TRIGGER pos_sync_pos_restock_plans_delete AFTER DELETE ON pos_restock_plans
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('inventory');
END;
CREATE TRIGGER pos_sync_pos_service_requests_insert AFTER INSERT ON pos_service_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('service');
END;
CREATE TRIGGER pos_sync_pos_service_requests_update AFTER UPDATE ON pos_service_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('service');
END;
CREATE TRIGGER pos_sync_pos_service_requests_delete AFTER DELETE ON pos_service_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('service');
END;
CREATE TRIGGER pos_sync_pos_roles_insert AFTER INSERT ON pos_roles
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('staff');
END;
CREATE TRIGGER pos_sync_pos_roles_update AFTER UPDATE ON pos_roles
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('staff');
END;
CREATE TRIGGER pos_sync_pos_roles_delete AFTER DELETE ON pos_roles
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('staff');
END;
CREATE TRIGGER pos_sync_pos_staff_users_insert AFTER INSERT ON pos_staff_users
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('staff');
END;
CREATE TRIGGER pos_sync_pos_staff_users_update AFTER UPDATE ON pos_staff_users
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('staff');
END;
CREATE TRIGGER pos_sync_pos_staff_users_delete AFTER DELETE ON pos_staff_users
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('staff');
END;
CREATE TRIGGER pos_sync_pos_shift_schedules_insert AFTER INSERT ON pos_shift_schedules
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_shift_schedules_update AFTER UPDATE ON pos_shift_schedules
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_shift_schedules_delete AFTER DELETE ON pos_shift_schedules
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_attendance_insert AFTER INSERT ON pos_attendance
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_attendance_update AFTER UPDATE ON pos_attendance
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_attendance_delete AFTER DELETE ON pos_attendance
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_cash_shifts_insert AFTER INSERT ON pos_cash_shifts
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_cash_shifts_update AFTER UPDATE ON pos_cash_shifts
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_cash_shifts_delete AFTER DELETE ON pos_cash_shifts
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_leave_requests_insert AFTER INSERT ON pos_leave_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_leave_requests_update AFTER UPDATE ON pos_leave_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_leave_requests_delete AFTER DELETE ON pos_leave_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_ot_requests_insert AFTER INSERT ON pos_ot_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_ot_requests_update AFTER UPDATE ON pos_ot_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_ot_requests_delete AFTER DELETE ON pos_ot_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_swap_requests_insert AFTER INSERT ON pos_swap_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_swap_requests_update AFTER UPDATE ON pos_swap_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_swap_requests_delete AFTER DELETE ON pos_swap_requests
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_shift_tasks_insert AFTER INSERT ON pos_shift_tasks
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_shift_tasks_update AFTER UPDATE ON pos_shift_tasks
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_shift_tasks_delete AFTER DELETE ON pos_shift_tasks
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_shift_handovers_insert AFTER INSERT ON pos_shift_handovers
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_shift_handovers_update AFTER UPDATE ON pos_shift_handovers
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_shift_handovers_delete AFTER DELETE ON pos_shift_handovers
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_attendance_corrections_insert AFTER INSERT ON pos_attendance_corrections
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_attendance_corrections_update AFTER UPDATE ON pos_attendance_corrections
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_pos_attendance_corrections_delete AFTER DELETE ON pos_attendance_corrections
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('shifts');
END;
CREATE TRIGGER pos_sync_members_insert AFTER INSERT ON members
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('customers');
END;
CREATE TRIGGER pos_sync_members_update AFTER UPDATE ON members
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('customers');
END;
CREATE TRIGGER pos_sync_members_delete AFTER DELETE ON members
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('customers');
END;
CREATE TRIGGER pos_sync_vouchers_insert AFTER INSERT ON vouchers
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('vouchers');
END;
CREATE TRIGGER pos_sync_vouchers_update AFTER UPDATE ON vouchers
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('vouchers');
END;
CREATE TRIGGER pos_sync_vouchers_delete AFTER DELETE ON vouchers
BEGIN
 UPDATE pos_sync_revisions SET revision=revision+1 WHERE scope IN ('vouchers');
END;
