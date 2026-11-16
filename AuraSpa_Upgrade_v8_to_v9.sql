-- ============================================================
--  AuraSpa — Upgrade v8 → v9
--  Solo agrega lo que NO existe: descriptores faciales de Aurora
--  (vector matemático de 128 dimensiones — NUNCA se guardan fotos)
--  Ejecutar sobre una AuraSpaDB que ya tiene el schema v8
-- ============================================================

USE AuraSpaDB;
GO

-- ============================================================
--  1. ROSTRODESCRIPTOR
--     Un usuario puede registrar su rostro para el check-in del
--     kiosko. Se almacena el descriptor de face-api.js (JSON con
--     128 números flotantes), no imágenes. Ley 172-13 friendly.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RostroDescriptor')
BEGIN
    CREATE TABLE RostroDescriptor (
        id_rostro       BIGINT        NOT NULL IDENTITY(1,1),
        id_usuario      BIGINT        NOT NULL,
        descriptor      NVARCHAR(MAX) NOT NULL,  -- JSON: [0.123, -0.045, ...] x128
        fecha_registro  DATETIME      NOT NULL DEFAULT GETDATE(),
        activo          BIT           NOT NULL DEFAULT 1,
        CONSTRAINT PK_RostroDescriptor PRIMARY KEY (id_rostro),
        CONSTRAINT FK_RostroDescriptor_Usuario
            FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario),
        CONSTRAINT UQ_RostroDescriptor_Usuario UNIQUE (id_usuario)
    );
    PRINT '✓ Tabla RostroDescriptor creada';
END
ELSE PRINT '- Tabla RostroDescriptor ya existe';
GO

PRINT '';
PRINT '════════════════════════════════════════════';
PRINT '  Upgrade v8 → v9 completado.';
PRINT '════════════════════════════════════════════';
GO
