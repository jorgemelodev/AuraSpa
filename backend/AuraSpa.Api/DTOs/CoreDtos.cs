namespace AuraSpa.Api.DTOs
{
    public class SucursalDto
    {
        public string  Nombre    { get; set; } = string.Empty;
        public string  Direccion { get; set; } = string.Empty;
        public string? Telefono  { get; set; }
    }

    public class EmpleadoDto
    {
        public string  Nombres         { get; set; } = string.Empty;
        public string  Apellidos       { get; set; } = string.Empty;
        public string  NumeroDocumento { get; set; } = string.Empty;
        /// <summary>1 = Cédula (CED), 3 = Pasaporte (PAS)</summary>
        public long    IdTipoDoc       { get; set; } = 1;
        public string  TipoEmpleado    { get; set; } = "Especialista";
        public string? Telefono        { get; set; }
        public long    IdSucursal      { get; set; }
        public decimal? Sueldo         { get; set; }
        public string? Direccion       { get; set; }
    }

    public class UsuarioCoreDto
    {
        public string  Nombre   { get; set; } = string.Empty;
        public string  Apellido { get; set; } = string.Empty;
        public string  Email    { get; set; } = string.Empty;
        public string? Password { get; set; }
        public long    IdPerfil { get; set; }
    }

    public class ServicioCoreDto
    {
        public string  Nombre          { get; set; } = string.Empty;
        public string? Descripcion     { get; set; }
        public long?   IdCategoria     { get; set; }
        public decimal PrecioBase      { get; set; }
        public int?    DuracionMinutos { get; set; }
    }

    public class ProductoCoreDto
    {
        public string  Nombre      { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public decimal PrecioBase  { get; set; }
        public int     Stock       { get; set; }
        public int     StockMinimo { get; set; } = 5;
        public long    IdSucursal  { get; set; }
    }

    public class PaqueteDto
    {
        public string  Nombre      { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public string? Categoria   { get; set; }
        public decimal Precio      { get; set; }
        public int     Sesiones    { get; set; } = 1;
    }


    public class DiaBloqueadoDto
    {
        public DateTime Fecha  { get; set; }
        public string   Motivo { get; set; } = string.Empty;
    }

    public class ExpedienteDto
    {
        public long    IdCliente { get; set; }
        public string? TipoPiel  { get; set; }
        public string? Alergias  { get; set; }
        public string? Medicamentos { get; set; }
        public string? Notas     { get; set; }
    }

    public class ConsentimientoDto
    {
        public string  Titulo      { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public string  Contenido   { get; set; } = string.Empty;
    }
}
