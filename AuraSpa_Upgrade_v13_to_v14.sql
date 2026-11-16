-- ============================================================
--  AuraSpa — Upgrade v13 → v14
--  Solo agrega lo que NO existe: contraseña provisional al crear empleados
--  Ejecutar sobre una AuraSpaDB que ya tiene el schema v13
-- ============================================================

USE AuraSpaDB;
GO

-- ============================================================
--  1. USUARIO.contrasena_provisional
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Usuario' AND COLUMN_NAME = 'contrasena_provisional')
BEGIN
    ALTER TABLE Usuario ADD contrasena_provisional BIT NOT NULL DEFAULT 0;
    PRINT '✓ Usuario.contrasena_provisional agregada';
END
ELSE PRINT '- Usuario.contrasena_provisional ya existe';
GO
