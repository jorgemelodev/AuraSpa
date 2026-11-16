-- ============================================================
--  AuraSpa — Upgrade v7 → v8
--  Solo agrega lo que NO existe: secreto TOTP para 2FA (Google Authenticator)
--  Ejecutar sobre una AuraSpaDB que ya tiene el schema v7
-- ============================================================

USE AuraSpaDB;
GO

-- ============================================================
--  1. USUARIO.totp_secret
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Usuario' AND COLUMN_NAME = 'totp_secret')
BEGIN
    ALTER TABLE Usuario ADD totp_secret NVARCHAR(100) NULL;
    PRINT '✓ Usuario.totp_secret agregada';
END
ELSE PRINT '- Usuario.totp_secret ya existe';
GO
