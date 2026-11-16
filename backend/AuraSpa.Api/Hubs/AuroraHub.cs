using Microsoft.AspNetCore.SignalR;

namespace AuraSpa.Api.Hubs
{
    /// <summary>
    /// Hub SignalR de Aurora.
    /// Grupos:
    ///  - "recepcion": pantallas del staff (dashboard) que reciben alertas de llegada.
    ///  - "kiosko":    quioscos físicos del spa (reciben comandos remotos si se necesitan).
    /// Eventos emitidos al cliente:
    ///  - "LlegadaCliente"  { nombre, servicio, hora, mensaje }
    ///  - "AccesoEmpleado"  { nombre, tipoEmpleado, mensaje }
    /// </summary>
    public class AuroraHub : Hub
    {
        public async Task UnirseRecepcion()
            => await Groups.AddToGroupAsync(Context.ConnectionId, "recepcion");

        public async Task UnirseKiosko()
            => await Groups.AddToGroupAsync(Context.ConnectionId, "kiosko");

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, "recepcion");
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, "kiosko");
            await base.OnDisconnectedAsync(exception);
        }
    }
}
