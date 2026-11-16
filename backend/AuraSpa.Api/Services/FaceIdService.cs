using System.Text.Json;
using AuraSpa.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AuraSpa.Api.Services
{
    /// <summary>Resultado de una identificación biométrica.</summary>
    public record FaceIdResultado(
        bool Reconocido,
        string? TipoPersona,   // "cliente" | "empleado"
        long?  IdPersona,      // id_cliente o id_empleado según TipoPersona
        string? Nombre,
        string? TipoEmpleado   // solo si TipoPersona == "empleado"
    );

    /// <summary>
    /// Identificación de personas en el kiosko de Aurora.
    /// Dos vías, ambas 100% reales contra la base de datos:
    ///  1. Descriptor facial: face-api.js convierte el rostro en un vector
    ///     de 128 dimensiones EN EL NAVEGADOR. Aquí solo se compara ese
    ///     vector (distancia euclidiana) contra los registrados. Ninguna
    ///     imagen viaja al servidor ni se almacena (Ley 172-13).
    ///  2. Documento (cédula) como fallback manual.
    /// </summary>
    public interface IFaceIdService
    {
        Task<FaceIdResultado> IdentificarAsync(float[]? descriptor, string? documento);
    }

    public class LocalFaceIdService : IFaceIdService
    {
        private readonly ApplicationDbContext _ctx;
        public LocalFaceIdService(ApplicationDbContext ctx) => _ctx = ctx;

        /// <summary>
        /// Umbral de distancia euclidiana. face-api.js considera que dos
        /// descriptores pertenecen a la misma persona cuando la distancia
        /// es menor a ~0.6; usamos 0.55 para reducir falsos positivos.
        /// </summary>
        private const double Umbral = 0.55;

        public async Task<FaceIdResultado> IdentificarAsync(float[]? descriptor, string? documento)
        {
            // ── Vía 1: matching biométrico por vector ───────────
            if (descriptor is { Length: 128 })
            {
                var registros = await _ctx.RostrosDescriptores.AsNoTracking()
                    .Where(r => r.Activo)
                    .Select(r => new { r.IdUsuario, r.Descriptor })
                    .ToListAsync();

                long? mejorUsuario = null;
                var mejorDistancia = double.MaxValue;

                foreach (var reg in registros)
                {
                    float[]? almacenado;
                    try { almacenado = JsonSerializer.Deserialize<float[]>(reg.Descriptor); }
                    catch { continue; }
                    if (almacenado is not { Length: 128 }) continue;

                    var d = DistanciaEuclidiana(descriptor, almacenado);
                    if (d < mejorDistancia) { mejorDistancia = d; mejorUsuario = reg.IdUsuario; }
                }

                if (mejorUsuario != null && mejorDistancia < Umbral)
                    return await ResolverUsuarioAsync(mejorUsuario.Value);

                return new FaceIdResultado(false, null, null, null, null);
            }

            // ── Vía 2: documento (cédula) ───────────────────────
            if (!string.IsNullOrWhiteSpace(documento))
            {
                var doc = documento.Trim();

                var emp = await _ctx.Empleados.AsNoTracking()
                    .FirstOrDefaultAsync(e => e.NumeroDocumento == doc && e.Activo);
                if (emp != null)
                    return new FaceIdResultado(true, "empleado", emp.IdEmpleado,
                        $"{emp.Nombres} {emp.Apellidos}", emp.TipoEmpleado);

                var cli = await _ctx.Clientes.AsNoTracking()
                    .FirstOrDefaultAsync(c => c.NumeroDocumento == doc && c.Activo);
                if (cli != null)
                    return new FaceIdResultado(true, "cliente", cli.IdCliente,
                        $"{cli.Nombres} {cli.Apellidos}", null);
            }

            return new FaceIdResultado(false, null, null, null, null);
        }

        /// <summary>Mapea el usuario reconocido a empleado o cliente.</summary>
        private async Task<FaceIdResultado> ResolverUsuarioAsync(long idUsuario)
        {
            var usuario = await _ctx.Usuarios.AsNoTracking()
                .FirstOrDefaultAsync(u => u.IdUsuario == idUsuario && u.Activo);
            if (usuario == null)
                return new FaceIdResultado(false, null, null, null, null);

            if (usuario.IdEmpleado != null)
            {
                var emp = await _ctx.Empleados.AsNoTracking()
                    .FirstOrDefaultAsync(e => e.IdEmpleado == usuario.IdEmpleado);
                if (emp != null)
                    return new FaceIdResultado(true, "empleado", emp.IdEmpleado,
                        $"{emp.Nombres} {emp.Apellidos}", emp.TipoEmpleado);
            }

            if (usuario.IdCliente != null)
            {
                var cli = await _ctx.Clientes.AsNoTracking()
                    .FirstOrDefaultAsync(c => c.IdCliente == usuario.IdCliente);
                if (cli != null)
                    return new FaceIdResultado(true, "cliente", cli.IdCliente,
                        $"{cli.Nombres} {cli.Apellidos}", null);
            }

            // Usuario sin vínculo a cliente/empleado: lo tratamos como cliente genérico
            return new FaceIdResultado(true, "cliente", null,
                $"{usuario.Nombre} {usuario.Apellido}", null);
        }

        private static double DistanciaEuclidiana(float[] a, float[] b)
        {
            double suma = 0;
            for (var i = 0; i < a.Length; i++)
            {
                double dif = a[i] - b[i];
                suma += dif * dif;
            }
            return Math.Sqrt(suma);
        }
    }
}
