-- ============================================================
--  AuraSpa — Upgrade v9 → v10
--  1. Empleado: código identificador, sueldo, dirección
--  2. Tabla Paquete (paquetes de sesiones: depilación láser, etc.)
--  Ejecutar sobre una AuraSpaDB que ya tiene el schema v9
-- ============================================================

USE AuraSpaDB;
GO

-- ── 1. EMPLEADO: nuevos campos ──────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Empleado') AND name = 'codigo_empleado')
BEGIN
    ALTER TABLE Empleado ADD codigo_empleado NVARCHAR(20) NULL;
    PRINT '✓ Empleado.codigo_empleado agregada';
END
ELSE PRINT '- Empleado.codigo_empleado ya existe';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Empleado') AND name = 'sueldo')
BEGIN
    ALTER TABLE Empleado ADD sueldo DECIMAL(18,2) NULL;
    PRINT '✓ Empleado.sueldo agregada';
END
ELSE PRINT '- Empleado.sueldo ya existe';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Empleado') AND name = 'direccion')
BEGIN
    ALTER TABLE Empleado ADD direccion NVARCHAR(300) NULL;
    PRINT '✓ Empleado.direccion agregada';
END
ELSE PRINT '- Empleado.direccion ya existe';
GO

-- Generar código a empleados existentes que no tengan
UPDATE Empleado
SET codigo_empleado = 'EMP-' + RIGHT('000' + CAST(id_empleado AS NVARCHAR), 3)
WHERE codigo_empleado IS NULL;
GO

-- ── 2. PAQUETE ──────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Paquete')
BEGIN
    CREATE TABLE Paquete (
        id_paquete   BIGINT         NOT NULL IDENTITY(1,1),
        nombre       NVARCHAR(150)  NOT NULL,
        descripcion  NVARCHAR(500)  NULL,
        categoria    NVARCHAR(100)  NULL,
        precio       DECIMAL(18,2)  NOT NULL,
        sesiones     INT            NOT NULL DEFAULT 1,
        activo       BIT            NOT NULL DEFAULT 1,
        fecha_creado DATETIME       NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_Paquete PRIMARY KEY (id_paquete)
    );
    PRINT '✓ Tabla Paquete creada';

    INSERT INTO Paquete (nombre, descripcion, categoria, precio, sesiones) VALUES
    ('Depilación Láser — Axilas (6 sesiones)',        'Paquete completo de depilación láser en axilas.',            'Depilación', 12000.00, 6),
    ('Depilación Láser — Piernas completas (8 ses.)', 'Paquete de depilación láser en piernas completas.',          'Depilación', 32000.00, 8),
    ('Ritual Facial Premium (4 sesiones)',            'Limpieza profunda + hidratación + mascarilla mensual.',      'Facial',     9500.00,  4),
    ('Plan Relax — Masajes (5 sesiones)',             'Cinco masajes relajantes de 60 minutos.',                    'Masaje',     10500.00, 5);
    PRINT '✓ Paquetes de ejemplo insertados';
END
ELSE PRINT '- Tabla Paquete ya existe';
GO

PRINT '';
PRINT '════════════════════════════════════════════';
PRINT '  Upgrade v9 → v10 completado.';
PRINT '════════════════════════════════════════════';
GO
