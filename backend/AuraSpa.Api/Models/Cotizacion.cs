using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace AuraSpa.Api.Models
{
    [Table("Cotizacion")]
    public class Cotizacion
    {
        [Key][Column("id_cotizacion")] public long IdCotizacion { get; set; }
        [Column("numero_cotizacion")] public string NumeroCotizacion { get; set; } = string.Empty;
        [Column("id_cliente")] public long? IdCliente { get; set; }
        [Column("id_empleado")] public long? IdEmpleado { get; set; }
        [Column("id_usuario")] public long IdUsuario { get; set; }
        [Column("fecha")] public DateTime Fecha { get; set; } = DateTime.Now;
        [Column("fecha_vigencia")] public DateTime? FechaVigencia { get; set; }
        [Column("subtotal", TypeName = "decimal(18,2)")] public decimal Subtotal { get; set; }
        [Column("itbis", TypeName = "decimal(18,2)")] public decimal Itbis { get; set; }
        [Column("descuento", TypeName = "decimal(18,2)")] public decimal Descuento { get; set; }
        [Column("total", TypeName = "decimal(18,2)")] public decimal Total { get; set; }
        [Column("estado")] public string Estado { get; set; } = "Pendiente";
        public List<CotizacionDetalle> Detalles { get; set; } = new();
        [ForeignKey("IdCliente")] public Cliente? Cliente { get; set; }
        [ForeignKey("IdUsuario")] public Usuario? Usuario { get; set; }
    }

    [Table("CotizacionDetalle")]
    public class CotizacionDetalle
    {
        [Key][Column("id_cot_detalle")] public long IdCotDetalle { get; set; }
        [Column("id_cotizacion")] public long IdCotizacion { get; set; }
        [Column("id_item")] public long IdItem { get; set; }
        [Column("cantidad")] public int Cantidad { get; set; }
        [Column("precio_unitario", TypeName = "decimal(18,2)")] public decimal PrecioUnitario { get; set; }
        [Column("subtotal", TypeName = "decimal(18,2)")] public decimal Subtotal { get; set; }
        [ForeignKey("IdCotizacion")] public Cotizacion? Cotizacion { get; set; }
        [ForeignKey("IdItem")] public ItemCatalogo? Item { get; set; }
    }
}
