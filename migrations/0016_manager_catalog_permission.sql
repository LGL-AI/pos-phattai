-- PHAT TAI v1.5.5: align MANAGER role with store operations.
-- Managers may maintain menu/products, but voucher administration remains OWNER-only.
UPDATE pos_roles
SET permissions_json=json_insert(permissions_json,'$[#]','CATALOG_MANAGE')
WHERE id='MANAGER'
  AND NOT EXISTS (SELECT 1 FROM json_each(pos_roles.permissions_json) WHERE value='CATALOG_MANAGE');
