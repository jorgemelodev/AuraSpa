-- ============================================================
--  AuraSpa — Upgrade v15 → v16
--  Índice único filtrado para cerrar la ventana de condición de carrera
--  en el doble-agendamiento (HU05-CONC-Malo): el chequeo actual en
--  CitasController es "leer-luego-escribir" (AnyAsync + Add + SaveChanges)
--  sin ninguna restricción real a nivel de base de datos. Bajo concurrencia
--  verdadera (dos requests casi simultáneos) ambas podrían pasar la
--  validación antes de que la primera se guarde. Este índice hace que la
--  segunda inserción falle a nivel de BD si coincide especialista+fecha/hora
--  en una cita no cancelada/rechazada; el backend atrapa esa excepción y
--  devuelve un 400 claro en vez de un 500.
--  Ejecutar sobre una AuraSpaDB que ya tiene el schema v15
-- ============================================================

USE AuraSpaDB;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_cita_empleado_fechahora_activa')
BEGIN
    CREATE UNIQUE INDEX ux_cita_empleado_fechahora_activa
        ON Cita(id_empleado, fecha_hora)
        WHERE id_empleado IS NOT NULL AND estado <> 'Cancelada' AND estado <> 'Rechazada';
    PRINT '✓ Índice único ux_cita_empleado_fechahora_activa creado';
END
ELSE PRINT '- Índice ux_cita_empleado_fechahora_activa ya existe';
GO
