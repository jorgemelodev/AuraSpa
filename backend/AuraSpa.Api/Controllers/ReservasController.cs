using AuraSpa.Api.Data;
using AuraSpa.Api.DTOs;
using AuraSpa.Api.Models;
using AuraSpa.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Security.Claims;

namespace AuraSpa.Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class ReservasController : ControllerBase
    {
        private readonly ApplicationDbContext _ctx;
        private readonly EmailService _emailService;
        private readonly ILogger<ReservasController> _logger;

        public ReservasController(ApplicationDbContext ctx, EmailService emailService, ILogger<ReservasController> logger)
        {
            _ctx = ctx;
            _emailService = emailService;
            _logger = logger;
        }

        private static string ConstruirHtmlReserva(
            List<(string Nombre, int Cantidad, decimal PrecioUnitario, decimal Subtotal, decimal Itbis, decimal Total)> productos,
            decimal subtotalGeneral, decimal itbisGeneral, decimal totalGeneral, string sucursal)
        {
            var filas = string.Join("", productos.Select(p => $@"
                <tr>
                  <td style=""padding:8px 0;color:#333;font-size:0.9rem;"">{p.Nombre}</td>
                  <td style=""padding:8px 0;color:#666;font-size:0.9rem;text-align:center;"">x{p.Cantidad}</td>
                  <td style=""padding:8px 0;color:#666;font-size:0.9rem;text-align:right;"">RD$ {p.PrecioUnitario.ToString("N2")}</td>
                  <td style=""padding:8px 0;color:#666;font-size:0.9rem;text-align:right;"">RD$ {p.Subtotal.ToString("N2")}</td>
                  <td style=""padding:8px 0;color:#666;font-size:0.9rem;text-align:right;"">RD$ {p.Itbis.ToString("N2")}</td>
                  <td style=""padding:8px 0;color:#333;font-size:0.9rem;text-align:right;font-weight:bold;"">RD$ {p.Total.ToString("N2")}</td>
                </tr>"));

            return $@"
            <div style=""font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:520px;margin:0 auto;"">
              <div style=""background:#1A1A2E;padding:30px;text-align:center;border-radius:20px 20px 0 0;"">
                <span style=""color:#ffffff;font-size:1.6rem;font-weight:bold;"">AURA</span>
                <span style=""color:#978ADD;font-size:1.6rem;font-weight:bold;""> Spa</span>
              </div>
              <div style=""background:#ffffff;padding:30px;border:1px solid #eee;"">
                <p style=""font-size:1rem;color:#333;"">¡Hola! Tu reserva de productos fue confirmada. Aquí el resumen:</p>
                <table style=""width:100%;border-collapse:collapse;margin-top:16px;"">
                  <tr>
                    <th style=""text-align:left;padding:6px 0;color:#999;font-size:0.75rem;text-transform:uppercase;"">Producto</th>
                    <th style=""text-align:center;padding:6px 0;color:#999;font-size:0.75rem;text-transform:uppercase;"">Cant.</th>
                    <th style=""text-align:right;padding:6px 0;color:#999;font-size:0.75rem;text-transform:uppercase;"">P. Unit.</th>
                    <th style=""text-align:right;padding:6px 0;color:#999;font-size:0.75rem;text-transform:uppercase;"">Subtotal</th>
                    <th style=""text-align:right;padding:6px 0;color:#999;font-size:0.75rem;text-transform:uppercase;"">ITBIS</th>
                    <th style=""text-align:right;padding:6px 0;color:#999;font-size:0.75rem;text-transform:uppercase;"">Total</th>
                  </tr>
                  {filas}
                </table>
                <div style=""background:#f8f6ff;border-radius:15px;padding:20px;margin-top:20px;"">
                  <p style=""margin:0 0 8px;color:#666;font-size:0.9rem;""><strong>Subtotal:</strong> RD$ {subtotalGeneral.ToString("N2")}</p>
                  <p style=""margin:0 0 8px;color:#666;font-size:0.9rem;""><strong>ITBIS:</strong> RD$ {itbisGeneral.ToString("N2")}</p>
                  <p style=""margin:0 0 8px;color:#666;font-size:0.9rem;""><strong>Total:</strong> RD$ {totalGeneral.ToString("N2")}</p>
                  <p style=""margin:0;color:#666;font-size:0.9rem;""><strong>Sucursal de retiro:</strong> {sucursal}</p>
                </div>
                <p style=""font-size:0.85rem;color:#a15c00;background:#fff8e6;border-radius:10px;padding:12px;margin-top:20px;"">
                  Tienes <strong>48 horas</strong> para pasar a recoger tus productos y pagar en caja.
                </p>
              </div>
              <div style=""background:#1A1A2E;padding:16px;text-align:center;border-radius:0 0 20px 20px;"">
                <p style=""color:#ccc;font-size:0.78rem;margin:0;"">AuraSpa — contacto@auraspa.com</p>
              </div>
            </div>";
        }

        // POST /api/reservas
        [HttpPost]
        public async Task<IActionResult> CrearReserva([FromBody] CrearReservaDto dto)
        {
            if (dto.Productos == null || dto.Productos.Count == 0)
                return BadRequest("El carrito no tiene productos.");

            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var usuario   = await _ctx.Usuarios.FindAsync(idUsuario);
            if (usuario == null) return BadRequest("Usuario no encontrado.");

            var sucursal = await _ctx.Sucursales.FindAsync(dto.IdSucursal);
            if (sucursal == null) return BadRequest("Sucursal no válida.");

            // ── Verificar stock disponible ANTES de registrar la reserva ──
            var idsItemsReserva = dto.Productos.Select(p => p.IdItem).ToList();
            var stockPorItemReserva = await _ctx.ItemsCatalogoSucursal
                .Where(s => idsItemsReserva.Contains(s.IdItem) && s.IdSucursal == dto.IdSucursal)
                .ToDictionaryAsync(s => s.IdItem, s => s.Stock);
            foreach (var linea in dto.Productos)
            {
                if (!stockPorItemReserva.TryGetValue(linea.IdItem, out var stockActual) || stockActual == null)
                    continue;
                if (stockActual.Value < linea.Cantidad)
                {
                    var itemNombre = (await _ctx.ItemsCatalogo.FindAsync(linea.IdItem))?.Nombre ?? $"ítem #{linea.IdItem}";
                    return BadRequest($"Stock insuficiente para {itemNombre}. Stock disponible: {stockActual.Value}.");
                }
            }

            var reservas = new List<ProductoApartado>();
            var resumenEmail = new List<(string Nombre, int Cantidad, decimal PrecioUnitario, decimal Subtotal, decimal Itbis, decimal Total)>();
            decimal subtotalGeneral = 0, itbisGeneral = 0, totalGeneral = 0;

            foreach (var linea in dto.Productos)
            {
                var item = await _ctx.ItemsCatalogo.FindAsync(linea.IdItem);
                if (item == null) return BadRequest($"El producto {linea.IdItem} no existe.");

                var subtotal = linea.PrecioUnitario * linea.Cantidad;
                var itbis    = Math.Round(subtotal * 0.18m, 2);
                var total    = subtotal + itbis;

                reservas.Add(new ProductoApartado
                {
                    IdUsuario      = usuario.IdUsuario,
                    IdItem         = linea.IdItem,
                    Cantidad       = linea.Cantidad,
                    PrecioUnitario = linea.PrecioUnitario,
                    Subtotal       = subtotal,
                    Itbis          = itbis,
                    Total          = total,
                    IdSucursal     = dto.IdSucursal,
                    Estado         = "Pendiente",
                    FechaReserva   = DateTime.Now,
                    Notas          = dto.Notas
                });

                resumenEmail.Add((item.Nombre, linea.Cantidad, linea.PrecioUnitario, subtotal, itbis, total));
                subtotalGeneral += subtotal;
                itbisGeneral    += itbis;
                totalGeneral    += total;
            }

            _ctx.ProductosApartados.AddRange(reservas);
            await _ctx.SaveChangesAsync();

            // ── Descontar stock de los productos reservados en la sucursal elegida ──
            foreach (var linea in dto.Productos)
            {
                var itemStock = await _ctx.ItemsCatalogoSucursal
                    .FirstOrDefaultAsync(s => s.IdItem == linea.IdItem && s.IdSucursal == dto.IdSucursal);
                if (itemStock?.Stock != null)
                {
                    itemStock.Stock -= linea.Cantidad;
                    await NotificarStockBajoAsync(itemStock);
                }
            }
            await _ctx.SaveChangesAsync();

            var mensajeNotif = $"Tu reserva de {dto.Productos.Count} producto(s) en {sucursal.Nombre} fue registrada. Tienes 48 horas para recogerlos.";
            _ctx.Notificaciones.Add(new Notificacion
            {
                IdUsuario  = usuario.IdUsuario,
                Tipo       = "Orden",
                Titulo     = "Reserva confirmada",
                Mensaje    = mensajeNotif,
                FechaEnvio = DateTime.Now,
                Leida      = false
            });
            await _ctx.SaveChangesAsync();

            try
            {
                if (!string.IsNullOrEmpty(usuario.Email))
                {
                    var html = ConstruirHtmlReserva(resumenEmail, subtotalGeneral, itbisGeneral, totalGeneral, sucursal.Nombre);
                    await _emailService.SendEmailAsync(usuario.Email, usuario.Nombre,
                        "AuraSpa — Tu reserva fue confirmada", html);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "No se pudo enviar el correo de reserva confirmada para el usuario {IdUsuario}", usuario.IdUsuario);
            }

            return Ok(new { idsApartado = reservas.Select(r => r.IdApartado), total = totalGeneral });
        }

        // GET /api/reservas/mis-reservas
        [HttpGet("mis-reservas")]
        public async Task<IActionResult> GetMisReservas()
        {
            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            var reservas = await _ctx.ProductosApartados
                .Include(r => r.Item)
                .Include(r => r.Sucursal)
                .Where(r => r.IdUsuario == idUsuario)
                .OrderByDescending(r => r.FechaReserva)
                .Select(r => new
                {
                    r.IdApartado,
                    Producto  = r.Item!.Nombre,
                    r.Cantidad,
                    r.PrecioUnitario,
                    r.Subtotal,
                    r.Itbis,
                    r.Total,
                    Sucursal  = r.Sucursal!.Nombre,
                    r.Estado,
                    r.FechaReserva,
                    r.Notas
                })
                .ToListAsync();

            return Ok(reservas);
        }

        // GET /api/reservas/mis-paquetes — paquetes de sesiones adquiridos por el cliente autenticado
        [HttpGet("mis-paquetes")]
        public async Task<IActionResult> GetMisPaquetes()
        {
            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var usuario = await _ctx.Usuarios.AsNoTracking().FirstOrDefaultAsync(u => u.IdUsuario == idUsuario);
            if (usuario?.IdCliente == null) return Ok(new List<object>());

            var paquetes = await _ctx.ClientesPaquetes
                .Include(cp => cp.Paquete)
                .Where(cp => cp.IdCliente == usuario.IdCliente.Value)
                .OrderByDescending(cp => cp.FechaAdquisicion)
                .Select(cp => new
                {
                    cp.IdClientePaquete,
                    nombre           = cp.Paquete != null ? cp.Paquete.Nombre : "Paquete",
                    categoria        = cp.Paquete != null ? cp.Paquete.Categoria : null,
                    cp.SesionesTotales,
                    cp.SesionesRestantes,
                    cp.FechaAdquisicion,
                    cp.FechaExpiracion,
                    cp.Estado
                })
                .ToListAsync();

            return Ok(paquetes);
        }

        // GET /api/reservas/todas — vista de staff: todas las reservas de productos
        // de todos los clientes, para saber qué entregar/cobrar en recepción/caja.
        [HttpGet("todas")]
        [Authorize(Roles = "Admin,Cajero")]
        public async Task<IActionResult> GetTodasLasReservas([FromQuery] string? estado)
        {
            var q = _ctx.ProductosApartados
                .Include(r => r.Item)
                .Include(r => r.Sucursal)
                .AsQueryable();
            if (!string.IsNullOrWhiteSpace(estado) && estado != "Todos")
                q = q.Where(r => r.Estado == estado);

            var idsUsuarios = await q.Select(r => r.IdUsuario).Distinct().ToListAsync();
            var clientesPorUsuario = await _ctx.Usuarios.AsNoTracking()
                .Where(u => idsUsuarios.Contains(u.IdUsuario))
                .ToDictionaryAsync(u => u.IdUsuario, u => $"{u.Nombre} {u.Apellido}");

            var reservas = await q
                .OrderByDescending(r => r.FechaReserva)
                .Select(r => new
                {
                    r.IdApartado,
                    r.IdUsuario,
                    Producto  = r.Item!.Nombre,
                    r.Cantidad,
                    r.PrecioUnitario,
                    r.Subtotal,
                    r.Itbis,
                    r.Total,
                    Sucursal  = r.Sucursal!.Nombre,
                    r.Estado,
                    r.FechaReserva,
                    r.Notas
                })
                .ToListAsync();

            return Ok(reservas.Select(r => new
            {
                r.IdApartado, r.IdUsuario,
                Cliente = clientesPorUsuario.GetValueOrDefault(r.IdUsuario, "Cliente"),
                r.Producto, r.Cantidad, r.PrecioUnitario, r.Subtotal, r.Itbis, r.Total,
                r.Sucursal, r.Estado, r.FechaReserva, r.Notas
            }));
        }

        // PUT /api/reservas/{id}/cancelar
        // PUT /api/reservas/{id}/entregar — staff marca la reserva como retirada por el cliente
        // Nota: el estado persistido es "Retirado" (único valor de "completado" permitido por el
        // CHECK constraint de la tabla ProductoApartado — 'Pendiente','Retirado','Cancelado').
        [HttpPut("{id}/entregar")]
        [Authorize(Roles = "Admin,Cajero")]
        public async Task<IActionResult> EntregarReserva(long id)
        {
            var reserva = await _ctx.ProductosApartados.FindAsync(id);
            if (reserva == null) return NotFound();
            if (reserva.Estado != "Pendiente")
                return BadRequest("Solo se pueden entregar reservas en estado Pendiente.");

            reserva.Estado = "Retirado";
            await _ctx.SaveChangesAsync();
            return Ok(new { estado = reserva.Estado });
        }

        [HttpPut("{id}/cancelar")]
        public async Task<IActionResult> CancelarReserva(long id)
        {
            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var usuario   = await _ctx.Usuarios.FindAsync(idUsuario);
            var reserva   = await _ctx.ProductosApartados.Include(r => r.Item).FirstOrDefaultAsync(r => r.IdApartado == id);

            if (reserva == null || reserva.IdUsuario != idUsuario)
                return NotFound();

            if (reserva.Estado != "Pendiente")
                return BadRequest("Solo se pueden cancelar reservas en estado Pendiente.");

            reserva.Estado = "Cancelado";
            await _ctx.SaveChangesAsync();

            if (usuario != null)
            {
                _ctx.Notificaciones.Add(new Notificacion
                {
                    IdUsuario  = usuario.IdUsuario,
                    Tipo       = "Orden",
                    Titulo     = "Reserva cancelada",
                    Mensaje    = $"Tu reserva de {reserva.Item?.Nombre ?? "producto"} fue cancelada.",
                    FechaEnvio = DateTime.Now,
                    Leida      = false
                });
                await _ctx.SaveChangesAsync();

                try
                {
                    if (!string.IsNullOrEmpty(usuario.Email))
                    {
                        var html = ConstruirHtmlCancelacionReserva(reserva.Item?.Nombre ?? "Producto", reserva.Cantidad, reserva.Total);
                        await _emailService.SendEmailAsync(usuario.Email, usuario.Nombre, "AuraSpa — Tu reserva fue cancelada", html);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "No se pudo enviar el correo de cancelación para la reserva {IdApartado}", reserva.IdApartado);
                }
            }

            return Ok(new { message = "Reserva cancelada exitosamente." });
        }

        private static string ConstruirHtmlCancelacionReserva(string producto, int cantidad, decimal total)
        {
            return $@"
            <div style=""font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:520px;margin:0 auto;"">
              <div style=""background:#1A1A2E;padding:30px;text-align:center;border-radius:20px 20px 0 0;"">
                <span style=""color:#ffffff;font-size:1.6rem;font-weight:bold;"">AURA</span>
                <span style=""color:#978ADD;font-size:1.6rem;font-weight:bold;""> Spa</span>
              </div>
              <div style=""background:#ffffff;padding:30px;border:1px solid #eee;"">
                <p style=""font-size:1rem;color:#333;"">Tu reserva fue cancelada exitosamente. Detalles:</p>
                <div style=""background:#fef2f2;border-radius:15px;padding:20px;margin-top:20px;"">
                  <p style=""margin:0 0 8px;color:#666;font-size:0.9rem;""><strong>Producto:</strong> {producto}</p>
                  <p style=""margin:0 0 8px;color:#666;font-size:0.9rem;""><strong>Cantidad:</strong> x{cantidad}</p>
                  <p style=""margin:0;color:#666;font-size:0.9rem;""><strong>Total:</strong> RD$ {total.ToString("N2")}</p>
                </div>
              </div>
              <div style=""background:#1A1A2E;padding:16px;text-align:center;border-radius:0 0 20px 20px;"">
                <p style=""color:#ccc;font-size:0.78rem;margin:0;"">AuraSpa — contacto@auraspa.com</p>
              </div>
            </div>";
        }

        // Stock bajo tras una reserva: aviso máximo por producto por usuario por día.
        private async Task NotificarStockBajoAsync(ItemCatalogoSucursal itemStock)
        {
            if (itemStock.Stock == null || itemStock.Stock > itemStock.StockMinimo) return;

            var item = await _ctx.ItemsCatalogo.FindAsync(itemStock.IdItem);
            var nombreItem = item?.Nombre ?? "un producto";
            var hoy = DateTime.Now.Date;

            var idsDestinatarios = await _ctx.Usuarios.Include(u => u.Perfil)
                .Where(u => u.Activo && (u.Perfil!.Nombre == "Admin" || u.Perfil.Nombre == "Cajero"))
                .Select(u => u.IdUsuario)
                .ToListAsync();

            foreach (var idUsuario in idsDestinatarios)
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
}
