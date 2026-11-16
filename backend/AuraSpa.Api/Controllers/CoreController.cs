using System.Security.Claims;
using AuraSpa.Api.Data;
using AuraSpa.Api.DTOs;
using AuraSpa.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuraSpa.Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Admin")]
    public class CoreController : ControllerBase
    {
        private readonly ApplicationDbContext _ctx;
        public CoreController(ApplicationDbContext ctx) => _ctx = ctx;

        // ── SUCURSALES ──────────────────────────────────────────
        // GET /api/core/sucursales
        [HttpGet("sucursales")]
        public async Task<IActionResult> GetSucursales()
            => Ok(await _ctx.Sucursales
                .Where(s => s.Activa)
                .OrderBy(s => s.Nombre)
                .Select(s => new { id = s.IdSucursal, s.Nombre, s.Direccion, s.Telefono, activo = s.Activa })
                .ToListAsync());

        // POST /api/core/sucursales
        [HttpPost("sucursales")]
        public async Task<IActionResult> CrearSucursal([FromBody] SucursalDto dto)
        {
            var sucursal = new Sucursal { Nombre = dto.Nombre, Direccion = dto.Direccion, Telefono = dto.Telefono };
            _ctx.Sucursales.Add(sucursal);
            await _ctx.SaveChangesAsync();
            return Ok(new { id = sucursal.IdSucursal, sucursal.Nombre, sucursal.Direccion, sucursal.Telefono, activo = sucursal.Activa });
        }

        // PUT /api/core/sucursales/{id}
        [HttpPut("sucursales/{id}")]
        public async Task<IActionResult> EditarSucursal(long id, [FromBody] SucursalDto dto)
        {
            var sucursal = await _ctx.Sucursales.FindAsync(id);
            if (sucursal == null) return NotFound();

            sucursal.Nombre    = dto.Nombre;
            sucursal.Direccion = dto.Direccion;
            sucursal.Telefono  = dto.Telefono;
            await _ctx.SaveChangesAsync();

            return Ok(new { id = sucursal.IdSucursal, sucursal.Nombre, sucursal.Direccion, sucursal.Telefono, activo = sucursal.Activa });
        }

        // DELETE /api/core/sucursales/{id}  (soft delete)
        [HttpDelete("sucursales/{id}")]
        public async Task<IActionResult> DesactivarSucursal(long id)
        {
            var sucursal = await _ctx.Sucursales.FindAsync(id);
            if (sucursal == null) return NotFound();

            sucursal.Activa = false;
            await _ctx.SaveChangesAsync();

            return Ok(new { message = "Sucursal desactivada." });
        }

        // ── PERFILES ────────────────────────────────────────────
        // GET /api/core/perfiles
        [HttpGet("perfiles")]
        public async Task<IActionResult> GetPerfiles()
            => Ok(await _ctx.Perfiles
                .OrderBy(p => p.Nombre)
                .Select(p => new { id = p.IdPerfil, p.Nombre, p.Descripcion })
                .ToListAsync());

        // ── USUARIOS ────────────────────────────────────────────
        // GET /api/core/usuarios
        [HttpGet("usuarios")]
        public async Task<IActionResult> GetUsuarios()
            => Ok(await _ctx.Usuarios
                .Include(u => u.Perfil)
                .OrderBy(u => u.Nombre)
                .Select(u => new { id = u.IdUsuario, u.Nombre, u.Apellido, u.Email, perfil = u.Perfil!.Nombre, activo = u.Activo })
                .ToListAsync());

        // PUT /api/core/usuarios/{id}/toggle
        [HttpPut("usuarios/{id}/toggle")]
        public async Task<IActionResult> ToggleUsuario(long id)
        {
            var usuario = await _ctx.Usuarios.Include(u => u.Perfil).FirstOrDefaultAsync(u => u.IdUsuario == id);
            if (usuario == null) return NotFound();

            // Un admin no puede desactivar su propia cuenta (se quedaría sin acceso al Core).
            var idUsuarioActual = long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            if (id == idUsuarioActual)
                return BadRequest("No puedes desactivar tu propia cuenta de administrador.");

            // No se puede dejar el sistema sin ningún administrador activo.
            if (usuario.Activo && usuario.Perfil?.Nombre == "Admin")
            {
                var adminsActivos = await _ctx.Usuarios.Include(u => u.Perfil)
                    .CountAsync(u => u.Activo && u.Perfil!.Nombre == "Admin");
                if (adminsActivos <= 1)
                    return BadRequest("No se puede desactivar o degradar el único administrador del sistema.");
            }

            usuario.Activo = !usuario.Activo;
            await _ctx.SaveChangesAsync();

            return Ok(new { id = usuario.IdUsuario, activo = usuario.Activo });
        }

        // ── EMPLEADOS ───────────────────────────────────────────
        // GET /api/core/empleados
        [HttpGet("empleados")]
        public async Task<IActionResult> GetEmpleados()
        {
            var empleados = await _ctx.Empleados
                .Include(e => e.Sucursal)
                .OrderByDescending(e => e.Activo).ThenBy(e => e.Nombres)
                .ToListAsync();

            var idsEmpleados = empleados.Select(e => e.IdEmpleado).ToList();
            var usuarioPorEmpleado = await _ctx.Usuarios
                .Where(u => u.IdEmpleado != null && idsEmpleados.Contains(u.IdEmpleado.Value))
                .ToDictionaryAsync(u => u.IdEmpleado!.Value, u => new { u.Email, u.ContrasenaProvisional });

            var resultado = empleados.Select(e => new
            {
                id            = e.IdEmpleado,
                e.Nombres,
                e.Apellidos,
                documento     = e.NumeroDocumento,
                tipoEmpleado  = e.TipoEmpleado,
                e.Telefono,
                sucursal      = e.Sucursal != null ? e.Sucursal.Nombre : "",
                idSucursal    = e.IdSucursal,
                activo        = e.Activo,
                codigo        = e.CodigoEmpleado,
                idTipoDoc     = e.IdTipoDoc,
                sueldo        = e.Sueldo,
                direccion     = e.Direccion,
                emailEmpresarial = e.EmailEmpresarial,
                emailUsuario  = usuarioPorEmpleado.GetValueOrDefault(e.IdEmpleado)?.Email,
                contrasenaProvisional = usuarioPorEmpleado.GetValueOrDefault(e.IdEmpleado)?.ContrasenaProvisional ?? false
            });

            return Ok(resultado);
        }

        // POST /api/core/empleados
        [HttpPost("empleados")]
        public async Task<IActionResult> CrearEmpleado([FromBody] EmpleadoDto dto)
        {
            // Email empresarial automático: nombre.apellido@auraspa.com (único)
            var baseEmail = GenerarEmailEmpresarial(dto.Nombres, dto.Apellidos);
            var email = baseEmail; var n = 1;
            while (await _ctx.Empleados.AnyAsync(e => e.EmailEmpresarial == email + "@auraspa.com"))
                email = $"{baseEmail}{++n}";
            var emailEmpresarial = email + "@auraspa.com";

            var empleado = new Empleado
            {
                Nombres          = dto.Nombres,
                Apellidos        = dto.Apellidos,
                IdTipoDoc        = dto.IdTipoDoc > 0 ? dto.IdTipoDoc : 1, // 1=Cédula, 3=Pasaporte
                NumeroDocumento  = dto.NumeroDocumento,
                TipoEmpleado     = dto.TipoEmpleado,
                Telefono         = dto.Telefono,
                IdSucursal       = dto.IdSucursal,
                Sueldo           = dto.Sueldo,
                Direccion        = dto.Direccion,
                EmailEmpresarial = emailEmpresarial
            };
            _ctx.Empleados.Add(empleado);
            await _ctx.SaveChangesAsync();

            // Código identificador: iniciales del nombre + id (ej. GD-004)
            empleado.CodigoEmpleado =
                $"{char.ToUpper(dto.Nombres.FirstOrDefault('E'))}{char.ToUpper(dto.Apellidos.FirstOrDefault('M'))}-{empleado.IdEmpleado:000}";
            await _ctx.SaveChangesAsync();

            // Cuenta de acceso con contraseña provisional — el empleado debe cambiarla en su primer login
            string? passwordProvisional = null;
            var perfil = await _ctx.Perfiles.FirstOrDefaultAsync(p => p.Nombre == dto.TipoEmpleado);
            if (perfil != null && !await _ctx.Usuarios.AnyAsync(u => u.Email == emailEmpresarial))
            {
                passwordProvisional = $"Aura@{empleado.CodigoEmpleado}";
                var usuario = new Usuario
                {
                    Nombre                = dto.Nombres,
                    Apellido              = dto.Apellidos,
                    Email                 = emailEmpresarial,
                    NombreUsuario         = emailEmpresarial,
                    ContrasenaHash        = BCrypt.Net.BCrypt.HashPassword(passwordProvisional),
                    IdPerfil              = perfil.IdPerfil,
                    IdEmpleado            = empleado.IdEmpleado,
                    Activo                = true,
                    ContrasenaProvisional = true
                };
                _ctx.Usuarios.Add(usuario);
                await _ctx.SaveChangesAsync();
            }

            return Ok(new { id = empleado.IdEmpleado, empleado.Nombres, empleado.Apellidos,
                            codigo = empleado.CodigoEmpleado, emailEmpresarial, passwordProvisional });
        }

        // PUT /api/core/empleados/{id}/toggle — activar/desactivar (soft delete)
        [HttpPut("empleados/{id}/toggle")]
        public async Task<IActionResult> ToggleEmpleado(long id)
        {
            var empleado = await _ctx.Empleados.FindAsync(id);
            if (empleado == null) return NotFound();

            empleado.Activo = !empleado.Activo;

            // Sincronizar el usuario vinculado: un empleado desactivado no debe poder entrar
            var usuario = await _ctx.Usuarios.FirstOrDefaultAsync(u => u.IdEmpleado == id);
            if (usuario != null) usuario.Activo = empleado.Activo;

            await _ctx.SaveChangesAsync();
            return Ok(new { activo = empleado.Activo, mensaje = empleado.Activo ? "Empleado reactivado." : "Empleado desactivado." });
        }

        // PUT /api/core/empleados/{id}
        [HttpPut("empleados/{id}")]
        public async Task<IActionResult> EditarEmpleado(long id, [FromBody] EmpleadoDto dto)
        {
            var empleado = await _ctx.Empleados.FindAsync(id);
            if (empleado == null) return NotFound();

            empleado.Nombres         = dto.Nombres;
            empleado.Apellidos       = dto.Apellidos;
            empleado.NumeroDocumento = dto.NumeroDocumento;
            empleado.TipoEmpleado    = dto.TipoEmpleado;
            empleado.Telefono        = dto.Telefono;
            empleado.IdSucursal      = dto.IdSucursal;
            empleado.IdTipoDoc = dto.IdTipoDoc > 0 ? dto.IdTipoDoc : empleado.IdTipoDoc;
            empleado.Sueldo    = dto.Sueldo ?? empleado.Sueldo;
            empleado.Direccion = dto.Direccion ?? empleado.Direccion;
            await _ctx.SaveChangesAsync();

            return Ok(new { id = empleado.IdEmpleado, empleado.Nombres, empleado.Apellidos });
        }

        // ── DÍAS NO LABORABLES ──────────────────────────────────
        // GET /api/core/dias-bloqueados — visible para cualquier usuario autenticado (lo usa Agendamiento)
        // Solo devuelve los ACTIVOS (fechas realmente bloqueadas hoy).
        [HttpGet("dias-bloqueados")]
        [AllowAnonymous]
        public async Task<IActionResult> GetDiasBloqueados()
            => Ok(await _ctx.DiasBloqueados
                .Where(d => d.Activo)
                .OrderBy(d => d.Fecha)
                .Select(d => new { id = d.IdDiaBloqueado, fecha = d.Fecha, motivo = d.Motivo })
                .ToListAsync());

        // GET /api/core/dias-bloqueados/todos — para el panel Core (incluye inactivos, para reactivar)
        [HttpGet("dias-bloqueados/todos")]
        public async Task<IActionResult> GetDiasBloqueadosTodos()
            => Ok(await _ctx.DiasBloqueados
                .OrderByDescending(d => d.Activo).ThenByDescending(d => d.Fecha)
                .Select(d => new { id = d.IdDiaBloqueado, fecha = d.Fecha, motivo = d.Motivo, activo = d.Activo })
                .ToListAsync());

        // POST /api/core/dias-bloqueados  (solo Admin)
        [HttpPost("dias-bloqueados")]
        public async Task<IActionResult> CrearDiaBloqueado([FromBody] DiaBloqueadoDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Motivo))
                return BadRequest("El motivo es obligatorio para bloquear una fecha.");
            if (await _ctx.DiasBloqueados.AnyAsync(d => d.Fecha == dto.Fecha.Date && d.Activo))
                return BadRequest("Esa fecha ya está bloqueada.");

            var dia = new DiaBloqueado { Fecha = dto.Fecha.Date, Motivo = dto.Motivo.Trim(), Activo = true };
            _ctx.DiasBloqueados.Add(dia);
            await _ctx.SaveChangesAsync();

            return Ok(new { id = dia.IdDiaBloqueado, fecha = dia.Fecha, motivo = dia.Motivo });
        }

        // PUT /api/core/dias-bloqueados/{id}  — actualizar fecha/motivo
        [HttpPut("dias-bloqueados/{id}")]
        public async Task<IActionResult> EditarDiaBloqueado(long id, [FromBody] DiaBloqueadoDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Motivo))
                return BadRequest("El motivo es obligatorio para bloquear una fecha.");

            var dia = await _ctx.DiasBloqueados.FindAsync(id);
            if (dia == null) return NotFound();

            if (await _ctx.DiasBloqueados.AnyAsync(d => d.Fecha == dto.Fecha.Date && d.Activo && d.IdDiaBloqueado != id))
                return BadRequest("Esa fecha ya está bloqueada.");

            dia.Fecha  = dto.Fecha.Date;
            dia.Motivo = dto.Motivo.Trim();
            await _ctx.SaveChangesAsync();
            return Ok(new { id = dia.IdDiaBloqueado, fecha = dia.Fecha, motivo = dia.Motivo });
        }

        // PUT /api/core/dias-bloqueados/{id}/toggle — soft delete / restaurar
        [HttpPut("dias-bloqueados/{id}/toggle")]
        public async Task<IActionResult> ToggleDiaBloqueado(long id)
        {
            var dia = await _ctx.DiasBloqueados.FindAsync(id);
            if (dia == null) return NotFound();
            dia.Activo = !dia.Activo;
            await _ctx.SaveChangesAsync();
            return Ok(new { activo = dia.Activo });
        }

        // ════════════════════════════════════════════════════════
        //  USUARIOS — CRUD (crear / editar / soft-delete via toggle)
        // ════════════════════════════════════════════════════════
        [HttpPost("usuarios")]
        public async Task<IActionResult> CrearUsuario([FromBody] UsuarioCoreDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Password))
                return BadRequest("Email y contraseña son obligatorios.");
            if (await _ctx.Usuarios.AnyAsync(u => u.Email == dto.Email.Trim()))
                return BadRequest("Ese correo ya está registrado.");

            var usuario = new Usuario
            {
                Nombre         = dto.Nombre,
                Apellido       = dto.Apellido,
                Email          = dto.Email.Trim(),
                NombreUsuario  = dto.Email.Trim(),
                ContrasenaHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
                IdPerfil       = dto.IdPerfil,
                Activo         = true
            };
            _ctx.Usuarios.Add(usuario);
            await _ctx.SaveChangesAsync();
            return Ok(new { id = usuario.IdUsuario });
        }

        [HttpPut("usuarios/{id}")]
        public async Task<IActionResult> EditarUsuario(long id, [FromBody] UsuarioCoreDto dto)
        {
            var usuario = await _ctx.Usuarios.Include(u => u.Perfil).FirstOrDefaultAsync(u => u.IdUsuario == id);
            if (usuario == null) return NotFound();

            if (!string.IsNullOrWhiteSpace(dto.Email) && dto.Email.Trim() != usuario.Email)
            {
                if (await _ctx.Usuarios.AnyAsync(u => u.Email == dto.Email.Trim() && u.IdUsuario != id))
                    return BadRequest("Ese correo ya está en uso.");
                usuario.Email = dto.Email.Trim();
            }
            usuario.Nombre   = string.IsNullOrWhiteSpace(dto.Nombre) ? usuario.Nombre : dto.Nombre;
            usuario.Apellido = string.IsNullOrWhiteSpace(dto.Apellido) ? usuario.Apellido : dto.Apellido;
            if (dto.IdPerfil > 0 && dto.IdPerfil != usuario.IdPerfil)
            {
                // No se puede degradar al único administrador activo del sistema.
                if (usuario.Activo && usuario.Perfil?.Nombre == "Admin")
                {
                    var adminsActivos = await _ctx.Usuarios.Include(u => u.Perfil)
                        .CountAsync(u => u.Activo && u.Perfil!.Nombre == "Admin");
                    if (adminsActivos <= 1)
                        return BadRequest("No se puede desactivar o degradar el único administrador del sistema.");
                }
                usuario.IdPerfil = dto.IdPerfil;
            }
            if (!string.IsNullOrWhiteSpace(dto.Password))
                usuario.ContrasenaHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);

            await _ctx.SaveChangesAsync();
            return Ok(new { mensaje = "Usuario actualizado." });
        }

        // ════════════════════════════════════════════════════════
        //  SERVICIOS — CRUD sobre ItemCatalogo (Tipo = Servicio)
        // ════════════════════════════════════════════════════════
        [HttpGet("categorias-servicio")]
        public async Task<IActionResult> GetCategorias()
            => Ok(await _ctx.CategoriasServicio.Select(c => new { id = c.IdCategoria, c.Nombre }).ToListAsync());

        [HttpPost("servicios")]
        public async Task<IActionResult> CrearServicio([FromBody] ServicioCoreDto dto)
        {
            var item = new ItemCatalogo
            {
                Nombre          = dto.Nombre,
                Descripcion     = dto.Descripcion ?? "",
                Tipo            = "Servicio",
                PrecioBase      = dto.PrecioBase,
                IdCategoria     = dto.IdCategoria,
                DuracionMinutos = dto.DuracionMinutos,
                Activo          = true
            };
            _ctx.ItemsCatalogo.Add(item);
            await _ctx.SaveChangesAsync();
            return Ok(new { id = item.IdItem });
        }

        [HttpPut("servicios/{id}")]
        public async Task<IActionResult> EditarServicio(long id, [FromBody] ServicioCoreDto dto)
        {
            var item = await _ctx.ItemsCatalogo.FirstOrDefaultAsync(i => i.IdItem == id && i.Tipo == "Servicio");
            if (item == null) return NotFound();
            item.Nombre          = dto.Nombre;
            if (dto.Descripcion != null) item.Descripcion = dto.Descripcion;
            item.PrecioBase      = dto.PrecioBase;
            item.IdCategoria     = dto.IdCategoria ?? item.IdCategoria;
            item.DuracionMinutos = dto.DuracionMinutos ?? item.DuracionMinutos;
            await _ctx.SaveChangesAsync();
            return Ok(new { mensaje = "Servicio actualizado." });
        }

        [HttpPut("servicios/{id}/toggle")]
        public async Task<IActionResult> ToggleServicio(long id)
        {
            var item = await _ctx.ItemsCatalogo.FirstOrDefaultAsync(i => i.IdItem == id && i.Tipo == "Servicio");
            if (item == null) return NotFound();

            if (item.Activo)
            {
                var tieneCitasActivas = await _ctx.Citas.AnyAsync(c =>
                    c.IdItem == id && (c.Estado == "Pendiente" || c.Estado == "Confirmada"));
                if (tieneCitasActivas)
                    return BadRequest($"No se puede eliminar \"{item.Nombre}\" porque tiene citas pendientes o confirmadas asociadas. Cancela esas citas primero.");
            }

            item.Activo = !item.Activo;
            await _ctx.SaveChangesAsync();
            return Ok(new { activo = item.Activo });
        }

        // GET /api/core/servicios — incluye inactivos (el catálogo público filtra activos)
        [HttpGet("servicios")]
        public async Task<IActionResult> GetServicios()
        {
            var items = await _ctx.ItemsCatalogo.Include(i => i.Categoria)
                .Where(i => i.Tipo == "Servicio")
                .OrderByDescending(i => i.Activo).ThenBy(i => i.Nombre)
                .Select(i => new {
                    id = i.IdItem, nombre = i.Nombre, descripcion = i.Descripcion,
                    categoria = i.Categoria != null ? i.Categoria.Nombre : "",
                    idCategoria = i.IdCategoria,
                    precio = i.PrecioBase, duracion = i.DuracionMinutos ?? 0, activo = i.Activo
                }).ToListAsync();
            return Ok(items);
        }

        // ════════════════════════════════════════════════════════
        //  INVENTARIO — CRUD de productos + stock por sucursal
        // ════════════════════════════════════════════════════════
        [HttpGet("productos/{idSucursal}")]
        public async Task<IActionResult> GetProductos(long idSucursal)
        {
            var stock = await _ctx.Set<ItemCatalogoSucursal>()
                .Where(sk => sk.IdSucursal == idSucursal)
                .ToDictionaryAsync(sk => sk.IdItem, sk => sk);

            var items = await _ctx.ItemsCatalogo
                .Where(i => i.Tipo == "Producto")
                .OrderByDescending(i => i.Activo).ThenBy(i => i.Nombre)
                .ToListAsync();

            return Ok(items.Select(i => new {
                id = i.IdItem, nombre = i.Nombre, descripcion = i.Descripcion,
                precio = i.PrecioBase, activo = i.Activo,
                stock = stock.GetValueOrDefault(i.IdItem)?.Stock ?? 0,
                stockMinimo = stock.GetValueOrDefault(i.IdItem)?.StockMinimo ?? 5
            }));
        }

        [HttpPost("productos")]
        public async Task<IActionResult> CrearProducto([FromBody] ProductoCoreDto dto)
        {
            var item = new ItemCatalogo
            {
                Nombre = dto.Nombre, Descripcion = dto.Descripcion ?? "",
                Tipo = "Producto", PrecioBase = dto.PrecioBase, Activo = true
            };
            _ctx.ItemsCatalogo.Add(item);
            await _ctx.SaveChangesAsync();

            _ctx.Set<ItemCatalogoSucursal>().Add(new ItemCatalogoSucursal
            {
                IdItem = item.IdItem, IdSucursal = dto.IdSucursal,
                Stock = dto.Stock, StockMinimo = dto.StockMinimo, Disponible = true
            });
            await _ctx.SaveChangesAsync();
            return Ok(new { id = item.IdItem });
        }

        [HttpPut("productos/{id}")]
        public async Task<IActionResult> EditarProducto(long id, [FromBody] ProductoCoreDto dto)
        {
            var item = await _ctx.ItemsCatalogo.FirstOrDefaultAsync(i => i.IdItem == id && i.Tipo == "Producto");
            if (item == null) return NotFound();
            item.Nombre = dto.Nombre;
            if (dto.Descripcion != null) item.Descripcion = dto.Descripcion;
            item.PrecioBase = dto.PrecioBase;

            var sk = await _ctx.Set<ItemCatalogoSucursal>()
                .FirstOrDefaultAsync(x => x.IdItem == id && x.IdSucursal == dto.IdSucursal);
            if (sk == null)
                _ctx.Set<ItemCatalogoSucursal>().Add(new ItemCatalogoSucursal
                { IdItem = id, IdSucursal = dto.IdSucursal, Stock = dto.Stock, StockMinimo = dto.StockMinimo, Disponible = true });
            else { sk.Stock = dto.Stock; sk.StockMinimo = dto.StockMinimo; }

            await _ctx.SaveChangesAsync();
            return Ok(new { mensaje = "Producto actualizado." });
        }

        [HttpPut("productos/{id}/toggle")]
        public async Task<IActionResult> ToggleProducto(long id)
        {
            var item = await _ctx.ItemsCatalogo.FirstOrDefaultAsync(i => i.IdItem == id && i.Tipo == "Producto");
            if (item == null) return NotFound();
            item.Activo = !item.Activo;
            await _ctx.SaveChangesAsync();
            return Ok(new { activo = item.Activo });
        }

        // ════════════════════════════════════════════════════════
        //  PAQUETES — CRUD (depilación láser y demás)
        // ════════════════════════════════════════════════════════
        [HttpGet("paquetes")]
        public async Task<IActionResult> GetPaquetes()
            => Ok(await _ctx.Paquetes
                .OrderByDescending(p => p.Activo).ThenBy(p => p.Nombre)
                .Select(p => new { id = p.IdPaquete, p.Nombre, p.Descripcion, p.Categoria, p.Precio, p.Sesiones, activo = p.Activo })
                .ToListAsync());

        [HttpPost("paquetes")]
        public async Task<IActionResult> CrearPaquete([FromBody] PaqueteDto dto)
        {
            var pq = new Paquete { Nombre = dto.Nombre, Descripcion = dto.Descripcion, Categoria = dto.Categoria, Precio = dto.Precio, Sesiones = dto.Sesiones };
            _ctx.Paquetes.Add(pq);
            await _ctx.SaveChangesAsync();
            return Ok(new { id = pq.IdPaquete });
        }

        [HttpPut("paquetes/{id}")]
        public async Task<IActionResult> EditarPaquete(long id, [FromBody] PaqueteDto dto)
        {
            var pq = await _ctx.Paquetes.FindAsync(id);
            if (pq == null) return NotFound();
            pq.Nombre = dto.Nombre; pq.Descripcion = dto.Descripcion; pq.Categoria = dto.Categoria;
            pq.Precio = dto.Precio; pq.Sesiones = dto.Sesiones;
            await _ctx.SaveChangesAsync();
            return Ok(new { mensaje = "Paquete actualizado." });
        }

        [HttpPut("paquetes/{id}/toggle")]
        public async Task<IActionResult> TogglePaquete(long id)
        {
            var pq = await _ctx.Paquetes.FindAsync(id);
            if (pq == null) return NotFound();
            pq.Activo = !pq.Activo;
            await _ctx.SaveChangesAsync();
            return Ok(new { activo = pq.Activo });
        }

        // La asignación de paquetes a clientes vive en PaquetesController
        // (POST /api/paquetes/asignar, GET /api/paquetes/cliente/{idCliente}).

        // ── EXPEDIENTES CLÍNICOS ────────────────────────────────
        // GET /api/core/expedientes
        [HttpGet("expedientes")]
        public async Task<IActionResult> GetExpedientes()
            => Ok(await _ctx.ExpedientesClinicos
                .Include(e => e.Cliente)
                .OrderByDescending(e => e.Activo).ThenBy(e => e.Cliente!.Nombres)
                .Select(e => new
                {
                    id = e.IdExpediente,
                    idCliente = e.IdCliente,
                    cliente = e.Cliente != null ? e.Cliente.Nombres + " " + e.Cliente.Apellidos : "",
                    tipoPiel = e.TipoPiel,
                    alergias = e.Alergias,
                    medicamentos = e.Medicamentos,
                    notas = e.NotasEspecialista,
                    activo = e.Activo
                })
                .ToListAsync());

        // POST /api/core/expedientes
        [HttpPost("expedientes")]
        public async Task<IActionResult> CrearExpediente([FromBody] ExpedienteDto dto)
        {
            if (await _ctx.ExpedientesClinicos.AnyAsync(e => e.IdCliente == dto.IdCliente))
                return BadRequest("Este cliente ya tiene un expediente.");

            var exp = new ExpedienteClinico
            {
                IdCliente          = dto.IdCliente,
                TipoPiel           = dto.TipoPiel,
                Alergias           = dto.Alergias,
                Medicamentos       = dto.Medicamentos,
                NotasEspecialista  = dto.Notas
            };
            _ctx.ExpedientesClinicos.Add(exp);
            await _ctx.SaveChangesAsync();
            return Ok(new { id = exp.IdExpediente });
        }

        // PUT /api/core/expedientes/{id}
        [HttpPut("expedientes/{id}")]
        public async Task<IActionResult> EditarExpediente(long id, [FromBody] ExpedienteDto dto)
        {
            var exp = await _ctx.ExpedientesClinicos.FindAsync(id);
            if (exp == null) return NotFound();

            exp.TipoPiel          = dto.TipoPiel;
            exp.Alergias          = dto.Alergias;
            exp.Medicamentos      = dto.Medicamentos;
            exp.NotasEspecialista = dto.Notas;
            exp.UltimaActualizacion = DateTime.Now;
            await _ctx.SaveChangesAsync();
            return Ok(new { mensaje = "Expediente actualizado." });
        }

        // DELETE /api/core/expedientes/{id}  (soft delete)
        [HttpDelete("expedientes/{id}")]
        public async Task<IActionResult> DesactivarExpediente(long id)
        {
            var exp = await _ctx.ExpedientesClinicos.FindAsync(id);
            if (exp == null) return NotFound();
            exp.Activo = false;
            await _ctx.SaveChangesAsync();
            return Ok(new { message = "Expediente desactivado." });
        }

        // PUT /api/core/expedientes/{id}/reactivar
        [HttpPut("expedientes/{id}/reactivar")]
        public async Task<IActionResult> ReactivarExpediente(long id)
        {
            var exp = await _ctx.ExpedientesClinicos.FindAsync(id);
            if (exp == null) return NotFound();
            exp.Activo = true;
            await _ctx.SaveChangesAsync();
            return Ok(new { message = "Expediente reactivado." });
        }

        // ── CONSENTIMIENTOS ─────────────────────────────────────
        // GET /api/core/consentimientos
        [HttpGet("consentimientos")]
        public async Task<IActionResult> GetConsentimientos()
            => Ok(await _ctx.Consentimientos
                .OrderByDescending(c => c.Activo).ThenByDescending(c => c.FechaCreacion)
                .Select(c => new { id = c.IdConsentimiento, c.Titulo, c.Descripcion, c.Contenido, activo = c.Activo, c.FechaCreacion })
                .ToListAsync());

        // POST /api/core/consentimientos
        [HttpPost("consentimientos")]
        public async Task<IActionResult> CrearConsentimiento([FromBody] ConsentimientoDto dto)
        {
            var con = new Consentimiento { Titulo = dto.Titulo, Descripcion = dto.Descripcion, Contenido = dto.Contenido };
            _ctx.Consentimientos.Add(con);
            await _ctx.SaveChangesAsync();
            return Ok(new { id = con.IdConsentimiento });
        }

        // PUT /api/core/consentimientos/{id}
        [HttpPut("consentimientos/{id}")]
        public async Task<IActionResult> EditarConsentimiento(long id, [FromBody] ConsentimientoDto dto)
        {
            var con = await _ctx.Consentimientos.FindAsync(id);
            if (con == null) return NotFound();
            con.Titulo = dto.Titulo; con.Descripcion = dto.Descripcion; con.Contenido = dto.Contenido;
            await _ctx.SaveChangesAsync();
            return Ok(new { mensaje = "Consentimiento actualizado." });
        }

        // PUT /api/core/consentimientos/{id}/toggle — activar/desactivar
        [HttpPut("consentimientos/{id}/toggle")]
        public async Task<IActionResult> ToggleConsentimiento(long id)
        {
            var con = await _ctx.Consentimientos.FindAsync(id);
            if (con == null) return NotFound();
            con.Activo = !con.Activo;
            await _ctx.SaveChangesAsync();
            return Ok(new { activo = con.Activo });
        }

        // ── Helper: nombre.apellido normalizado para email @auraspa.com ──
        private static string GenerarEmailEmpresarial(string nombres, string apellidos)
        {
            string Limpio(string x)
            {
                var norm = x.Trim().ToLowerInvariant().Split(' ')[0]
                    .Normalize(System.Text.NormalizationForm.FormD);
                var sb = new System.Text.StringBuilder();
                foreach (var c in norm)
                    if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark
                        && char.IsLetterOrDigit(c))
                        sb.Append(c);
                return sb.ToString();
            }
            var n = Limpio(nombres); var a = Limpio(apellidos);
            return string.IsNullOrEmpty(a) ? n : $"{n}.{a}";
        }
    }

}
