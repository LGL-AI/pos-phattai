-- PHAT TAI tenant preservation migration.
-- Keeps the original PT001-PT013 menu seeded in 0007 and prevents any TIỆM SÍU LẬP PHÁT TÀI override.
-- Schema introduced in the unified branch is still required by the current API,
-- but PHAT TAI does not seed any Echo-only modifier groups.
ALTER TABLE pos_products ADD COLUMN category_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE pos_products ADD COLUMN size_label TEXT NOT NULL DEFAULT 'ONE';
ALTER TABLE pos_products ADD COLUMN item_note TEXT NOT NULL DEFAULT '';
ALTER TABLE pos_products ADD COLUMN source_image TEXT NOT NULL DEFAULT '';
ALTER TABLE pos_products ADD COLUMN best_seller INTEGER NOT NULL DEFAULT 0;
CREATE TABLE pos_menu_options(
 group_code TEXT NOT NULL, option_code TEXT NOT NULL, option_vi TEXT NOT NULL, option_zh TEXT NOT NULL,
 price_delta INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(group_code,option_code)
);
CREATE TABLE pos_product_modifiers(
 product_id TEXT NOT NULL, group_code TEXT NOT NULL, min_select INTEGER NOT NULL, max_select INTEGER NOT NULL,
 PRIMARY KEY(product_id,group_code)
);

UPDATE pos_store_config
SET store_name='TIỆM SÍU LẬP PHÁT TÀI',
    store_name_cn='發財燒臘',
    transfer_prefix='PT',
    updated_by='system-phattai',
    updated_at='2026-09-28T00:00:00.000Z',
    version=version+1
WHERE id=1;

UPDATE pos_products SET active=1,updated_at='2026-09-28T00:00:00.000Z'
WHERE id BETWEEN '101' AND '113';
