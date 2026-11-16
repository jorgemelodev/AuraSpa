using System.Security.Claims;
using AuraSpa.Api.Data;
using AuraSpa.Api.DTOs;
using AuraSpa.Api.Hubs;
using AuraSpa.Api.Models;
using AuraSpa.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace AuraSpa.Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuroraController : ControllerBase
    {
        private readonly ApplicationDbContext _ctx;
        private readonly IHubContext<AuroraHub> _hub;
        private readonly IFaceIdService _faceId;

        public AuroraController(ApplicationDbContext ctx, IHubContext<AuroraHub> hub, IFaceIdService faceId)
        {
            _ctx = ctx; _hub = hub; _faceId = faceId;
        }

        private bool EsStaff =>
            User.Identity?.IsAuthenticated == true &&
            (User.IsInRole("Admin") || User.IsInRole("Cajero") || User.IsInRole("Especialista"));

        // ════════════════════════════════════════════════════════
        //  POST /api/aurora/mensaje — cerebro conversacional
        //  Anónimo (kiosko). Si llega JWT de staff, habilita
        //  intenciones de empleado (agenda, cabinas).
        // ════════════════════════════════════════════════════════
        [HttpPost("mensaje")]
        [AllowAnonymous]
        public async Task<ActionResult<AuroraRespuestaDto>> Mensaje([FromBody] AuroraMensajeDto dto)
        {
            var idioma = dto.Idioma == "en" ? "en" : "es";
            var t = (dto.Texto ?? string.Empty).ToLowerInvariant();
            var es = idioma == "es";

            // Frases como "quiero un masaje" o "agéndame" expresan intención de RESERVAR,
            // no una pregunta informativa — deben ganarle a los triggers de "servicios"/"precios".
            var tieneIntencionReserva = Contiene(t, "quiero", "quisiera", "necesito", "want", "need", "agendame", "agéndame")
                && !Contiene(t, "cancelo", "cancelar", "cancel");

            // ── Saludo ──────────────────────────────────────────
            if (Contiene(t, "hola", "hello", "hi ", "buenas", "buenos dias", "good morning"))
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "hola",
                    Texto = es
                        ? "¡Hola! Soy Aurora, la asistente de AuraSpa. Puedo contarte sobre nuestros servicios, precios y horarios, registrar tu llegada o ayudarte a agendar una cita."
                        : "Hello! I'm Aurora, the AuraSpa assistant. I can tell you about our services, prices and hours, check you in, or help you book an appointment."
                });

            // ── Cancelar cita ("cómo cancelo mi cita") ──────────
            if (Contiene(t, "cancelo", "cancelar", "cancel"))
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "cancelar",
                    Texto = es
                        ? "Puedes cancelar una cita desde **Mis Citas**, siempre que falten más de 72 horas para la hora agendada. Te llevo a esa pantalla."
                        : "You can cancel an appointment from **My Appointments**, as long as it's more than 72 hours before the scheduled time. I'll take you there.",
                    Accion = "mis-citas"
                });

            // ── Marcar cita como completada (Especialista) ──────
            if (Contiene(t, "marcar completada", "completar cita", "termine el servicio", "terminé el servicio", "mark completed", "mark as completed", "finish appointment"))
            {
                if (!EsStaff || !User.IsInRole("Especialista"))
                    return Ok(new AuroraRespuestaDto
                    {
                        Intencion = "completar_cita",
                        Texto = es ? "Marcar una cita como completada es una acción exclusiva de especialistas. ¿Te ayudo con algo más?"
                                   : "Marking an appointment as completed is specialist-only. Can I help with anything else?"
                    });
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "completar_cita",
                    Texto = es ? "Te llevo a tu agenda del día — ahí puedes seleccionar la cita y marcarla como Completada."
                               : "I'll take you to your daily schedule — you can select the appointment there and mark it Completed.",
                    Accion = "citas-especialista"
                });
            }

            // ── Mis citas (cliente) — distinto de la agenda diaria del staff ──
            if (!EsStaff && Contiene(t, "mis citas", "my appointments"))
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "mis_citas",
                    Texto = es ? "Te llevo a Mis Citas para que veas el estado de tus reservas."
                               : "I'll take you to My Appointments so you can see the status of your bookings.",
                    Accion = "mis-citas"
                });

            // ── Cuántas citas hay pendientes (Admin/Cajero/Especialista) ──
            if (EsStaff && Contiene(t, "cuantas citas", "cuántas citas", "citas pendientes", "how many appointments"))
            {
                var pendientesHoy = await _ctx.Citas.AsNoTracking()
                    .Where(c => c.Estado == "Pendiente" && c.FechaHora.Date == DateTime.Today)
                    .CountAsync();
                var pendientesTotal = await _ctx.Citas.AsNoTracking()
                    .Where(c => c.Estado == "Pendiente")
                    .CountAsync();
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "agenda",
                    Texto = es
                        ? $"Hay **{pendientesHoy} cita(s) pendiente(s) para hoy** y **{pendientesTotal} en total** esperando confirmación."
                        : $"There are **{pendientesHoy} pending appointment(s) for today** and **{pendientesTotal} total** awaiting confirmation."
                });
            }

            // ── Agenda del empleado / de un especialista específico (requiere staff) ──
            // Ojo: "agendar" (verbo, intención de reservar) contiene "agenda" como substring —
            // se excluye explícitamente para no interceptar las solicitudes de reserva de clientes.
            if ((Contiene(t, "agenda") && !t.Contains("agendar"))
                || Contiene(t, "mis citas", "my schedule", "appointments today", "citas para hoy", "citas de hoy")
                || (EsStaff && Contiene(t, "citas de", "citas del") && !t.Contains("agendar")))
            {
                if (!EsStaff)
                    return Ok(new AuroraRespuestaDto
                    {
                        Intencion = "agenda",
                        Texto = es ? "La agenda del día es información exclusiva del personal. ¿Te ayudo con algo más?"
                                   : "The daily schedule is staff-only information. Can I help you with anything else?"
                    });

                var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
                var usuario = await _ctx.Usuarios.AsNoTracking()
                    .FirstOrDefaultAsync(u => u.IdUsuario == idUsuario);

                var hoy = DateTime.Today; var man = hoy.AddDays(1);
                var query = _ctx.Citas.AsNoTracking()
                    .Include(c => c.Cliente).Include(c => c.Item).Include(c => c.Empleado)
                    .Where(c => c.FechaHora >= hoy && c.FechaHora < man && c.Estado != "Cancelada");

                // Admin/Cajero preguntando por un especialista específico por nombre ("citas de Nicole")
                string? nombreEspecialistaConsultado = null;
                if (User.IsInRole("Admin") || User.IsInRole("Cajero"))
                {
                    var especialistasTodos = await _ctx.Empleados.AsNoTracking()
                        .Where(e => e.Activo && e.TipoEmpleado == "Especialista")
                        .Select(e => new { e.IdEmpleado, e.Nombres })
                        .ToListAsync();
                    var especialistaMencionado = especialistasTodos.FirstOrDefault(e => t.Contains(SinAcentos(e.Nombres.ToLowerInvariant())));
                    if (especialistaMencionado != null)
                    {
                        query = query.Where(c => c.IdEmpleado == especialistaMencionado.IdEmpleado);
                        nombreEspecialistaConsultado = especialistaMencionado.Nombres;
                    }
                    // Sin especialista mencionado: Admin/Cajero ven la agenda completa del día (sin filtrar por sí mismos).
                }
                else if (usuario?.IdEmpleado != null)
                {
                    query = query.Where(c => c.IdEmpleado == usuario.IdEmpleado);
                }

                var citas = await query.OrderBy(c => c.FechaHora).Take(8).ToListAsync();
                var sujeto = nombreEspecialistaConsultado ?? (es ? "hoy" : "today");
                if (citas.Count == 0)
                    return Ok(new AuroraRespuestaDto
                    {
                        Intencion = "agenda",
                        Texto = nombreEspecialistaConsultado != null
                            ? (es ? $"{nombreEspecialistaConsultado} no tiene citas programadas para hoy." : $"{nombreEspecialistaConsultado} has no appointments scheduled for today.")
                            : (es ? "No hay citas programadas para hoy. ¡Día tranquilo!" : "There are no appointments scheduled for today. Quiet day!")
                    });

                var lineas = citas.Select(c =>
                    $"• {c.FechaHora:h:mm tt} — {c.Cliente?.Nombres} {c.Cliente?.Apellidos} ({c.Item?.Nombre})"
                    + (nombreEspecialistaConsultado == null && (User.IsInRole("Admin") || User.IsInRole("Cajero")) ? $" [{c.Empleado?.Nombres ?? "sin asignar"}]" : ""));
                var encabezado = nombreEspecialistaConsultado != null
                    ? (es ? $"{nombreEspecialistaConsultado} tiene **{citas.Count} cita(s)** hoy:\n" : $"{nombreEspecialistaConsultado} has **{citas.Count} appointment(s)** today:\n")
                    : (es ? $"Hoy hay **{citas.Count} cita(s)**:\n" : $"Today there are **{citas.Count} appointment(s)**:\n");
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "agenda",
                    Texto = encabezado + string.Join("\n", lineas)
                });
            }

            // ── Reportes (staff: Admin/Cajero) ──────────────────
            if (Contiene(t, "reporte", "reportes", "report", "reports", "ventas del mes", "ingresos de", "estadisticas"))
            {
                if (!EsStaff || !(User.IsInRole("Admin") || User.IsInRole("Cajero")))
                    return Ok(new AuroraRespuestaDto
                    {
                        Intencion = "reportes",
                        Texto = es ? "Los reportes son información exclusiva de administración y caja. ¿Te ayudo con algo más?"
                                   : "Reports are exclusive to admin and cashier staff. Can I help with anything else?"
                    });

                var mesesEs = new Dictionary<int,string> { {1,"enero"},{2,"febrero"},{3,"marzo"},{4,"abril"},{5,"mayo"},{6,"junio"},{7,"julio"},{8,"agosto"},{9,"septiembre"},{10,"octubre"},{11,"noviembre"},{12,"diciembre"} };
                var mesesEn = new Dictionary<int,string> { {1,"january"},{2,"february"},{3,"march"},{4,"april"},{5,"may"},{6,"june"},{7,"july"},{8,"august"},{9,"september"},{10,"october"},{11,"november"},{12,"december"} };
                var txtSinAcentos = SinAcentos(t);
                var mesPedido = 0;
                foreach (var kv in mesesEs) if (txtSinAcentos.Contains(SinAcentos(kv.Value))) { mesPedido = kv.Key; break; }
                if (mesPedido == 0) foreach (var kv in mesesEn) if (txtSinAcentos.Contains(kv.Value)) { mesPedido = kv.Key; break; }

                var anioPedido = DateTime.Today.Year;
                var mAnio = System.Text.RegularExpressions.Regex.Match(t, @"\b(20\d{2})\b");
                if (mAnio.Success) anioPedido = int.Parse(mAnio.Value);

                var mesFinal = mesPedido > 0 ? mesPedido : DateTime.Today.Month;

                var ventasMes = await _ctx.Ventas.AsNoTracking()
                    .Where(v => v.Fecha.Month == mesFinal && v.Fecha.Year == anioPedido && v.Estado != "Cancelada")
                    .ToListAsync();
                var citasCompletadas = await _ctx.Citas.AsNoTracking()
                    .Where(c => c.FechaHora.Month == mesFinal && c.FechaHora.Year == anioPedido && c.Estado == "Completada")
                    .CountAsync();

                var nombreMes = es ? mesesEs[mesFinal] : mesesEn[mesFinal];
                var totalVentas = ventasMes.Sum(v => v.Total);

                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "reportes",
                    Texto = ventasMes.Count == 0 && citasCompletadas == 0
                        ? (es ? $"No encontré ventas ni citas completadas registradas en {nombreMes} de {anioPedido}."
                              : $"I didn't find any sales or completed appointments recorded in {nombreMes} {anioPedido}.")
                        : (es ? $"En **{nombreMes} de {anioPedido}**: **{ventasMes.Count}** ventas por un total de **RD$ {totalVentas:N0}**, y **{citasCompletadas}** citas completadas. Te llevo al módulo de Reportes para el detalle completo."
                              : $"In **{nombreMes} {anioPedido}**: **{ventasMes.Count}** sales totaling **RD$ {totalVentas:N0}**, and **{citasCompletadas}** completed appointments. I'll take you to the Reports module for full detail."),
                    Accion = "reportes",
                    Datos = new Dictionary<string,string> { ["mes"] = mesFinal.ToString(), ["anio"] = anioPedido.ToString() }
                });
            }

            // ── Cabinas libres (staff) ──────────────────────────
            if (Contiene(t, "cabina", "cabin", "sala", "room"))
            {
                if (!EsStaff)
                    return Ok(new AuroraRespuestaDto
                    {
                        Intencion = "cabina",
                        Texto = es ? "La disponibilidad de cabinas la gestiona nuestro personal. ¿Quieres agendar una cita?"
                                   : "Cabin availability is managed by our staff. Would you like to book an appointment?",
                        Accion = "agendar"
                    });

                var ahora = DateTime.Now;
                var candidatas = await _ctx.Citas.AsNoTracking()
                    .Where(c => c.IdCabina != null && c.Estado != "Cancelada" && c.Estado != "Completada"
                             && c.FechaHora <= ahora && c.FechaHora >= ahora.AddHours(-6))
                    .Select(c => new { c.IdCabina, c.FechaHora, c.DuracionMinutos })
                    .ToListAsync();
                var ocupadas = candidatas
                    .Where(c => c.FechaHora.AddMinutes(c.DuracionMinutos ?? 60) > ahora)
                    .Select(c => c.IdCabina!.Value)
                    .ToList();
                var cabinas = await _ctx.Cabinas.AsNoTracking().Where(c => c.Activa).ToListAsync();
                var libres = cabinas.Where(c => !ocupadas.Contains(c.IdCabina)).Select(c => c.Nombre).ToList();

                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "cabina",
                    Texto = libres.Count == 0
                        ? (es ? "Todas las cabinas están ocupadas en este momento." : "All cabins are currently occupied.")
                        : (es ? $"Cabinas libres ahora mismo: **{string.Join(", ", libres)}**."
                              : $"Cabins available right now: **{string.Join(", ", libres)}**.")
                });
            }

            // ── Cajero: abrir caja / registrar venta / cotizaciones / CxC ──
            if (Contiene(t, "abrir caja", "open register", "open the register"))
                return Ok(RespuestaModuloStaff(es, "Cajero", "caja",
                    "Te llevo al módulo de Caja para que inicies tu turno.",
                    "I'll take you to the Caja module to open your shift."));

            if (Contiene(t, "registrar venta", "nueva venta", "hacer una venta", "register a sale", "new sale"))
                return Ok(RespuestaModuloStaff(es, "Cajero", "caja",
                    "Te llevo a la pestaña de Ventas en Caja.",
                    "I'll take you to the Sales tab in Caja."));

            if (Contiene(t, "cotizacion", "cotización", "quote", "quotation"))
                return Ok(RespuestaModuloStaff(es, "Cajero", "caja",
                    "Te llevo a la pestaña de Cotizaciones en Caja.",
                    "I'll take you to the Quotes tab in Caja."));

            if (Contiene(t, "cuentas por cobrar", "cuenta por cobrar", "cxc", "accounts receivable"))
                return Ok(RespuestaModuloStaff(es, "Cajero", "cuentas-por-cobrar",
                    "Te llevo al módulo de Cuentas por Cobrar.",
                    "I'll take you to the Accounts Receivable module."));

            // ── Admin: empleados / sucursales / usuarios / inventario ──
            if (Contiene(t, "empleados", "employees", "gestionar empleados", "manage employees"))
                return Ok(RespuestaModuloStaff(es, "Admin", "core",
                    "Te llevo a la gestión de empleados en el Core.",
                    "I'll take you to employee management in the Core."));

            if (Contiene(t, "sucursal", "sucursales", "branch", "branches"))
                return Ok(RespuestaModuloStaff(es, "Admin", "core",
                    "Te llevo a la gestión de sucursales en el Core.",
                    "I'll take you to branch management in the Core."));

            if (Contiene(t, "usuarios", "users", "gestionar usuarios", "manage users"))
                return Ok(RespuestaModuloStaff(es, "Admin", "core",
                    "Te llevo a la gestión de usuarios en el Core.",
                    "I'll take you to user management in the Core."));

            if (Contiene(t, "inventario", "inventory", "stock"))
                return Ok(RespuestaModuloStaff(es, "Admin", "core",
                    "Te llevo a la gestión de inventario en el Core.",
                    "I'll take you to inventory management in the Core."));

            // ── Reservar producto (cliente) ─────────────────────
            if (tieneIntencionReserva && Contiene(t, "producto", "product"))
            {
                var productos = await _ctx.ItemsCatalogo.AsNoTracking()
                    .Where(i => i.Activo && i.Tipo == "Producto").Select(i => i.Nombre).ToListAsync();
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "reservar_producto",
                    Texto = productos.Count == 0
                        ? (es ? "Por el momento no tenemos productos disponibles para reservar." : "We don't have any products available to reserve right now.")
                        : (es ? $"Tenemos **{productos.Count} productos** disponibles, como {string.Join(", ", productos.Take(3))}. Te llevo al catálogo para que elijas y los agregues al carrito."
                              : $"We have **{productos.Count} products** available, like {string.Join(", ", productos.Take(3))}. I'll take you to the catalog to add them to your cart."),
                    Accion = "catalogo"
                });
            }

            // ── Precios ─────────────────────────────────────────
            if (Contiene(t, "precio", "costo", "cuanto", "cuánto", "price", "cost", "how much"))
            {
                var servicios = await _ctx.ItemsCatalogo.AsNoTracking()
                    .Where(i => i.Activo && i.Tipo == "Servicio").ToListAsync();
                if (servicios.Count == 0)
                    return Ok(RespuestaDefault(es));
                var min = servicios.Min(s => s.PrecioBase);
                var max = servicios.Max(s => s.PrecioBase);
                var barato = servicios.OrderBy(s => s.PrecioBase).First().Nombre;
                var caro   = servicios.OrderByDescending(s => s.PrecioBase).First().Nombre;
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "precios",
                    Texto = es
                        ? $"Nuestros precios van desde **RD$ {min:N0}** ({barato}) hasta **RD$ {max:N0}** ({caro}). Puedes ver el catálogo completo en la sección de Servicios."
                        : $"Our prices range from **RD$ {min:N0}** ({barato}) to **RD$ {max:N0}** ({caro}). You can see the full catalog in our Services section."
                });
            }

            // ── Servicios ───────────────────────────────────────
            if (Contiene(t, "servicio", "service", "ofrecen", "offer", "facial", "masaje", "massage", "uñas", "nails", "pelo", "hair", "depila", "ceja", "brow") && !tieneIntencionReserva)
            {
                var categorias = await _ctx.CategoriasServicio.AsNoTracking()
                    .Select(c => c.Nombre).ToListAsync();
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "servicios",
                    Texto = categorias.Count == 0
                        ? (es ? "Ofrecemos servicios de spa y estética. Consulta el catálogo para el detalle." : "We offer spa and beauty services. Check the catalog for details.")
                        : (es ? $"Ofrecemos **{categorias.Count} categorías** de servicios: {string.Join(", ", categorias)}. Te llevo al módulo de servicios y productos para que los explores."
                              : $"We offer **{categorias.Count} service categories**: {string.Join(", ", categorias)}. Let me take you to the services and products module."),
                    Accion = "catalogo"
                });
            }

            // ── Agendar (con extracción de servicio/fecha/hora/especialista + disponibilidad real) ─
            if ((Contiene(t, "agendar", "agendame", "agéndame", "reservar", "cita", "book", "appointment", "reserve") && !Contiene(t, "cancelo", "cancelar", "cancel"))
                || (tieneIntencionReserva && Contiene(t, "masaje", "facial", "manicura", "pedicura", "depilacion", "depilación", "cejas", "ceja", "corte", "tinte", "unas", "uñas", "uña")))
            {
                var datos = new Dictionary<string, string>();
                var partes = new List<string>();

                // Servicio/categoría mencionada en la frase
                var items = await _ctx.ItemsCatalogo.AsNoTracking()
                    .Where(i => i.Activo && i.Tipo == "Servicio")
                    .Select(i => new { i.IdItem, i.Nombre })
                    .ToListAsync();
                var item = items.FirstOrDefault(i => t.Contains(SinAcentos(i.Nombre.ToLowerInvariant())));
                if (item != null)
                {
                    datos["itemId"] = item.IdItem.ToString();
                    partes.Add(item.Nombre);
                }
                else
                {
                    var categorias = await _ctx.CategoriasServicio.AsNoTracking()
                        .Select(c => c.Nombre).ToListAsync();
                    var cat = categorias.FirstOrDefault(c =>
                        t.Contains(SinAcentos(c.ToLowerInvariant())) ||
                        SinAcentos(c.ToLowerInvariant()).TrimEnd('s') is var raiz && raiz.Length > 3 && t.Contains(raiz));
                    if (cat != null) { datos["categoria"] = cat; partes.Add(cat); }
                }

                // Especialista preferido mencionado por nombre
                var especialistas = await _ctx.Empleados.AsNoTracking()
                    .Where(e => e.Activo && e.TipoEmpleado == "Especialista")
                    .Select(e => new { e.IdEmpleado, e.Nombres, e.Apellidos })
                    .ToListAsync();
                var especialista = especialistas.FirstOrDefault(e => t.Contains(SinAcentos(e.Nombres.ToLowerInvariant())));
                if (especialista != null)
                {
                    datos["idEmpleado"] = especialista.IdEmpleado.ToString();
                    partes.Add(es ? $"con {especialista.Nombres}" : $"with {especialista.Nombres}");
                }

                // Fecha: hoy / mañana / pasado mañana / día de la semana
                var fecha = ExtraerFecha(t);
                if (fecha != null)
                    partes.Add(es ? $"el {FormatearFechaHabla(fecha.Value, true)}" : $"on {FormatearFechaHabla(fecha.Value, false)}");

                // Hora: "a las 4", "4:30 pm", "at 4 pm"…
                var hora = ExtraerHora(t);
                if (hora != null)
                    partes.Add(es ? $"a las {hora}" : $"at {hora}");

                // ── Día no laborable: verificar antes de prometer nada ──
                if (fecha != null)
                {
                    var bloqueado = await _ctx.DiasBloqueados.AsNoTracking()
                        .FirstOrDefaultAsync(d => d.Activo && d.Fecha.Date == fecha.Value.Date);
                    if (bloqueado != null)
                        return Ok(new AuroraRespuestaDto
                        {
                            Intencion = "agendar",
                            Texto = es
                                ? $"Esa fecha no está disponible ({bloqueado.Motivo}). ¿Te gustaría elegir otra fecha?"
                                : $"That date isn't available ({bloqueado.Motivo}). Would you like to choose another date?",
                            Datos = datos.Count > 0 ? datos : null
                        });
                }

                // ── Disponibilidad del especialista ese día (mismos horarios que Agendamiento.tsx) ──
                // Domingos: horario reducido de 10:00 AM a 4:00 PM.
                var esDomingoAgendado = fecha != null && fecha.Value.DayOfWeek == DayOfWeek.Sunday;
                var horasLaborables = esDomingoAgendado
                    ? new[] { "10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00","15:30","16:00" }
                    : new[] { "09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00","15:30","16:00","16:30","17:00" };
                var avisoDomingo = esDomingoAgendado
                    ? (es ? " Recuerda que los domingos atendemos de 10:00 AM a 4:00 PM." : " Keep in mind Sundays we're open 10:00 AM to 4:00 PM.")
                    : "";
                // Hora fuera del horario reducido de domingo: avisar y sugerir horas válidas antes de seguir.
                if (esDomingoAgendado && hora != null && !horasLaborables.Contains(hora))
                {
                    var sugeridasDomingo = string.Join(", ", horasLaborables.Take(3));
                    return Ok(new AuroraRespuestaDto
                    {
                        Intencion = "agendar",
                        Texto = es
                            ? $"Los domingos atendemos de 10:00 AM a 4:00 PM, así que las {hora} no está disponible. ¿Qué hora prefieres? Por ejemplo: {sugeridasDomingo}."
                            : $"On Sundays we're open 10:00 AM to 4:00 PM, so {hora} isn't available. What time would you prefer? For example: {sugeridasDomingo}.",
                        Datos = datos.Count > 0 ? datos : null
                    });
                }

                if (fecha != null && especialista != null)
                {
                    var ocupadas = await _ctx.Citas.AsNoTracking()
                        .Where(c => c.IdEmpleado == especialista.IdEmpleado && c.FechaHora.Date == fecha.Value.Date
                                 && (c.Estado == "Pendiente" || c.Estado == "Confirmada"))
                        .Select(c => c.FechaHora.ToString("HH:mm"))
                        .ToListAsync();
                    var libres = horasLaborables.Except(ocupadas).ToList();

                    if (hora != null && ocupadas.Contains(hora))
                    {
                        var sugeridas = string.Join(", ", libres.Take(3));
                        return Ok(new AuroraRespuestaDto
                        {
                            Intencion = "agendar",
                            Texto = libres.Count > 0
                                ? (es ? $"{especialista.Nombres} ya tiene una cita a las {hora} el {FormatearFechaHabla(fecha.Value, true)}. Horas disponibles ese día: {sugeridas}. ¿Cuál prefieres?"
                                      : $"{especialista.Nombres} already has an appointment at {hora} on {FormatearFechaHabla(fecha.Value, false)}. Available times that day: {sugeridas}. Which do you prefer?")
                                : (es ? $"{especialista.Nombres} no tiene horas libres el {FormatearFechaHabla(fecha.Value, true)}. ¿Quieres intentar con otra fecha o especialista?"
                                      : $"{especialista.Nombres} has no free slots on {FormatearFechaHabla(fecha.Value, false)}. Would you like to try another date or specialist?"),
                            Datos = datos.Count > 0 ? datos : null
                        });
                    }
                }

                if (hora != null) datos["hora"] = hora;
                if (fecha != null) datos["fecha"] = fecha.Value.ToString("yyyy-MM-dd");

                var resumen = partes.Count > 0 ? string.Join(", ", partes) : null;
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "agendar",
                    Texto = (resumen != null
                        ? (es ? $"¡Perfecto! Anoté: {resumen}. Te llevo al módulo de agendamiento con estos datos precargados para que los confirmes y completes lo que falte."
                              : $"Perfect! I noted: {resumen}. I'll take you to the booking module with this pre-filled so you can confirm and complete the rest.")
                        : (es ? "¡Perfecto! Te llevo al módulo de agendamiento para que elijas servicio, fecha y hora."
                              : "Perfect! I'll take you to the booking module so you can choose a service, date and time.")) + avisoDomingo,
                    Accion = "agendar",
                    Datos = datos.Count > 0 ? datos : null
                });
            }

            // ── Check-in / llegada ──────────────────────────────
            if (Contiene(t, "llegue", "llegué", "check in", "checkin", "check-in", "estoy aqui", "estoy aquí", "i'm here", "arrived", "registrar llegada"))
            {
                if (EsStaff)
                    return Ok(new AuroraRespuestaDto
                    {
                        Intencion = "checkin",
                        Texto = es ? "Te abro el módulo de verificación de llegada de clientes."
                                   : "Opening the client arrival verification module.",
                        Accion = "checkin"
                    });
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "checkin",
                    Texto = es ? "¡Bienvenida! Acércate a recepción: nuestro personal verificará tu llegada y tu cita en un momento."
                               : "Welcome! Please approach the reception desk: our staff will verify your arrival and appointment shortly."
                });
            }

            // ── Horarios ────────────────────────────────────────
            if (Contiene(t, "horario", "hora", "schedule", "hours", "open", "abren", "cierran"))
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "horarios",
                    Texto = es ? "Atendemos de **lunes a sábado de 9:00 AM a 7:00 PM** y **domingos de 10:00 AM a 4:00 PM**."
                               : "We're open **Monday to Saturday 9:00 AM to 7:00 PM** and **Sundays 10:00 AM to 4:00 PM**."
                });

            // ── Ubicación ───────────────────────────────────────
            if (Contiene(t, "ubicacion", "ubicación", "direccion", "dirección", "donde", "dónde", "location", "address", "where"))
            {
                var sucursales = await _ctx.Sucursales.AsNoTracking()
                    .Where(s => s.Activa).Select(s => $"**{s.Nombre}** ({s.Direccion})").ToListAsync();
                return Ok(new AuroraRespuestaDto
                {
                    Intencion = "ubicacion",
                    Texto = sucursales.Count == 0
                        ? (es ? "Estamos en Santo Domingo. Consulta recepción para más detalles." : "We're in Santo Domingo. Ask reception for details.")
                        : (es ? $"Nos encuentras en: {string.Join(" y ", sucursales)}."
                              : $"You can find us at: {string.Join(" and ", sucursales)}.")
                });
            }

            return Ok(RespuestaDefault(es));
        }

        // ════════════════════════════════════════════════════════
        //  POST /api/aurora/checkin — interrupción biométrica
        //  Identifica a la persona (mock/Azure) y notifica a
        //  recepción por SignalR + tabla Notificacion.
        // ════════════════════════════════════════════════════════
        [HttpPost("checkin")]
        [AllowAnonymous]
        public async Task<ActionResult<AuroraCheckinRespuestaDto>> Checkin([FromBody] AuroraCheckinDto dto)
        {
            // Face ID es exclusivo del Admin (acceso al Core): la llegada de
            // clientes se verifica por documento (cédula).
            var res = await _faceId.IdentificarAsync(null, dto.Documento);

            if (!res.Reconocido)
                return Ok(new AuroraCheckinRespuestaDto
                {
                    Reconocido = false,
                    Mensaje = "No pude verificar tu identidad. Puedes intentar de nuevo o escribir tu número de documento."
                });

            // ── Empleado: acceso administrativo ─────────────────
            if (res.TipoPersona == "empleado")
            {
                var esAdmin = res.TipoEmpleado == "Admin";
                await _hub.Clients.Group("recepcion").SendAsync("AccesoEmpleado", new
                {
                    nombre = res.Nombre,
                    tipoEmpleado = res.TipoEmpleado,
                    mensaje = $"🔓 {res.Nombre} ({res.TipoEmpleado}) verificado en el kiosko.",
                    hora = DateTime.Now.ToString("h:mm tt")
                });

                return Ok(new AuroraCheckinRespuestaDto
                {
                    Reconocido = true, TipoPersona = "empleado",
                    Nombre = res.Nombre, AccesoAdmin = esAdmin,
                    Mensaje = esAdmin
                        ? $"Bienvenida, {res.Nombre}. Acceso administrativo verificado."
                        : $"Bienvenida, {res.Nombre}. Identidad de personal verificada."
                });
            }

            // ── Cliente: buscar cita de hoy y alertar recepción ─
            var hoy = DateTime.Today; var man = hoy.AddDays(1);
            var cita = await _ctx.Citas.AsNoTracking()
                .Include(c => c.Item)
                .Where(c => c.IdCliente == res.IdPersona
                         && c.FechaHora >= hoy && c.FechaHora < man
                         && c.Estado != "Cancelada" && c.Estado != "Completada")
                .OrderBy(c => c.FechaHora)
                .FirstOrDefaultAsync();

            var horaCita = cita?.FechaHora.ToString("h:mm tt");
            var alerta = cita != null
                ? $"🔔 Acaba de entrar {res.Nombre}, viene a su cita de las {horaCita} ({cita.Item?.Nombre})."
                : $"🔔 Acaba de entrar {res.Nombre}. No tiene cita registrada para hoy.";

            // Notificación persistente para todo el staff activo
            var idsStaff = await _ctx.Usuarios.AsNoTracking()
                .Include(u => u.Perfil)
                .Where(u => u.Activo && u.Perfil != null && u.Perfil.Nombre != "Cliente")
                .Select(u => u.IdUsuario)
                .ToListAsync();
            foreach (var idU in idsStaff)
                _ctx.Notificaciones.Add(new Notificacion
                {
                    IdUsuario = idU, IdCita = cita?.IdCita,
                    Tipo = "Cita", Canal = "Sistema",
                    Titulo = "Llegada de cliente",
                    Mensaje = alerta
                });
            await _ctx.SaveChangesAsync();

            // Alerta en tiempo real
            await _hub.Clients.Group("recepcion").SendAsync("LlegadaCliente", new
            {
                nombre = res.Nombre,
                servicio = cita?.Item?.Nombre,
                hora = horaCita,
                mensaje = alerta
            });

            return Ok(new AuroraCheckinRespuestaDto
            {
                Reconocido = true, TipoPersona = "cliente",
                Nombre = res.Nombre, ProximaCita = horaCita,
                // Mensaje dirigido al EMPLEADO que hace la verificación (no al cliente):
                // este endpoint lo usa recepción/staff desde CheckinCliente.tsx.
                Mensaje = cita != null
                    ? $"Cliente identificado: {res.Nombre}. Tiene cita hoy a las {horaCita}. Recepción ya fue notificada de su llegada. ✨"
                    : $"Cliente identificado: {res.Nombre}. No tiene cita registrada para hoy. Recepción fue notificada de su llegada."
            });
        }

        // ── Helpers ─────────────────────────────────────────────
        private static bool Contiene(string texto, params string[] palabras)
            => palabras.Any(texto.Contains);

        // ════════════════════════════════════════════════════════
        //  ROSTRO — enrolamiento por descriptores (sin fotos)
        // ════════════════════════════════════════════════════════

        // GET /api/aurora/rostro/estado — ¿el usuario actual ya registró su rostro?
        [HttpGet("rostro/estado")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> RostroEstado()
        {
            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var reg = await _ctx.RostrosDescriptores.AsNoTracking()
                .FirstOrDefaultAsync(r => r.IdUsuario == idUsuario && r.Activo);
            return Ok(new { registrado = reg != null, fecha = reg?.FechaRegistro });
        }

        // POST /api/aurora/rostro/registrar — guarda/actualiza el descriptor del usuario actual
        [HttpPost("rostro/registrar")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> RostroRegistrar([FromBody] RostroRegistroDto dto)
        {
            if (dto.Descriptor is not { Length: 128 })
                return BadRequest(new { mensaje = "Descriptor inválido: se esperan 128 dimensiones." });

            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var json = System.Text.Json.JsonSerializer.Serialize(dto.Descriptor);

            var existente = await _ctx.RostrosDescriptores
                .FirstOrDefaultAsync(r => r.IdUsuario == idUsuario);
            if (existente != null)
            {
                existente.Descriptor = json;
                existente.FechaRegistro = DateTime.Now;
                existente.Activo = true;
            }
            else
            {
                _ctx.RostrosDescriptores.Add(new RostroDescriptor
                {
                    IdUsuario = idUsuario, Descriptor = json
                });
            }
            await _ctx.SaveChangesAsync();
            return Ok(new { mensaje = "Rostro registrado correctamente. Solo se almacenó el vector matemático, ninguna imagen." });
        }

        // DELETE /api/aurora/rostro — elimina el registro facial del usuario actual
        [HttpDelete("rostro")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> RostroEliminar()
        {
            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var reg = await _ctx.RostrosDescriptores
                .FirstOrDefaultAsync(r => r.IdUsuario == idUsuario);
            if (reg == null) return NotFound();
            _ctx.RostrosDescriptores.Remove(reg);
            await _ctx.SaveChangesAsync();
            return Ok(new { mensaje = "Registro facial eliminado." });
        }

        // ════════════════════════════════════════════════════════
        //  POST /api/aurora/verificar-admin — 2º factor del Core
        //  Compara el rostro capturado SOLO contra el descriptor
        //  del propio admin autenticado (verificación 1:1).
        // ════════════════════════════════════════════════════════
        [HttpPost("verificar-admin")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> VerificarAdmin([FromBody] RostroRegistroDto dto)
        {
            if (dto.Descriptor is not { Length: 128 })
                return BadRequest(new { verificado = false, mensaje = "Descriptor inválido." });

            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var reg = await _ctx.RostrosDescriptores.AsNoTracking()
                .FirstOrDefaultAsync(r => r.IdUsuario == idUsuario && r.Activo);

            if (reg == null)
                return Ok(new { verificado = false, sinRegistro = true, mensaje = "No tienes un rostro registrado. Puedes registrarlo desde tu perfil." });

            float[]? almacenado;
            try { almacenado = System.Text.Json.JsonSerializer.Deserialize<float[]>(reg.Descriptor); }
            catch { almacenado = null; }
            if (almacenado is not { Length: 128 })
                return Ok(new { verificado = false, sinRegistro = true, mensaje = "Registro facial corrupto. Regístralo de nuevo desde tu perfil." });

            double suma = 0;
            for (var i = 0; i < 128; i++) { double d = dto.Descriptor[i] - almacenado[i]; suma += d * d; }
            var distancia = Math.Sqrt(suma);
            var ok = distancia < 0.55;

            if (ok)
                await _hub.Clients.Group("recepcion").SendAsync("AccesoEmpleado", new
                {
                    nombre = User.FindFirstValue(ClaimTypes.Name),
                    tipoEmpleado = "Admin",
                    mensaje = $"🔓 Acceso al Core verificado por rostro: {User.FindFirstValue(ClaimTypes.Name)}.",
                    hora = DateTime.Now.ToString("h:mm tt")
                });

            return Ok(new
            {
                verificado = ok,
                mensaje = ok ? "Identidad verificada. Bienvenida al Core."
                             : "El rostro no coincide con el registrado para tu cuenta."
            });
        }

        /// <summary>Fecha en formato natural para que el TTS no la lea como "17 barra 07".</summary>
        private static string FormatearFechaHabla(DateTime fecha, bool es)
            => es
                ? fecha.ToString("d 'de' MMMM", new System.Globalization.CultureInfo("es-DO"))
                : fecha.ToString("MMMM d", new System.Globalization.CultureInfo("en-US"));

        /// <summary>Respuesta de navegación a un módulo exclusivo de un rol de staff (o Admin).</summary>
        private AuroraRespuestaDto RespuestaModuloStaff(bool es, string rolRequerido, string accion, string textoEs, string textoEn)
        {
            var autorizado = EsStaff && (User.IsInRole(rolRequerido) || User.IsInRole("Admin"));
            if (!autorizado)
                return new AuroraRespuestaDto
                {
                    Intencion = "modulo_staff",
                    Texto = es ? "Esa función es exclusiva del personal correspondiente. ¿Te ayudo con algo más?"
                               : "That feature is staff-only. Can I help you with anything else?"
                };
            return new AuroraRespuestaDto
            {
                Intencion = "modulo_staff",
                Texto = es ? textoEs : textoEn,
                Accion = accion
            };
        }

        private static string SinAcentos(string txt)
        {
            var norm = txt.Normalize(System.Text.NormalizationForm.FormD);
            var sb = new System.Text.StringBuilder();
            foreach (var c in norm)
                if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark)
                    sb.Append(c);
            return sb.ToString();
        }

        /// <summary>Extrae una fecha de expresiones comunes (es/en).</summary>
        private static DateTime? ExtraerFecha(string t)
        {
            var hoy = DateTime.Today;
            t = SinAcentos(t);
            if (t.Contains("pasado manana") || t.Contains("day after tomorrow")) return hoy.AddDays(2);
            // "manana" como fecha, no "de la manana" (franja horaria)
            if ((t.Contains("manana") && !t.Contains("de la manana") && !t.Contains("por la manana")) || t.Contains("tomorrow"))
                return hoy.AddDays(1);
            if (t.Contains("hoy") || t.Contains("today")) return hoy;

            var dias = new (string[] nombres, DayOfWeek dia)[]
            {
                (new[]{"lunes","monday"}, DayOfWeek.Monday),
                (new[]{"martes","tuesday"}, DayOfWeek.Tuesday),
                (new[]{"miercoles","wednesday"}, DayOfWeek.Wednesday),
                (new[]{"jueves","thursday"}, DayOfWeek.Thursday),
                (new[]{"viernes","friday"}, DayOfWeek.Friday),
                (new[]{"sabado","saturday"}, DayOfWeek.Saturday),
                (new[]{"domingo","sunday"}, DayOfWeek.Sunday),
            };
            foreach (var (nombres, dia) in dias)
                if (nombres.Any(t.Contains))
                {
                    var delta = ((int)dia - (int)hoy.DayOfWeek + 7) % 7;
                    return hoy.AddDays(delta == 0 ? 7 : delta);
                }

            // Fecha explícita: "22 de julio", "el 5 de agosto", "julio 22"
            var meses = new (string nombre, int mes)[]
            {
                ("enero",1), ("febrero",2), ("marzo",3), ("abril",4), ("mayo",5), ("junio",6),
                ("julio",7), ("agosto",8), ("septiembre",9), ("setiembre",9), ("octubre",10), ("noviembre",11), ("diciembre",12),
                ("january",1), ("february",2), ("march",3), ("april",4), ("may",5), ("june",6),
                ("july",7), ("august",8), ("september",9), ("october",10), ("november",11), ("december",12),
            };
            foreach (var (nombreMes, numMes) in meses)
            {
                if (!t.Contains(nombreMes)) continue;
                var m1 = System.Text.RegularExpressions.Regex.Match(t, $@"(\d{{1,2}})\s*(?:de\s+)?{nombreMes}");
                var m2 = m1.Success ? m1 : System.Text.RegularExpressions.Regex.Match(t, $@"{nombreMes}\s+(\d{{1,2}})");
                if (!m2.Success) continue;
                var dia2 = int.Parse(m2.Groups[1].Value);
                if (dia2 < 1 || dia2 > 31) continue;
                var anio = hoy.Year;
                try
                {
                    var fechaCandidata = new DateTime(anio, numMes, dia2);
                    if (fechaCandidata < hoy) fechaCandidata = fechaCandidata.AddYears(1); // fecha ya pasada este año → próximo año
                    return fechaCandidata;
                }
                catch (ArgumentOutOfRangeException) { return null; }
            }
            return null;
        }

        /// <summary>Extrae una hora ("a las 4", "4:30 pm") y la ajusta al slot más cercano (09:00–17:00, cada 30 min).</summary>
        private static string? ExtraerHora(string t)
        {
            t = SinAcentos(t);
            // Pase 1: número precedido por "a las"/"at" · Pase 2: número seguido de am/pm/franja
            var m = System.Text.RegularExpressions.Regex.Match(t,
                @"(?:a las?|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|de la tarde|de la noche|de la manana|por la manana)?",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (!m.Success)
                m = System.Text.RegularExpressions.Regex.Match(t,
                    @"(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|de la tarde|de la noche|de la manana|por la manana)",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (!m.Success) return null;

            var h = int.Parse(m.Groups[1].Value);
            var min = m.Groups[2].Success ? int.Parse(m.Groups[2].Value) : 0;
            var sufijo = m.Groups[3].Value;
            var esPm = sufijo.Contains("pm") || sufijo.Contains("p.m") || sufijo.Contains("tarde") || sufijo.Contains("noche");
            var esAm = sufijo.Contains("am") || sufijo.Contains("a.m") || sufijo.Contains("manana");

            if (h < 1 || h > 23 || min > 59) return null;
            if (esPm && h < 12) h += 12;
            else if (!esAm && !esPm && h >= 1 && h <= 6) h += 12; // "a las 4" en un spa → 4 PM

            // Ajustar al slot de media hora dentro del horario laborable
            min = min < 15 ? 0 : min < 45 ? 30 : 0;
            if (min == 0 && m.Groups[2].Success && int.Parse(m.Groups[2].Value) >= 45) h += 1;
            if (h < 9) h = 9;
            if (h > 17) h = 17;
            if (h == 13) h = 14; // hora de almuerzo sin slots
            return $"{h:00}:{min:00}";
        }

        /// <summary>Respuesta por defecto adaptada al rol del usuario autenticado (o al perfil de Cliente/anónimo).</summary>
        private AuroraRespuestaDto RespuestaDefault(bool es)
        {
            string texto;
            if (User.IsInRole("Admin"))
                texto = es
                    ? "No estoy segura de haber entendido. Como administradora, puedo ayudarte con: **gestión de empleados**, **sucursales**, **usuarios**, **inventario**, **reportes** o **tu agenda**."
                    : "I'm not sure I understood. As an administrator, I can help you with: **employee management**, **branches**, **users**, **inventory**, **reports**, or **your schedule**.";
            else if (User.IsInRole("Cajero"))
                texto = es
                    ? "No estoy segura de haber entendido. Puedo ayudarte con: **abrir caja**, **registrar una venta**, **cotizaciones**, **cuentas por cobrar** o **verificar la llegada de un cliente**."
                    : "I'm not sure I understood. I can help you with: **opening the register**, **registering a sale**, **quotes**, **accounts receivable**, or **verifying a client's arrival**.";
            else if (User.IsInRole("Especialista"))
                texto = es
                    ? "No estoy segura de haber entendido. Puedo ayudarte con: **tus citas de hoy**, **marcar una cita como completada** o **ver tu agenda**."
                    : "I'm not sure I understood. I can help you with: **today's appointments**, **marking an appointment as completed**, or **viewing your schedule**.";
            else
                texto = es
                    ? "No estoy segura de haber entendido. Puedo ayudarte con: **catálogo**, **agendar una cita**, **mis citas**, **reservar productos**, **horarios** o **ubicación**."
                    : "I'm not sure I understood. I can help you with: **catalog**, **booking an appointment**, **my appointments**, **reserving products**, **hours**, or **location**.";
            return new AuroraRespuestaDto { Intencion = "default", Texto = texto };
        }
    }
}
