using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace AuraSpa.Api.Models
{
    [Table("ExpedienteClinico")]
    public class ExpedienteClinico
    {
        [Key][Column("id_expediente")] public long IdExpediente { get; set; }
        [Column("id_cliente")] public long IdCliente { get; set; }
        [Column("tipo_piel")] public string? TipoPiel { get; set; }
        [Column("alergias")] public string? Alergias { get; set; }
        [Column("condiciones_medicas")] public string? CondicionesMedicas { get; set; }
        [Column("medicamentos")] public string? Medicamentos { get; set; }
        [Column("notas_especialista")] public string? NotasEspecialista { get; set; }
        [Column("ultima_actualizacion")] public DateTime UltimaActualizacion { get; set; } = DateTime.Now;
        [Column("activo")] public bool Activo { get; set; } = true;
        [ForeignKey("IdCliente")] public Cliente? Cliente { get; set; }
    }
}
