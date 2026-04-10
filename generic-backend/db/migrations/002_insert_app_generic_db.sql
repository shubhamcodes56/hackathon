-- 002_insert_app_generic_db.sql
-- Inserts the current database as an app record if not exists

INSERT INTO apps (name, slug)
SELECT 'generic_db', 'generic_db'
WHERE NOT EXISTS (SELECT 1 FROM apps WHERE slug = 'generic_db');
