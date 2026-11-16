-- ============================================================
--  AuraSpa — Upgrade v12 → v13
--  Solo agrega lo que NO existe: plantillas de formularios de consentimiento
--  (distinto de ConsentimientoInformado, que guarda las firmas por cliente/cita)
--  Ejecutar sobre una AuraSpaDB que ya tiene el schema v12
-- ============================================================

USE AuraSpaDB;
GO

-- ============================================================
--  1. CONSENTIMIENTO
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Consentimiento')
BEGIN
    CREATE TABLE Consentimiento (
        id_consentimiento BIGINT        NOT NULL IDENTITY(1,1),
        titulo            NVARCHAR(200) NOT NULL,
        descripcion       NVARCHAR(500) NULL,
        contenido         NVARCHAR(MAX) NOT NULL,
        activo            BIT           NOT NULL DEFAULT 1,
        fecha_creacion    DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT pk_consentimiento_form PRIMARY KEY (id_consentimiento)
    );
    PRINT '✓ Tabla Consentimiento creada';
END
ELSE PRINT '- Tabla Consentimiento ya existe';
GO
