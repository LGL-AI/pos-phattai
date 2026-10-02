-- Thực đơn theo file Thuc_don_Phat_Tai.xlsx (cập nhật 01/10/2026).
-- Chỉ chạy một lần; từ nay chủ tiệm tự sửa món/giá trong app.
-- Canh: giá 50.000đ, một cỡ. Thêm: cơm xá xíu, 3 món canh, 2 combo cơm + canh.
UPDATE pos_products SET price=50000,large_price=50000,size=0,updated_at='2026-10-01T00:00:00.000Z' WHERE id='113';
INSERT INTO pos_products(id,sku,name,name_cn,category,station,price,large_price,active,icon,size,spicy,updated_at) VALUES
 ('114','PT014','Cơm xá xíu','叉烧饭','Cơm phần','KITCHEN',65000,65000,1,'🍚',1,1,'2026-10-01T00:00:00.000Z'),
 ('115','PT015','Canh gà hầm hoa đông trùng hạ thảo','虫草花炖老鸡汤','Canh','KITCHEN',50000,50000,1,'🍲',0,0,'2026-10-01T00:00:00.000Z'),
 ('116','PT016','Canh sườn củ sen','莲藕排骨汤','Canh','KITCHEN',50000,50000,1,'🍲',0,0,'2026-10-01T00:00:00.000Z'),
 ('117','PT017','Canh lòng bò hầm','慢炖牛杂鲜汤','Canh','KITCHEN',50000,50000,1,'🍲',0,0,'2026-10-01T00:00:00.000Z'),
 ('118','PT018','Combo cơm giò heo + canh gà / canh sườn','猪脚饭＋老鸡汤（排骨汤）','Combo','KITCHEN',130000,130000,1,'🍱',0,0,'2026-10-01T00:00:00.000Z'),
 ('119','PT019','Combo cơm vịt quay + canh gà / canh sườn','烧鸭饭＋老鸡汤（排骨汤）','Combo','KITCHEN',125000,125000,1,'🍱',0,0,'2026-10-01T00:00:00.000Z');
