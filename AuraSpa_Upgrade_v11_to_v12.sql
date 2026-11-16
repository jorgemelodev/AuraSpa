-- ============================================================
--  AuraSpa — Upgrade v11 → v12
--  Solo agrega lo que NO existe: persistencia real de 2FA activado/desactivado
--  Ejecutar sobre una AuraSpaDB que ya tiene el schema v11
-- ============================================================

USE AuraSpaDB;
GO

-- ============================================================
--  1. USUARIO.doble_factor_activo
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Usuario' AND COLUMN_NAME = 'doble_factor_activo')
BEGIN
    ALTER TABLE Usuario ADD doble_factor_activo BIT NOT NULL DEFAULT 0;
    PRINT '✓ Usuario.doble_factor_activo agregada';
END
ELSE PRINT '- Usuario.doble_factor_activo ya existe';
GO
