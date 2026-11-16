import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, MapPin, Calendar, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import apiClient from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { SUCURSALES_DEMO, leerPedidosDemo, actualizarPedidoDemo } from '../utils/demo';

interface Reserva {
  idApartado: number;
  producto: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  itbis: number;
  total: number;
  sucursal: string;
  estado: 'Pendiente' | 'Retirado' | 'Cancelado';
  fechaReserva: string;
  notas?: string;
  referencia?: string; // solo en Modo Demo: pedido local al que pertenece la línea
}

interface Orden {
  clave: string;
  fechaReserva: string;
  sucursal: string;
  estado: 'Pendiente' | 'Retirado' | 'Cancelado';
  items: Reserva[];
  subtotal: number;
  itbis: number;
  total: number;
}

const estadoConfig: Record<string, { color: string; bg: string; icono: React.ReactNode; label: string }> = {
  Pendiente: { color: '#D4AA00', bg: '#FDF8EC', icono: <AlertCircle size={14} />, label: 'Pendiente' },
  Retirado:  { color: '#22c55e', bg: '#f0fdf4', icono: <CheckCircle size={14} />, label: 'Retirado' },
  Cancelado: { color: '#ef4444', bg: '#fef2f2', icono: <XCircle size={14} />,     label: 'Cancelado' },
};

// Agrupa las líneas de producto en "órdenes" — mismo fecha_reserva + sucursal = misma orden
const agruparEnOrdenes = (reservas: Reserva[]): Orden[] => {
  const mapa = new Map<string, Orden>();
  for (const r of reservas) {
    const clave = `${r.fechaReserva}|${r.sucursal}`;
    let orden = mapa.get(clave);
    if (!orden) {
      orden = { clave, fechaReserva: r.fechaReserva, sucursal: r.sucursal, estado: r.estado, items: [], subtotal: 0, itbis: 0, total: 0 };
      mapa.set(clave, orden);
    }
    orden.items.push(r);
    orden.subtotal += r.subtotal;
    orden.itbis += r.itbis;
    orden.total += r.total;
  }
  return Array.from(mapa.values()).sort((a, b) => new Date(b.fechaReserva).getTime() - new Date(a.fechaReserva).getTime());
};

// Modo demo: convierte los pedidos guardados en el navegador a líneas con el mismo
// formato que devuelve /api/reservas/mis-reservas (una línea por producto, ITBIS 18%)
const ITBIS = 0.18;
const pedidosDemoComoReservas = (): Reserva[] =>
  leerPedidosDemo().flatMap((p, iPedido) => p.productos.map((prod, iProd) => {
    const subtotal = prod.precioUnitario * prod.cantidad;
    const itbis = subtotal * ITBIS;
    return {
      idApartado: -(iPedido * 1000 + iProd + 1),
      producto: prod.nombre,
      cantidad: prod.cantidad,
      precioUnitario: prod.precioUnitario,
      subtotal, itbis, total: subtotal + itbis,
      sucursal: SUCURSALES_DEMO.find(s => s.idSucursal === p.idSucursal)?.nombre ?? 'AuraSpa Principal',
      estado: p.estado ?? 'Pendiente',
      fechaReserva: p.creado,
      notas: p.notas || undefined,
      referencia: p.referencia,
    };
  }));

