-- Reparación de datos creados por importaciones anteriores a las correcciones de octubre 2026.
-- NO se ejecuta solo. Antes: hacer backup (pg_dump). Correr dentro de psql:
--   \i backend/scripts/reparar_datos_importados.sql
-- Primero muestra qué va a cambiar; termina en ROLLBACK. Si los números se ven bien,
-- cambiar la última línea por COMMIT y volver a correrlo.

BEGIN;

-- ─── 1. Gastos importados marcados "del hogar" que no aparecen en el Hogar ───
-- Tenían household_id (columna vieja) pero no el vínculo en transaction_households.
SELECT count(*) AS gastos_hogar_sin_vinculo
FROM transactions t
WHERE t.household_id IS NOT NULL
  AND t.type = 'EXPENSE'
  AND t.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM transaction_households th
    WHERE th.transaction_id = t.id AND th.household_id = t.household_id
  );

INSERT INTO transaction_households (transaction_id, household_id, added_at)
SELECT t.id, t.household_id, COALESCE(t.created_at, NOW())
FROM transactions t
WHERE t.household_id IS NOT NULL
  AND t.type = 'EXPENSE'
  AND t.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM transaction_households th
    WHERE th.transaction_id = t.id AND th.household_id = t.household_id
  );

-- ─── 2. Transferencias importadas de Zcuentas guardadas como gasto + ingreso ──
-- Las dos patas compartían un transfer_id inventado (no apuntaba a la otra pata),
-- tenían tipo EXPENSE/INCOME y se contaban como gasto e ingreso en los gráficos.
SELECT count(*) AS patas_zcuentas_a_corregir
FROM transactions
WHERE transfer_role IS NOT NULL AND type <> 'TRANSFER';

-- 2a. Enlazar cada pata con su pareja (mismo transfer_id compartido, rol opuesto)
UPDATE transactions AS t
SET transfer_id = p.id
FROM transactions AS p
WHERE t.type <> 'TRANSFER' AND p.type <> 'TRANSFER'
  AND t.transfer_role IS NOT NULL AND p.transfer_role IS NOT NULL
  AND t.transfer_role <> p.transfer_role
  AND t.transfer_id = p.transfer_id
  AND t.user_id = p.user_id
  AND t.id <> p.id;

-- 2b. Tipo TRANSFER en las dos patas
UPDATE transactions
SET type = 'TRANSFER'
WHERE transfer_role IS NOT NULL AND type <> 'TRANSFER';

-- Verificación: no debe quedar ninguna pata sin pareja válida
SELECT count(*) AS patas_sin_pareja
FROM transactions t
WHERE t.transfer_role IS NOT NULL AND t.external_account_id IS NULL AND t.is_deleted = false
  AND NOT EXISTS (SELECT 1 FROM transactions p WHERE p.id = t.transfer_id);

ROLLBACK;  -- cambiar por COMMIT cuando los conteos de arriba se vean bien
