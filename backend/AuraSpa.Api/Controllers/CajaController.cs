using AuraSpa.Api.Data;
using AuraSpa.Api.DTOs;
using AuraSpa.Api.Helpers;
using AuraSpa.Api.Models;
using AuraSpa.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace AuraSpa.Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Cajero,Admin,Especialista")]
    public class CajaController : ControllerBase
    {
        private readonly ApplicationDbContext _ctx;
        private readonly EmailService _emailService;
        public CajaController(ApplicationDbContext ctx, EmailService emailService)
        { _ctx = ctx; _emailService = emailService; }

        // GET /api/caja/sesion-activa/{usuarioId}
        [HttpGet("sesion-activa/{usuarioId}")]
        public async Task<IActionResult> GetSesionActiva(long usuarioId)
        {
            var sesion = await _ctx.SesionesCaja
                .Include(s => s.Sucursal)
                .FirstOrDefaultAsync(s => s.IdUsuario == usuarioId && s.Estado == "Abierta");
            if (sesion == null) return NotFound("No hay sesión activa.");
            return Ok(sesion);
        }

        // POST /api/caja/apertura
        [HttpPost("apertura")]
        public async Task<IActionResult> AbrirCaja([FromBody] AperturaCajaDto dto)
        {
            if (dto.MontoInicial < 0)
                return BadRequest("El monto inicial no puede ser negativo.");

            if (await _ctx.SesionesCaja.AnyAsync(s => s.IdUsuario == dto.IdUsuario && s.Estado == "Abierta"))
                return BadRequest("Ya tienes una sesión de caja abierta.");

            var sesion = new SesionCaja
            {
                IdUsuario     = dto.IdUsuario,
                IdSucursal    = dto.IdSucursal,
                MontoInicial  = dto.MontoInicial,
                NotasApertura = dto.Notas,
                Estado        = "Abierta"
            };
            _ctx.SesionesCaja.Add(sesion);
            await _ctx.SaveChangesAsync();
            return Ok(sesion);
        }

        // POST /api/caja/cierre/{id}
        [HttpPost("cierre/{id}")]
        public async Task<IActionResult> CerrarCaja(long id, [FromBody] CierreCajaDto dto)
        {
            var sesion = await _ctx.SesionesCaja.FindAsync(id);
            if (sesion == null || sesion.Estado != "Abierta") return NotFound("Sesión no encontrada.");

            sesion.FechaCierre  = DateTime.Now;
            sesion.MontoFinal   = dto.MontoFinal;
            sesion.Diferencia   = dto.MontoFinal - sesion.MontoInicial;
            sesion.Justificacion = dto.Justificacion;
            sesion.Estado       = "Cerrada";
            await _ctx.SaveChangesAsync();
            return Ok(sesion);
        }

        // POST /api/caja/venta
        [HttpPost("venta")]
        public async Task<IActionResult> RegistrarVenta([FromBody] VentaDto dto)
        {
            var idUsuarioVenta = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var sesionAbierta = await _ctx.SesionesCaja.AnyAsync(s => s.IdUsuario == idUsuarioVenta && s.Estado == "Abierta");
            if (!sesionAbierta)
                return BadRequest("Debes abrir la caja antes de registrar una venta.");

            if (dto.Detalles == null || dto.Detalles.Count == 0)
                return BadRequest("La venta debe tener al menos un ítem.");

            if (dto.CondicionPago == "Credito" && !dto.IdCliente.HasValue)
                return BadRequest("Las ventas a crédito requieren un cliente identificado.");

            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            // ── Verificar stock disponible de los productos ANTES de registrar la venta ──
            var sesionVenta = await _ctx.SesionesCaja.FindAsync(dto.IdSesionCaja);
            if (sesionVenta == null) return BadRequest("Sesión de caja no válida.");

            var idsItems = dto.Detalles.Select(d => d.IdItem).ToList();
            var itemsInfo = await _ctx.ItemsCatalogo
                .Where(i => idsItems.Contains(i.IdItem))
                .ToDictionaryAsync(i => i.IdItem, i => i.Nombre);
            var stockPorItem = await _ctx.ItemsCatalogoSucursal
                .Where(s => idsItems.Contains(s.IdItem) && s.IdSucursal == sesionVenta.IdSucursal)
                .ToDictionaryAsync(s => s.IdItem, s => s.Stock);

            foreach (var d in dto.Detalles)
            {
                if (!stockPorItem.TryGetValue(d.IdItem, out var stockActual) || stockActual == null)
                    continue; // sin registro de stock para este ítem (ej. servicios) → no aplica control de inventario
                if (stockActual.Value < d.Cantidad)
                {
                    var nombreItem = itemsInfo.GetValueOrDefault(d.IdItem, $"ítem #{d.IdItem}");
                    return BadRequest($"Stock insuficiente para {nombreItem}. Stock disponible: {stockActual.Value}.");
                }
            }

            // Calcular montos
            decimal subtotal = 0;
            var detalles = new List<VentaDetalle>();

            foreach (var d in dto.Detalles)
            {
                var linea = (d.PrecioUnitario - d.DescuentoLinea) * d.Cantidad;
                subtotal += linea;
                detalles.Add(new VentaDetalle
                {
                    IdItem         = d.IdItem,
                    IdEmpleado     = d.IdEmpleado,
                    Cantidad       = d.Cantidad,
                    PrecioUnitario = d.PrecioUnitario,
                    DescuentoLinea = d.DescuentoLinea,
                    Subtotal       = linea
                });
            }

            decimal itbis = subtotal * 0.18m;
            decimal total = subtotal + itbis;

            // Generar número de factura único
            var numFactura = $"FAC-{DateTime.Now:yyyyMMdd}-{DateTime.Now.Ticks % 100000:D5}";

            var venta = new Venta
            {
                NumeroFactura = numFactura,
                IdCliente     = dto.IdCliente,
                IdUsuario     = idUsuario,
                IdSesionCaja  = dto.IdSesionCaja,
                IdMetodoPago  = dto.IdMetodoPago,
                CondicionPago = dto.CondicionPago,
                TipoVenta     = "POS",
                Subtotal      = subtotal,
                Itbis         = itbis,
                Descuento     = 0,
                Total         = total,
                Estado        = "Completada",
                Detalles      = detalles
            };

            _ctx.Ventas.Add(venta);

            if (venta.IdCliente.HasValue)
            {
                var cliente = await _ctx.Clientes.FindAsync(venta.IdCliente.Value);
                if (cliente != null) cliente.Puntos += PuntosCalculator.PorMonto(venta.Total);
            }

            await _ctx.SaveChangesAsync();

            // ── Descontar stock de los productos vendidos en la sucursal de la sesión ──
            foreach (var d in dto.Detalles)
            {
                var itemStock = await _ctx.ItemsCatalogoSucursal
                    .FirstOrDefaultAsync(s => s.IdItem == d.IdItem && s.IdSucursal == sesionVenta.IdSucursal);
                if (itemStock?.Stock != null)
                {
                    itemStock.Stock -= d.Cantidad;
                    await NotificarStockBajoAsync(itemStock);
                }
            }
            await _ctx.SaveChangesAsync();

            if (dto.CondicionPago == "Credito")
            {
                _ctx.CuentasPorCobrar.Add(new CuentaPorCobrar
                {
                    IdVenta          = venta.IdVenta,
                    IdCliente        = venta.IdCliente!.Value,
                    MontoOriginal    = venta.Total,
                    MontoAbonado     = 0,
                    FechaVencimiento = DateTime.Now.AddDays(15),
                    Estado           = "Pendiente"
                });
                await _ctx.SaveChangesAsync();
            }

            // ── Enviar factura por correo al cliente (si tiene email) ──
            if (venta.IdCliente.HasValue)
            {
                try
                {
                    var cli = await _ctx.Clientes.FindAsync(venta.IdCliente.Value);
                    var emailCliente = cli?.Email
                        ?? (await _ctx.Usuarios.FirstOrDefaultAsync(u => u.IdCliente == venta.IdCliente))?.Email;
                    if (!string.IsNullOrWhiteSpace(emailCliente))
                    {
                        var nombresItems = await _ctx.ItemsCatalogo
                            .Where(i => detalles.Select(d => d.IdItem).Contains(i.IdItem))
                            .ToDictionaryAsync(i => i.IdItem, i => i.Nombre);
                        var filas = string.Join("", detalles.Select(d =>
                            $"<tr><td style='padding:6px 10px'>{nombresItems.GetValueOrDefault(d.IdItem, "Ítem")}</td>" +
                            $"<td style='padding:6px 10px;text-align:center'>{d.Cantidad}</td>" +
                            $"<td style='padding:6px 10px;text-align:right'>RD$ {d.Subtotal:N2}</td></tr>"));
                        var html = $@"
                            <div style='font-family:Arial,sans-serif;max-width:520px'>
                              <h2 style='color:#6B5B93'>AuraSpa — Factura {venta.NumeroFactura}</h2>
                              <p>Hola {cli?.Nombres}, gracias por tu compra. Este es el detalle de tu factura:</p>
                              <table style='width:100%;border-collapse:collapse;background:#faf9ff;border-radius:8px'>
                                <tr style='background:#EDE8F5'><th style='padding:8px 10px;text-align:left'>Ítem</th><th style='padding:8px 10px'>Cant.</th><th style='padding:8px 10px;text-align:right'>Subtotal</th></tr>
                                {filas}
                              </table>
                              <p style='margin-top:12px'>Subtotal: <strong>RD$ {venta.Subtotal:N2}</strong><br/>
                              ITBIS (18%): <strong>RD$ {venta.Itbis:N2}</strong><br/>
                              Total: <strong style='color:#6B5B93;font-size:1.15em'>RD$ {venta.Total:N2}</strong></p>
                              <p style='color:#999;font-size:0.85em'>Fecha: {DateTime.Now:dd/MM/yyyy h:mm tt} · ¡Gracias por preferirnos! 🌸</p>
                            </div>";
                        await _emailService.SendEmailAsync(emailCliente, cli?.Nombres ?? "Cliente",
                            $"Tu factura {venta.NumeroFactura} — AuraSpa", html);
                    }
                }
                catch { /* el correo nunca debe bloquear la venta */ }
            }

            return Ok(new { venta.IdVenta, venta.NumeroFactura, venta.Total, venta.Itbis, venta.Subtotal });
        }

        // GET /api/caja/ventas/{sesionId}
        [HttpGet("ventas/{sesionId}")]
        public async Task<IActionResult> GetVentasPorSesion(long sesionId)
        {
            var ventas = await _ctx.Ventas
                .Where(v => v.IdSesionCaja == sesionId)
                .OrderByDescending(v => v.Fecha)
                .Select(v => new
                {
                    v.IdVenta,
                    v.NumeroFactura,
                    v.IdCliente,
                    v.IdMetodoPago,
                    v.Fecha,
                    v.Subtotal,
                    v.Itbis,
                    v.Total,
                    v.CondicionPago,
                    v.Estado,
                    Detalles = v.Detalles.Select(d => new
                    {
                        d.IdDetalle,
                        d.IdItem,
                        Producto = d.Item != null ? d.Item.Nombre : "",
                        d.Cantidad,
                        d.PrecioUnitario,
                        d.Subtotal
                    })
                })
                .ToListAsync();
            return Ok(ventas);
        }

        // GET /api/caja/movimientos?desde=&hasta=  (por defecto, ventas del día actual)
        [HttpGet("movimientos")]
        public async Task<IActionResult> GetMovimientos([FromQuery] DateTime? desde, [FromQuery] DateTime? hasta)
        {
            var inicio = (desde ?? DateTime.Today).Date;
            var fin    = (hasta ?? DateTime.Today).Date.AddDays(1);

            var movimientos = await _ctx.Ventas
                .Include(v => v.Usuario)
                .Where(v => v.Fecha >= inicio && v.Fecha < fin)
                .OrderByDescending(v => v.Fecha)
                .Select(v => new
                {
                    id            = v.IdVenta,
                    concepto      = "Venta #" + v.NumeroFactura,
                    fecha         = v.Fecha,
                    tipo          = "Ingreso",
                    condicionPago = v.CondicionPago,
                    usuario       = v.Usuario != null ? v.Usuario.Nombre + " " + v.Usuario.Apellido : "—",
                    monto         = v.Total,
                    estado        = v.Estado
                })
                .ToListAsync();

            return Ok(movimientos);
        }

        // GET /api/caja/cxc — todas las cuentas por cobrar (pendientes, parciales y saldadas)
        [HttpGet("cxc")]
        public async Task<IActionResult> GetCxc()
        {
            await NotificarCxCProximasAVencerAsync();

            var cxc = await _ctx.CuentasPorCobrar
                .Include(c => c.Venta)
                .Include(c => c.Cliente)
                .OrderBy(c => c.FechaVencimiento)
                .Select(c => new
                {
                    id               = c.IdCxc,
                    ventaId          = c.Venta != null ? c.Venta.NumeroFactura : "",
                    clienteNombre    = c.Cliente != null ? c.Cliente.Nombres + " " + c.Cliente.Apellidos : "Cliente",
                    montoTotal       = c.MontoOriginal,
                    montoPagado      = c.MontoAbonado,
                    saldoPendiente   = c.MontoOriginal - c.MontoAbonado,
                    fechaVencimiento = c.FechaVencimiento,
                    estado           = c.Estado
                })
                .ToListAsync();

            return Ok(cxc);
        }

        // POST /api/caja/cxc/{id}/abono
        [HttpPost("cxc/{id}/abono")]
        public async Task<IActionResult> RegistrarAbono(long id, [FromBody] RegistrarAbonoDto dto)
        {
            var cxc = await _ctx.CuentasPorCobrar.FindAsync(id);
            if (cxc == null) return NotFound("Cuenta por cobrar no encontrada.");

            var saldo = cxc.MontoOriginal - cxc.MontoAbonado;
            if (dto.Monto <= 0 || dto.Monto > saldo)
                return BadRequest("El monto del abono no es válido.");

            cxc.MontoAbonado += dto.Monto;
            cxc.Estado = (cxc.MontoOriginal - cxc.MontoAbonado) <= 0 ? "Saldada" : "Parcial";
            await _ctx.SaveChangesAsync();

            return Ok(new { cxc.IdCxc, cxc.MontoAbonado, saldoPendiente = cxc.MontoOriginal - cxc.MontoAbonado, cxc.Estado });
        }

        // POST /api/caja/cxc/{id}/recordatorio — envía por correo un recordatorio de pago al cliente
        [HttpPost("cxc/{id}/recordatorio")]
        public async Task<IActionResult> EnviarRecordatorioCxc(long id)
        {
            var cxc = await _ctx.CuentasPorCobrar.Include(c => c.Cliente).FirstOrDefaultAsync(c => c.IdCxc == id);
            if (cxc == null) return NotFound("Cuenta por cobrar no encontrada.");

            var emailCliente = cxc.Cliente?.Email
                ?? (await _ctx.Usuarios.FirstOrDefaultAsync(u => u.IdCliente == cxc.IdCliente))?.Email;
            if (string.IsNullOrWhiteSpace(emailCliente))
                return BadRequest("Este cliente no tiene un correo registrado para enviarle el recordatorio.");

            var saldoPendiente = cxc.MontoOriginal - cxc.MontoAbonado;
            var nombreCliente = cxc.Cliente != null ? $"{cxc.Cliente.Nombres} {cxc.Cliente.Apellidos}" : "Cliente";

            var html = $@"
                <div style='font-family:Arial,sans-serif;max-width:520px'>
                  <h2 style='color:#6B5B93'>AuraSpa — Recordatorio de pago pendiente</h2>
                  <p>Hola {nombreCliente}, te recordamos que tienes un saldo pendiente con nosotros:</p>
                  <div style='background:#faf9ff;border-radius:12px;padding:16px;margin:16px 0'>
                    <p style='margin:0 0 8px'>Monto pendiente: <strong style='color:#6B5B93;font-size:1.15em'>RD$ {saldoPendiente:N2}</strong></p>
                    <p style='margin:0'>Fecha límite: <strong>{cxc.FechaVencimiento:dd/MM/yyyy}</strong></p>
                  </div>
                  <p style='color:#999;font-size:0.85em'>Puedes acercarte a cualquiera de nuestras sucursales para saldar tu cuenta. ¡Gracias por preferirnos! 🌸</p>
                </div>";

            try
            {
                await _emailService.SendEmailAsync(emailCliente, nombreCliente, "AuraSpa — Recordatorio de pago pendiente", html);
            }
            catch
            {
                return StatusCode(502, "No se pudo enviar el recordatorio. Intenta de nuevo.");
            }

            return Ok(new { mensaje = "Recordatorio enviado por correo.", email = emailCliente });
        }

        // POST /api/caja/cotizacion/enviar-correo — envía la cotización en PDF (generada en el navegador) al cliente
        [HttpPost("cotizacion/enviar-correo")]
        public async Task<IActionResult> EnviarCotizacionPorCorreo([FromBody] EnviarCotizacionDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Email))
                return BadRequest("Selecciona un cliente para enviar la cotización.");
            if (string.IsNullOrWhiteSpace(dto.PdfBase64))
                return BadRequest("No se pudo generar el PDF de la cotización.");

            byte[] pdfBytes;
            try { pdfBytes = Convert.FromBase64String(dto.PdfBase64); }
            catch { return BadRequest("El PDF adjunto no es válido."); }

            var html = $@"
                <div style='font-family:Arial,sans-serif;max-width:520px'>
                  <h2 style='color:#6B5B93'>AuraSpa — Cotización {dto.NumeroCotizacion}</h2>
                  <p>Hola {dto.Nombre}, adjunto encontrarás la cotización de servicios/productos solicitada.</p>
                  <p style='color:#999;font-size:0.85em'>Esta cotización es válida por 15 días a partir de su emisión. ¡Gracias por preferirnos! 🌸</p>
                </div>";

            try
            {
                await _emailService.SendEmailAsync(dto.Email, dto.Nombre ?? "Cliente",
                    $"Tu cotización {dto.NumeroCotizacion} — AuraSpa", html,
                    pdfBytes, $"cotizacion-{dto.NumeroCotizacion}.pdf");
            }
            catch
            {
                return StatusCode(502, "No se pudo enviar el correo. Intenta de nuevo.");
            }

            return Ok(new { mensaje = "Cotización enviada por correo." });
        }

        // POST /api/caja/cotizaciones — genera y persiste una cotización
        [HttpPost("cotizaciones")]
        public async Task<IActionResult> CrearCotizacion([FromBody] CrearCotizacionDto dto)
        {
            if (dto.Detalles == null || dto.Detalles.Count == 0)
                return BadRequest("La cotización debe tener al menos un ítem.");

            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            decimal subtotal = 0;
            var detalles = new List<CotizacionDetalle>();
            foreach (var d in dto.Detalles)
            {
                var linea = d.PrecioUnitario * d.Cantidad;
                subtotal += linea;
                detalles.Add(new CotizacionDetalle
                {
                    IdItem = d.IdItem, Cantidad = d.Cantidad,
                    PrecioUnitario = d.PrecioUnitario, Subtotal = linea
                });
            }
            var itbis = Math.Round(subtotal * 0.18m, 2);
            var total = subtotal + itbis;
            var numero = $"COT-{DateTime.Now:yyyyMMdd}-{DateTime.Now.Ticks % 100000:D5}";

            var cotizacion = new Cotizacion
            {
                NumeroCotizacion = numero,
                IdCliente        = dto.IdCliente,
                IdEmpleado       = dto.IdEmpleado,
                IdUsuario        = idUsuario,
                Fecha            = DateTime.Now,
                FechaVigencia    = DateTime.Now.AddDays(15),
                Subtotal         = subtotal,
                Itbis            = itbis,
                Descuento        = 0,
                Total            = total,
                Estado           = "Pendiente",
                Detalles         = detalles
            };
            _ctx.Cotizaciones.Add(cotizacion);
            await _ctx.SaveChangesAsync();

            return Ok(new { cotizacion.IdCotizacion, cotizacion.NumeroCotizacion, cotizacion.Subtotal, cotizacion.Itbis, cotizacion.Total, cotizacion.Estado, cotizacion.FechaVigencia });
        }

        // GET /api/caja/cotizaciones — lista las cotizaciones registradas
        [HttpGet("cotizaciones")]
        public async Task<IActionResult> GetCotizaciones()
        {
            var cotizaciones = await _ctx.Cotizaciones
                .Include(c => c.Cliente).Include(c => c.Usuario)
                .Include(c => c.Detalles).ThenInclude(d => d.Item)
                .OrderByDescending(c => c.Fecha)
                .Select(c => new
                {
                    c.IdCotizacion, c.NumeroCotizacion,
                    cliente = c.Cliente != null ? c.Cliente.Nombres + " " + c.Cliente.Apellidos : "Cliente general",
                    usuario = c.Usuario != null ? c.Usuario.Nombre + " " + c.Usuario.Apellido : "—",
                    c.Fecha, c.FechaVigencia, c.Subtotal, c.Itbis, c.Total, c.Estado,
                    detalles = c.Detalles.Select(d => new { d.IdItem, item = d.Item != null ? d.Item.Nombre : "Ítem", d.Cantidad, d.PrecioUnitario, d.Subtotal })
                })
                .ToListAsync();
            return Ok(cotizaciones);
        }

        // PUT /api/caja/cotizaciones/{id}/convertir — convierte una cotización Pendiente en una venta real
        [HttpPut("cotizaciones/{id}/convertir")]
        public async Task<IActionResult> ConvertirCotizacion(long id, [FromBody] ConvertirCotizacionDto dto)
        {
            var cotizacion = await _ctx.Cotizaciones.Include(c => c.Detalles).FirstOrDefaultAsync(c => c.IdCotizacion == id);
            if (cotizacion == null) return NotFound("Cotización no encontrada.");

            if (cotizacion.Estado != "Pendiente")
                return BadRequest($"Esta cotización ya fue procesada (estado actual: {cotizacion.Estado}) y no se puede volver a facturar.");

            if (cotizacion.FechaVigencia.HasValue && cotizacion.FechaVigencia.Value < DateTime.Now)
            {
                cotizacion.Estado = "Expirada";
                await _ctx.SaveChangesAsync();
                return BadRequest("Esta cotización venció su fecha de vigencia y no se puede convertir. Genera una nueva.");
            }

            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var sesionVenta = await _ctx.SesionesCaja.FindAsync(dto.IdSesionCaja);
            if (sesionVenta == null) return BadRequest("Sesión de caja no válida.");

            // ── Verificar stock disponible antes de facturar ──
            var idsItems = cotizacion.Detalles.Select(d => d.IdItem).ToList();
            var itemsInfo = await _ctx.ItemsCatalogo.Where(i => idsItems.Contains(i.IdItem)).ToDictionaryAsync(i => i.IdItem, i => i.Nombre);
            var stockPorItem = await _ctx.ItemsCatalogoSucursal
                .Where(s => idsItems.Contains(s.IdItem) && s.IdSucursal == sesionVenta.IdSucursal)
                .ToDictionaryAsync(s => s.IdItem, s => s.Stock);
            foreach (var d in cotizacion.Detalles)
            {
                if (!stockPorItem.TryGetValue(d.IdItem, out var stockActual) || stockActual == null) continue;
                if (stockActual.Value < d.Cantidad)
                    return BadRequest($"Stock insuficiente para {itemsInfo.GetValueOrDefault(d.IdItem, "el ítem")}. Stock disponible: {stockActual.Value}.");
            }

            if (dto.CondicionPago == "Credito" && !cotizacion.IdCliente.HasValue)
                return BadRequest("Las ventas a crédito requieren un cliente identificado.");

            var venta = new Venta
            {
                NumeroFactura = $"FAC-{DateTime.Now:yyyyMMdd}-{DateTime.Now.Ticks % 100000:D5}",
                IdCliente     = cotizacion.IdCliente,
                IdUsuario     = idUsuario,
                IdSesionCaja  = dto.IdSesionCaja,
                IdMetodoPago  = dto.IdMetodoPago,
                CondicionPago = dto.CondicionPago,
                TipoVenta     = "POS",
                Subtotal      = cotizacion.Subtotal,
                Itbis         = cotizacion.Itbis,
                Descuento     = cotizacion.Descuento,
                Total         = cotizacion.Total,
                Estado        = "Completada",
                Detalles      = cotizacion.Detalles.Select(d => new VentaDetalle
                {
                    IdItem = d.IdItem, IdEmpleado = cotizacion.IdEmpleado,
                    Cantidad = d.Cantidad, PrecioUnitario = d.PrecioUnitario, DescuentoLinea = 0, Subtotal = d.Subtotal
                }).ToList()
            };
            _ctx.Ventas.Add(venta);

            if (venta.IdCliente.HasValue)
            {
                var cliente = await _ctx.Clientes.FindAsync(venta.IdCliente.Value);
                if (cliente != null) cliente.Puntos += PuntosCalculator.PorMonto(venta.Total);
            }

            cotizacion.Estado = "Facturada";
            await _ctx.SaveChangesAsync();

            // ── Descontar stock ──
            foreach (var d in cotizacion.Detalles)
            {
                var itemStock = await _ctx.ItemsCatalogoSucursal
                    .FirstOrDefaultAsync(s => s.IdItem == d.IdItem && s.IdSucursal == sesionVenta.IdSucursal);
                if (itemStock?.Stock != null)
                {
                    itemStock.Stock -= d.Cantidad;
                    await NotificarStockBajoAsync(itemStock);
                }
            }
            await _ctx.SaveChangesAsync();

            if (dto.CondicionPago == "Credito")
            {
                _ctx.CuentasPorCobrar.Add(new CuentaPorCobrar
                {
                    IdVenta = venta.IdVenta, IdCliente = venta.IdCliente!.Value,
                    MontoOriginal = venta.Total, MontoAbonado = 0,
                    FechaVencimiento = DateTime.Now.AddDays(15), Estado = "Pendiente"
                });
                await _ctx.SaveChangesAsync();
            }

            return Ok(new { venta.IdVenta, venta.NumeroFactura, venta.Total, cotizacionEstado = cotizacion.Estado });
        }

        // ── Notificaciones para staff (Admin/Cajero) ──────────────────────

        private async Task<List<long>> IdsUsuariosAdminCajeroAsync()
            => await _ctx.Usuarios.Include(u => u.Perfil)
                .Where(u => u.Activo && (u.Perfil!.Nombre == "Admin" || u.Perfil.Nombre == "Cajero"))
                .Select(u => u.IdUsuario)
                .ToListAsync();

        // CxC próximas a vencer (dentro de los próximos 3 días, sin contar las ya vencidas):
        // se revisa cada vez que alguien abre la pantalla de CxC, con un aviso máximo por usuario por día.
        private async Task NotificarCxCProximasAVencerAsync()
        {
            var hoy = DateTime.Now.Date;
            var limite = hoy.AddDays(3);
            var cantidad = await _ctx.CuentasPorCobrar.CountAsync(c =>
                (c.Estado == "Pendiente" || c.Estado == "Parcial") &&
                c.FechaVencimiento.Date >= hoy && c.FechaVencimiento.Date <= limite);
            if (cantidad == 0) return;

            foreach (var idUsuario in await IdsUsuariosAdminCajeroAsync())
            {
                var yaAvisadoHoy = await _ctx.Notificaciones.AnyAsync(n =>
                    n.IdUsuario == idUsuario && n.Tipo == "CxC" && n.FechaEnvio.Date == hoy);
                if (yaAvisadoHoy) continue;

                _ctx.Notificaciones.Add(new Notificacion
                {
                    IdUsuario  = idUsuario,
                    Tipo       = "CxC",
                    Titulo     = "Cuentas por cobrar próximas a vencer",
                    Mensaje    = $"Tienes {cantidad} cuenta{(cantidad == 1 ? "" : "s")} por cobrar que vence{(cantidad == 1 ? "" : "n")} en los próximos 3 días.",
                    UrlAccion  = "/cuentas-por-cobrar",
                    FechaEnvio = DateTime.Now,
                    Leida      = false
                });
            }
            await _ctx.SaveChangesAsync();
        }

        // Stock bajo: aviso máximo por producto por usuario por día para no saturar.
        private async Task NotificarStockBajoAsync(ItemCatalogoSucursal itemStock)
        {
            if (itemStock.Stock == null || itemStock.Stock > itemStock.StockMinimo) return;

            var item = await _ctx.ItemsCatalogo.FindAsync(itemStock.IdItem);
            var nombreItem = item?.Nombre ?? "un producto";
            var hoy = DateTime.Now.Date;

            foreach (var idUsuario in await IdsUsuariosAdminCajeroAsync())
            {
                var yaAvisadoHoy = await _ctx.Notificaciones.AnyAsync(n =>
                    n.IdUsuario == idUsuario && n.Tipo == "Inventario" && n.Mensaje.Contains(nombreItem) && n.FechaEnvio.Date == hoy);
                if (yaAvisadoHoy) continue;

                _ctx.Notificaciones.Add(new Notificacion
                {
                    IdUsuario  = idUsuario,
                    Tipo       = "Inventario",
                    Titulo     = "Stock bajo",
                    Mensaje    = $"\"{nombreItem}\" tiene stock bajo: quedan {itemStock.Stock} unidad{(itemStock.Stock == 1 ? "" : "es")}.",
                    UrlAccion  = "/core?seccion=inventario",
                    FechaEnvio = DateTime.Now,
                    Leida      = false
                });
            }
            await _ctx.SaveChangesAsync();
        }
    }

    // DTOs locales de Caja
    public class AperturaCajaDto
    {
        public long    IdUsuario    { get; set; }
        public long    IdSucursal   { get; set; }
        public decimal MontoInicial { get; set; }
        public string? Notas        { get; set; }
    }

    public class CierreCajaDto
    {
        public decimal MontoFinal   { get; set; }
        public string? Justificacion { get; set; }
    }

    public class RegistrarAbonoDto
    {
        public decimal Monto { get; set; }
    }

    public class EnviarCotizacionDto
    {
        public string  Email            { get; set; } = string.Empty;
        public string? Nombre           { get; set; }
        public string  NumeroCotizacion { get; set; } = string.Empty;
        public string  PdfBase64        { get; set; } = string.Empty;
    }

    public class CrearCotizacionDto
    {
        public long? IdCliente  { get; set; }
        public long? IdEmpleado { get; set; }
        public List<CotizacionDetalleDto> Detalles { get; set; } = new();
    }

    public class CotizacionDetalleDto
    {
        public long    IdItem         { get; set; }
        public int     Cantidad       { get; set; }
        public decimal PrecioUnitario { get; set; }
    }

    public class ConvertirCotizacionDto
    {
        public long    IdSesionCaja  { get; set; }
        public long?   IdMetodoPago  { get; set; }
        public string  CondicionPago { get; set; } = "Contado";
    }
}
