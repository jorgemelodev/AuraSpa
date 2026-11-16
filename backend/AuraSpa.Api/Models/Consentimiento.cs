using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace AuraSpa.Api.Models
{
    [Table("Consentimiento")]
    public class Consentimiento
    {
        [Key][Column("id_consentimiento")] public long IdConsentimiento { get; set; }
        [Column("titulo")] public string Titulo { get; set; } = string.Empty;
        [Column("descripcion")] public string? Descripcion { get; set; }
        [Column("contenido")] public string Contenido { get; set; } = string.Empty;
        [Column("activo")] public bool Activo { get; set; } = true;
        [Column("fecha_creacion")] public DateTime FechaCreacion { get; set; } = DateTime.Now;
    }
}
