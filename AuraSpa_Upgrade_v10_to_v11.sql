-- ============================================================
--  AuraSpa — Upgrade v10 → v11
--  Solo agrega lo que NO existe: soft delete para ExpedienteClinico
--  Ejecutar sobre una AuraSpaDB que ya tiene el schema v10
-- ============================================================

USE AuraSpaDB;
GO

-- ============================================================
--  1. EXPEDIENTECLINICO.activo
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ExpedienteClinico' AND COLUMN_NAME = 'activo')
BEGIN
    ALTER TABLE ExpedienteClinico ADD activo BIT NOT NULL DEFAULT 1;
    PRINT '✓ ExpedienteClinico.activo agregada';
END
ELSE PRINT '- ExpedienteClinico.activo ya existe';
GO
