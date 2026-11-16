namespace AuraSpa.Api.DTOs
{
    // ── Conversación ────────────────────────────────────────────
    public class AuroraMensajeDto
    {
        public string Texto  { get; set; } = string.Empty;
        public string Idioma { get; set; } = "es";   // "es" | "en"
    }

    public class AuroraRespuestaDto
    {
        public string Texto     { get; set; } = string.Empty;
        public string Intencion { get; set; } = "default";
        /// <summary>Acción sugerida para el frontend: "agendar", "catalogo", "checkin", null…</summary>
        public string? Accion   { get; set; }
        /// <summary>Datos extraídos de la frase (ej. fecha/hora/servicio) para prellenar módulos.</summary>
        public Dictionary<string, string>? Datos { get; set; }
    }

    // ── Check-in biométrico (descriptores, sin fotos) ───────────
    public class AuroraCheckinDto
    {
        /// <summary>Descriptor facial de 128 dimensiones generado por
        /// face-api.js en el navegador. Nunca viajan imágenes.</summary>
        public float[]? Descriptor { get; set; }
        /// <summary>Fallback manual: cédula/documento si el rostro no identifica.</summary>
        public string? Documento  { get; set; }
    }

    // ── Enrolamiento de rostro (usuario autenticado) ────────────
    public class RostroRegistroDto
    {
        /// <summary>Descriptor de 128 dimensiones (promedio de varias capturas).</summary>
        public float[] Descriptor { get; set; } = Array.Empty<float>();
    }

    public class AuroraCheckinRespuestaDto
    {
        public bool    Reconocido   { get; set; }
        public string? TipoPersona  { get; set; }   // "cliente" | "empleado"
        public string? Nombre       { get; set; }
        public string? Mensaje      { get; set; }
        public bool    AccesoAdmin  { get; set; }
        public string? ProximaCita  { get; set; }   // hora formateada si aplica
    }
}