const MisReservas: React.FC = () => {
  const navigate = useNavigate();
  const { isDemo } = useAuth();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<string>('Todas');
  const [confirmCancelar, setConfirmCancelar] = useState<Orden | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    fetchReservas();
  }, []);

  const fetchReservas = async () => {
    setLoading(true);
    setError('');
    // Modo demo: los pedidos viven solo en este navegador
    if (isDemo) {
      setReservas(pedidosDemoComoReservas());
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.get('/api/reservas/mis-reservas');
      setReservas(res.data);
    } catch {
      setError('No se pudieron cargar tus reservas. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  const ordenes = agruparEnOrdenes(reservas);
  const ordenesFiltradas = filtro === 'Todas' ? ordenes : ordenes.filter(o => o.estado === filtro);

  const formatFecha = (fecha: string) =>
    new Date(fecha).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });

  const handleCancelarOrden = async () => {
    if (!confirmCancelar) return;
    setCancelando(true);
    setCancelError('');
    // Modo demo: se cancela el pedido guardado en el navegador
    if (isDemo) {
      const referencia = confirmCancelar.items[0]?.referencia;
      if (referencia) actualizarPedidoDemo(referencia, { estado: 'Cancelado' });
      setReservas(pedidosDemoComoReservas());
      setConfirmCancelar(null);
      setCancelando(false);
      return;
    }
    try {
      await Promise.all(confirmCancelar.items.map(i => apiClient.put(`/api/reservas/${i.idApartado}/cancelar`)));
      await fetchReservas();
      setConfirmCancelar(null);
    } catch (err: any) {
      const msg = err.response?.data;
      setCancelError(typeof msg === 'string' ? msg : 'No se pudo cancelar la reserva.');
    } finally {
      setCancelando(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--aura-beige)', padding: '40px 10%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ color: 'var(--aura-navy)', fontWeight: 'bold', margin: 0 }}>Mis Reservas</h2>
          <p style={{ color: 'var(--aura-gray)', margin: 0, fontSize: '0.9rem' }}>Historial de productos reservados</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-AuraSpa" onClick={() => navigate('/catalog?tipo=Producto')} style={{ padding: '10px 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShoppingBag size={16} /> Reservar productos
          </button>
          <button onClick={() => navigate('/dashboard/client')} className="btn-outline-aura" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>← Volver</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', flexWrap: 'wrap' }}>
        {['Todas', 'Pendiente', 'Retirado', 'Cancelado'].map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            padding: '8px 18px', borderRadius: '30px', border: '1px solid',
            borderColor: filtro === f ? 'var(--aura-lavender)' : '#ddd',
            background: filtro === f ? 'var(--aura-lavender)' : 'white',
            color: filtro === f ? 'white' : 'var(--aura-gray)',
            fontWeight: filtro === f ? '600' : '400',
            cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s'
          }}>{f}</button>
        ))}
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--aura-gray)', padding: '60px' }}>Cargando tus reservas...</p>}
      {error && <p style={{ textAlign: 'center', color: '#c62828', padding: '30px', background: '#ffebee', borderRadius: '20px' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {ordenesFiltradas.length === 0 ? (
            <div className="card-aura" style={{ padding: '60px', textAlign: 'center' }}>
              <p style={{ color: 'var(--aura-gray)', margin: 0 }}>No tienes reservas {filtro !== 'Todas' ? `con estado "${filtro}"` : 'registradas'}.</p>
              <button className="btn-AuraSpa" onClick={() => navigate('/catalog?tipo=Producto')} style={{ marginTop: '20px', padding: '12px 30px' }}>
                Reservar mi primer producto
              </button>
            </div>
          ) : ordenesFiltradas.map(orden => {
            const config = estadoConfig[orden.estado] ?? estadoConfig['Pendiente'];
            return (
              <div key={orden.clave} className="card-aura" style={{ padding: '25px 30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <h4 style={{ fontWeight: 'bold', margin: 0, color: 'var(--aura-navy)', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
                        Orden — {orden.items.length} {orden.items.length === 1 ? 'producto' : 'productos'}
                      </h4>
                      <span style={{ background: config.bg, color: config.color, padding: '3px 12px', borderRadius: '30px', fontSize: '0.78rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {config.icono} {config.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--aura-gray)', fontSize: '0.85rem' }}><MapPin size={14} />{orden.sucursal}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--aura-gray)', fontSize: '0.85rem' }}><Calendar size={14} />{formatFecha(orden.fechaReserva)}</span>
                      {orden.items[0]?.referencia && (
                        <span style={{ color: 'var(--aura-gray)', fontSize: '0.85rem' }}>Ref. {orden.items[0].referencia}</span>
                      )}
                    </div>
                  </div>
                  {orden.estado === 'Pendiente' && (
                    <button
                      onClick={() => { setConfirmCancelar(orden); setCancelError(''); }}
                      style={{ padding: '8px 18px', borderRadius: '30px', border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', fontWeight: '600', cursor: 'pointer', fontSize: '0.82rem' }}
                    >
                      Cancelar reserva
                    </button>
                  )}
                </div>

                {/* Detalle tipo factura */}
                <div style={{ borderTop: '1px solid #f0edf5', paddingTop: '14px' }}>
                  {orden.items.map(item => (
                    <div key={item.idApartado} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--aura-navy)', fontWeight: '500' }}>{item.producto} <span style={{ color: '#999', fontWeight: 400 }}>x{item.cantidad}</span></span>
                      <span style={{ color: 'var(--aura-gray)' }}>RD$ {item.subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px dashed #e0d8f5', marginTop: '10px', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--aura-gray)' }}>Subtotal: RD$ {orden.subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--aura-gray)' }}>ITBIS: RD$ {orden.itbis.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                    <span style={{ fontSize: '0.95rem', color: 'var(--aura-navy)', fontWeight: '700' }}>Total: RD$ {orden.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal confirmar cancelación */}
      {confirmCancelar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card-aura" style={{ width: '100%', maxWidth: '420px', padding: '40px', borderRadius: '30px', textAlign: 'center' }}>
            <h3 style={{ color: 'var(--aura-navy)', fontWeight: 'bold', marginBottom: '8px' }}>¿Cancelar esta reserva?</h3>
            <p style={{ color: 'var(--aura-gray)', fontSize: '0.9rem', marginBottom: '25px' }}>
              Se cancelarán los {confirmCancelar.items.length} producto(s) de esta orden en {confirmCancelar.sucursal}.
            </p>
            {cancelError && <p style={{ color: '#c62828', fontSize: '0.85rem', marginBottom: '15px' }}>{cancelError}</p>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleCancelarOrden} disabled={cancelando}
                style={{ flex: 1, padding: '12px', borderRadius: '30px', border: 'none', background: '#ef4444', color: 'white', fontWeight: '600', cursor: 'pointer' }}>
                {cancelando ? <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto' }} /> : 'Sí, cancelar'}
              </button>
              <button onClick={() => setConfirmCancelar(null)} className="btn-outline-aura" style={{ flex: 1, padding: '12px' }}>Volver</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MisReservas;
