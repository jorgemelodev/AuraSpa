-- ============================================================
--  AuraSpa — Upgrade v14 → v15
--  Paquetes por cliente: sesiones adquiridas y consumidas por cada cliente,
--  referenciando el catálogo real de Paquete (no el PaqueteOld/ClientePaqueteOld
--  huérfanos de un esquema anterior).
--  Ejecutar sobre una AuraSpaDB que ya tiene el schema v14
-- ============================================================

USE AuraSpaDB;
GO

-- ============================================================
--  1. Tabla ClientePaquete
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ClientePaquete')
BEGIN
    CREATE TABLE ClientePaquete (
        id_cliente_paquete  BIGINT IDENTITY(1,1) PRIMARY KEY,
        id_cliente          BIGINT NOT NULL,
        id_paquete          BIGINT NOT NULL,
        sesiones_totales    INT NOT NULL,
        sesiones_restantes  INT NOT NULL,
        fecha_adquisicion   DATETIME NOT NULL DEFAULT GETDATE(),
        fecha_expiracion    DATETIME NULL,
        estado              VARCHAR(15) NOT NULL DEFAULT 'Activo'
            CONSTRAINT chk_clientepaquete_estado CHECK (estado IN ('Activo','Consumido','Expirado')),
        CONSTRAINT chk_clientepaquete_sesiones CHECK (sesiones_restantes >= 0),
        CONSTRAINT fk_clientepaquete_cliente FOREIGN KEY (id_cliente) REFERENCES Cliente(id_cliente),
        CONSTRAINT fk_clientepaquete_paquete FOREIGN KEY (id_paquete) REFERENCES Paquete(id_paquete)
    );
    PRINT '✓ Tabla ClientePaquete creada';
END
ELSE PRINT '- Tabla ClientePaquete ya existe';
GO
