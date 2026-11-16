using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace AuraSpa.Api.Models
{
    /// <summary>
    /// Descriptor facial de un usuario para el check-in del kiosko (Aurora).
    /// Guarda SOLO un vector matemático de 128 dimensiones generado por
    /// face-api.js en el navegador — nunca se almacenan fotos.
    /// </summary>
    [Table("RostroDescriptor")]
    public class RostroDescriptor
    {
        [Key][Column("id_rostro")] public long IdRostro { get; set; }
        [Column("id_usuario")] public long IdUsuario { get; set; }
        /// <summary>JSON: arreglo de 128 flotantes.</summary>
        [Column("descriptor")] public string Descriptor { get; set; } = string.Empty;
        [Column("fecha_registro")] public DateTime FechaRegistro { get; set; } = DateTime.Now;
        [Column("activo")] public bool Activo { get; set; } = true;
        [ForeignKey("IdUsuario")] public Usuario? Usuario { get; set; }
    }
}
