using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace AuraSpa.Api.Models
{
    [Table("Paquete")]
    public class Paquete
    {
        [Key][Column("id_paquete")] public long IdPaquete { get; set; }
        [Column("nombre")] public string Nombre { get; set; } = string.Empty;
        [Column("descripcion")] public string? Descripcion { get; set; }
        [Column("categoria")] public string? Categoria { get; set; }
        [Column("precio", TypeName = "decimal(18,2)")] public decimal Precio { get; set; }
        [Column("sesiones")] public int Sesiones { get; set; } = 1;
        [Column("activo")] public bool Activo { get; set; } = true;
        [Column("fecha_creado")] public DateTime FechaCreado { get; set; } = DateTime.Now;
    }
}
