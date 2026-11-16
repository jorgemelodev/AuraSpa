using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace AuraSpa.Api.Models
{
    [Table("ClientePaquete")]
    public class ClientePaquete
    {
        [Key][Column("id_cliente_paquete")] public long IdClientePaquete { get; set; }
        [Column("id_cliente")] public long IdCliente { get; set; }
        [Column("id_paquete")] public long IdPaquete { get; set; }
        [Column("sesiones_totales")] public int SesionesTotales { get; set; }
        [Column("sesiones_restantes")] public int SesionesRestantes { get; set; }
        [Column("fecha_adquisicion")] public DateTime FechaAdquisicion { get; set; } = DateTime.Now;
        [Column("fecha_expiracion")] public DateTime? FechaExpiracion { get; set; }
        [Column("estado")] public string Estado { get; set; } = "Activo";

        [ForeignKey("IdCliente")] public Cliente? Cliente { get; set; }
        [ForeignKey("IdPaquete")] public Paquete? Paquete { get; set; }
    }
}
