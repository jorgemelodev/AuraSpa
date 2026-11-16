import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/apiClient';
import { ShoppingBag, CheckCircle, Loader2, Search } from 'lucide-react';

interface ReservaStaff {
  idApartado: number;
  idUsuario: number;
  cliente: string;
  producto: string;
  cantidad: number;
  total: number;
  sucursal: string;
  estado: 'Pendiente' | 'Retirado' | 'Cancelado';
  fechaReserva: string;
  notas?: string;
}

const estadoColor: Record<string, { bg: string; color: string }> = {
  Pendiente: { bg: '#FDF8EC', color: '#D4AA00' },
  Retirado: { bg: '#f0fdf4', color: '#22c55e' },
  Cancelado: { bg: '#fef2f2', color: '#ef4444' },
};

const fmt = (n: number) => n.toLocaleString('es-DO', { minimumFractionDigits: 2 });

/**
 * Reservas de productos de todos los clientes (staff).
 * Recepción/caja usa esta pantalla para saber qué productos entregar
 * y marcar la entrega una vez el cliente pasa a recogerlos.
 */
const ReservasStaff: React.FC = () => {
  const navigate = useNavigate();
  const [reservas, setReservas] = useState<ReservaStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<'Todos' | 'Pendiente' | 'Retirado' | 'Cancelado'>('Pendiente');
  const [busqueda, setBusqueda] = useState('');
  const [procesando, setProcesando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/api/reservas/todas', { params: { estado: filtroEstado } });
      setReservas(r.data);
    } catch { setReservas([]); }
    finally { setLoading(false); }
  }, [filtroEstado]);

  useEffect(() => { cargar(); }, [cargar]);

  const entregar = async (id: number) => {
    setProcesando(id);
    try {
      await apiClient.put(`/api/reservas/${id}/entregar`);
      await cargar();
    } catch { alert('No se pudo marcar la entrega. Intenta de nuevo.'); }
    finally { setProcesando(null); }
  };

  const filtradas = reservas.filter(r =>
    r.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
    r.producto.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--aura-beige)', padding: '40px 8%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ color: 'var(--aura-navy)', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShoppingBag size={26} color="var(--aura-lavender)" /> Reservas de Productos
          </h2>
          <p style={{ color: 'var(--aura-gray)', margin: 0, fontSize: '0.9rem' }}>Productos que los clientes reservaron desde su cuenta — entrega y cobro en caja.</p>
        </div>
        <button onClick={() => navigate(-1)} className="btn-outline-aura" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>← Volver</button>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#999' }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente o producto..."
            style={{ padding: '9px 14px 9px 34px', borderRadius: 20, border: '1px solid #e0d8f5', outline: 'none', fontSize: '0.85rem', width: 240 }} />
        </div>
        {(['Pendiente', 'Retirado', 'Cancelado', 'Todos'] as const).map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
              background: filtroEstado === e ? 'var(--aura-lavender)' : 'white', color: filtroEstado === e ? 'white' : 'var(--aura-gray)' }}>
            {e}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px' }}><Loader2 className="animate-spin" size={36} style={{ color: 'var(--aura-lavender)' }} /></div>
      ) : filtradas.length === 0 ? (
        <div className="card-aura" style={{ padding: '50px', textAlign: 'center' }}>
          <ShoppingBag size={36} color="#ddd" style={{ marginBottom: 12 }} />
          <p style={{ color: '#999' }}>No hay reservas {filtroEstado !== 'Todos' ? `en estado "${filtroEstado}"` : ''}.</p>
        </div>
      ) : (
        <div className="card-aura" style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf8ff', textAlign: 'left' }}>
                {['Cliente', 'Producto', 'Cant.', 'Total', 'Sucursal', 'Fecha', 'Estado', 'Acción'].map(c => (
                  <th key={c} style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--aura-gray)', fontWeight: 700 }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((r, i) => (
                <tr key={r.idApartado} style={{ borderBottom: '1px solid #f0edf5', background: i % 2 === 0 ? 'white' : '#faf9ff' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--aura-navy)' }}>{r.cliente}</td>
                  <td style={{ padding: '10px 14px', color: '#555' }}>{r.producto}</td>
                  <td style={{ padding: '10px 14px', color: '#555' }}>{r.cantidad}</td>
                  <td style={{ padding: '10px 14px', color: '#555' }}>RD$ {fmt(r.total)}</td>
                  <td style={{ padding: '10px 14px', color: '#555' }}>{r.sucursal}</td>
                  <td style={{ padding: '10px 14px', color: '#999', fontSize: '0.82rem' }}>{new Date(r.fechaReserva).toLocaleDateString('es-DO')}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: estadoColor[r.estado]?.bg, color: estadoColor[r.estado]?.color, padding: '4px 12px', borderRadius: 20, fontSize: '0.76rem', fontWeight: 700 }}>
                      {r.estado}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {r.estado === 'Pendiente' && (
                      <button onClick={() => entregar(r.idApartado)} disabled={procesando === r.idApartado}
                        style={{ background: '#f0fdf4', color: '#22c55e', border: 'none', padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: procesando === r.idApartado ? 0.6 : 1 }}>
                        <CheckCircle size={13} /> {procesando === r.idApartado ? 'Procesando…' : 'Marcar retirado'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReservasStaff;
