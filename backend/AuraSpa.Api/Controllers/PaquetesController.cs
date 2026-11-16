using System.Security.Claims;
using AuraSpa.Api.Data;
using AuraSpa.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuraSpa.Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class PaquetesController : ControllerBase
    {
        private readonly ApplicationDbContext _ctx;
        public PaquetesController(ApplicationDbContext ctx) => _ctx = ctx;

        // GET /api/paquetes/mis-clientes — paquetes activos de los clientes que ha atendido el especialista
        [HttpGet("mis-clientes")]
        [Authorize(Roles = "Especialista")]
        public async Task<IActionResult> GetMisClientes()
        {
            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var usuario = await _ctx.Usuarios.AsNoTracking().FirstOrDefaultAsync(u => u.IdUsuario == idUsuario);
            if (usuario?.IdEmpleado == null) return Ok(new List<object>());

            var idsClientesAtendidos = await _ctx.Citas.AsNoTracking()
                .Where(c => c.IdEmpleado == usuario.IdEmpleado.Value)
                .Select(c => c.IdCliente)
                .Distinct()
                .ToListAsync();

            var paquetes = await _ctx.ClientesPaquetes
                .Include(cp => cp.Cliente)
                .Include(cp => cp.Paquete)
                .Where(cp => idsClientesAtendidos.Contains(cp.IdCliente) && cp.Estado == "Activo")
                .OrderBy(cp => cp.Cliente!.Nombres)
                .Select(cp => new
                {
                    cp.IdClientePaquete,
                    idCliente     = cp.IdCliente,
                    cliente       = cp.Cliente != null ? cp.Cliente.Nombres + " " + cp.Cliente.Apellidos : "Cliente",
                    paquete       = cp.Paquete != null ? cp.Paquete.Nombre : "Paquete",
                    cp.SesionesTotales,
                    cp.SesionesRestantes,
                    cp.FechaAdquisicion,
                    cp.FechaExpiracion,
                    cp.Estado
                })
                .ToListAsync();

            return Ok(paquetes);
        }

        // PUT /api/paquetes/{id}/registrar-sesion — el especialista descuenta una sesión de un paquete
        [HttpPut("{id}/registrar-sesion")]
        [Authorize(Roles = "Especialista")]
        public async Task<IActionResult> RegistrarSesion(long id)
        {
            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var usuario = await _ctx.Usuarios.AsNoTracking().FirstOrDefaultAsync(u => u.IdUsuario == idUsuario);
            if (usuario?.IdEmpleado == null) return Forbid();

            var cp = await _ctx.ClientesPaquetes.FindAsync(id);
            if (cp == null) return NotFound("Paquete de cliente no encontrado.");

            // El especialista solo puede registrar sesiones de clientes que ha atendido.
            var haAtendidoAlCliente = await _ctx.Citas.AsNoTracking()
                .AnyAsync(c => c.IdEmpleado == usuario.IdEmpleado.Value && c.IdCliente == cp.IdCliente);
            if (!haAtendidoAlCliente) return Forbid();

            if (cp.Estado != "Activo")
                return BadRequest("Este paquete ya no está activo.");
            if (cp.SesionesRestantes <= 0)
                return BadRequest("Este paquete no tiene sesiones restantes.");

            cp.SesionesRestantes -= 1;
            if (cp.SesionesRestantes == 0) cp.Estado = "Consumido";
            await _ctx.SaveChangesAsync();

            return Ok(new { cp.IdClientePaquete, cp.SesionesRestantes, cp.Estado });
        }

        // GET /api/paquetes/mis-clientes-atendidos — clientes que el especialista ha atendido
        // (para poder asignarles un paquete nuevo, aunque todavía no tengan ninguno)
        [HttpGet("mis-clientes-atendidos")]
        [Authorize(Roles = "Especialista")]
        public async Task<IActionResult> GetMisClientesAtendidos()
        {
            var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var usuario = await _ctx.Usuarios.AsNoTracking().FirstOrDefaultAsync(u => u.IdUsuario == idUsuario);
            if (usuario?.IdEmpleado == null) return Ok(new List<object>());

            var clientes = await _ctx.Citas.AsNoTracking()
                .Where(c => c.IdEmpleado == usuario.IdEmpleado.Value)
                .Select(c => c.IdCliente)
                .Distinct()
                .Join(_ctx.Clientes, idCliente => idCliente, cl => cl.IdCliente,
                    (idCliente, cl) => new { cl.IdCliente, nombre = cl.Nombres + " " + cl.Apellidos })
                .OrderBy(c => c.nombre)
                .ToListAsync();

            return Ok(clientes);
        }

        // GET /api/paquetes/catalogo — catálogo de paquetes activos disponibles para asignar
        [HttpGet("catalogo")]
        [Authorize(Roles = "Admin,Especialista")]
        public async Task<IActionResult> GetCatalogoPaquetes()
            => Ok(await _ctx.Paquetes.AsNoTracking().Where(p => p.Activo)
                .OrderBy(p => p.Nombre)
                .Select(p => new { p.IdPaquete, p.Nombre, p.Categoria, p.Precio, p.Sesiones })
                .ToListAsync());

        // POST /api/paquetes/asignar — Admin asigna a cualquier cliente; Especialista solo
        // a clientes que ha atendido (misma restricción que registrar-sesion).
        [HttpPost("asignar")]
        [Authorize(Roles = "Admin,Especialista")]
        public async Task<IActionResult> AsignarPaquete([FromBody] AsignarPaqueteDto dto)
        {
            if (User.IsInRole("Especialista"))
            {
                var idUsuario = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
                var usuario = await _ctx.Usuarios.AsNoTracking().FirstOrDefaultAsync(u => u.IdUsuario == idUsuario);
                if (usuario?.IdEmpleado == null) return Forbid();

                var haAtendidoAlCliente = await _ctx.Citas.AsNoTracking()
                    .AnyAsync(c => c.IdEmpleado == usuario.IdEmpleado.Value && c.IdCliente == dto.IdCliente);
                if (!haAtendidoAlCliente) return Forbid();
            }

            var cliente = await _ctx.Clientes.FindAsync(dto.IdCliente);
            if (cliente == null) return NotFound("Cliente no encontrado.");

            var paquete = await _ctx.Paquetes.FindAsync(dto.IdPaquete);
            if (paquete == null) return NotFound("Paquete no encontrado.");

            var cp = new ClientePaquete
            {
                IdCliente         = dto.IdCliente,
                IdPaquete         = dto.IdPaquete,
                SesionesTotales   = paquete.Sesiones,
                SesionesRestantes = paquete.Sesiones,
                FechaAdquisicion  = DateTime.Now,
                FechaExpiracion   = dto.FechaExpiracion,
                Estado            = "Activo"
            };
            _ctx.ClientesPaquetes.Add(cp);
            await _ctx.SaveChangesAsync();

            return Ok(new { cp.IdClientePaquete, cp.SesionesTotales, cp.SesionesRestantes, cp.Estado });
        }

        // GET /api/paquetes/cliente/{idCliente} — historial de paquetes de un cliente (Admin/Cajero)
        [HttpGet("cliente/{idCliente}")]
        [Authorize(Roles = "Admin,Cajero")]
        public async Task<IActionResult> GetPaquetesDeCliente(long idCliente)
        {
            var paquetes = await _ctx.ClientesPaquetes
                .Include(cp => cp.Paquete)
                .Where(cp => cp.IdCliente == idCliente)
                .OrderByDescending(cp => cp.FechaAdquisicion)
                .Select(cp => new
                {
                    cp.IdClientePaquete,
                    paquete = cp.Paquete != null ? cp.Paquete.Nombre : "Paquete",
                    cp.SesionesTotales,
                    cp.SesionesRestantes,
                    cp.FechaAdquisicion,
                    cp.FechaExpiracion,
                    cp.Estado
                })
                .ToListAsync();

            return Ok(paquetes);
        }
    }

    public class AsignarPaqueteDto
    {
        public long      IdCliente       { get; set; }
        public long      IdPaquete       { get; set; }
        public DateTime? FechaExpiracion { get; set; }
    }
}
