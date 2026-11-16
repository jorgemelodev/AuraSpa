import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, CheckCircle, Loader2, Plus } from 'lucide-react';
import apiClient from '../services/apiClient';

interface PaqueteCliente {
  idClientePaquete: number;
  idCliente: number;
  cliente: string;
  paquete: string;
  sesionesTotales: number;
  sesionesRestantes: number;
  fechaAdquisicion: string;
  fechaExpiracion?: string | null;
  estado: 'Activo' | 'Consumido' | 'Expirado';
}

interface ClienteAtendido { idCliente: number; nombre: string; }
interface PaqueteCatalogo { idPaquete: number; nombre: string; categoria?: string; precio: number; sesiones: number; }

const PaquetesEspecialista: React.FC = () => {
  const navigate = useNavigate();
  const [paquetes, setPaquetes] = useState<PaqueteCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ id: number; texto: string; ok: boolean } | null>(null);

  // Asignar paquete nuevo
  const [clientesAtendidos, setClientesAtendidos] = useState<ClienteAtendido[]>([]);
  const [catalogoPaquetes,  setCatalogoPaquetes]  = useState<PaqueteCatalogo[]>([]);
  const [asignarClienteId,  setAsignarClienteId]  = useState('');
  const [asignarPaqueteId,  setAsignarPaqueteId]  = useState('');
  const [asignarVencimiento, setAsignarVencimiento] = useState('');
  const [asignando,   setAsignando]   = useState(false);
  const [asignarMsg,  setAsignarMsg]  = useState<{ texto: string; ok: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/paquetes/mis-clientes');
      setPaquetes(res.data);
      setError('');
    } catch {
      setError('No se pudieron cargar los paquetes de tus clientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    apiClient.get('/api/paquetes/mis-clientes-atendidos').then(res => setClientesAtendidos(res.data)).catch(() => {});
    apiClient.get('/api/paquetes/catalogo').then(res => setCatalogoPaquetes(res.data)).catch(() => {});
  }, []);

  const asignarPaquete = async () => {
    if (!asignarClienteId || !asignarPaqueteId) return;
    setAsignando(true);
    setAsignarMsg(null);
    try {
      await apiClient.post('/api/paquetes/asignar', {
        idCliente: Number(asignarClienteId),
        idPaquete: Number(asignarPaqueteId),
        fechaExpiracion: asignarVencimiento || null,
      });
      setAsignarMsg({ texto: 'Paquete asignado correctamente.', ok: true });
      setAsignarClienteId(''); setAsignarPaqueteId(''); setAsignarVencimiento('');
      await cargar();
    } catch (err: any) {
      const msg = err.response?.data;
      setAsignarMsg({ texto: typeof msg === 'string' ? msg : 'No se pudo asignar el paquete.', ok: false });
    } finally {
      setAsignando(false);
    }
  };

  const registrarSesion = async (id: number) => {
    setProcesando(id);
    setMensaje(null);
    try {
      const res = await apiClient.put(`/api/paquetes/${id}/registrar-sesion`);
      setPaquetes(prev => prev.map(p => p.idClientePaquete === id
        ? { ...p, sesionesRestantes: res.data.sesionesRestantes, estado: res.data.estado }
        : p));
      setMensaje({ id, texto: 'Sesión registrada.', ok: true });
    } catch (err: any) {
      const msg = err.response?.data;
      setMensaje({ id, texto: typeof msg === 'string' ? msg : 'No se pudo registrar la sesión.', ok: false });
    } finally {
      setProcesando(null);
    }
  };

  const formatFecha = (fecha: string) =>
    new Date(fecha).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--aura-beige)', padding: '40px 8%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ color: 'var(--aura-navy)', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Gift size={26} color="#db2777" /> Paquetes de mis Clientes
          </h2>
          <p style={{ color: 'var(--aura-gray)', margin: 0, fontSize: '0.9rem' }}>Paquetes activos de los clientes que has atendido — registra una sesión al completarla.</p>
        </div>
        <button onClick={() => navigate('/dashboard/staff')} className="btn-outline-aura" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>← Volver</button>
      </div>

      <div className="card-aura" style={{ padding: '25px', marginBottom: '25px' }}>
        <h4 style={{ fontWeight: 700, color: 'var(--aura-navy)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> Asignar paquete a un cliente
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.3fr auto', gap: '12px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--aura-gray)', marginBottom: '4px' }}>Cliente</label>
            <select value={asignarClienteId} onChange={e => setAsignarClienteId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd', outline: 'none', fontSize: '0.85rem' }}>
              <option value="">Selecciona un cliente...</option>
              {clientesAtendidos.map(c => <option key={c.idCliente} value={c.idCliente}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--aura-gray)', marginBottom: '4px' }}>Paquete</label>
            <select value={asignarPaqueteId} onChange={e => setAsignarPaqueteId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd', outline: 'none', fontSize: '0.85rem' }}>
              <option value="">Selecciona un paquete...</option>
              {catalogoPaquetes.map(p => <option key={p.idPaquete} value={p.idPaquete}>{p.nombre} ({p.sesiones} sesiones)</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--aura-gray)', marginBottom: '4px' }}>Vence (opcional)</label>
            <input type="date" value={asignarVencimiento} onChange={e => setAsignarVencimiento(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd', outline: 'none', fontSize: '0.85rem' }} />
          </div>
          <button onClick={asignarPaquete} disabled={!asignarClienteId || !asignarPaqueteId || asignando}
            className="btn-AuraSpa" style={{ padding: '11px 18px', fontSize: '0.85rem', opacity: (!asignarClienteId || !asignarPaqueteId || asignando) ? 0.6 : 1 }}>
            {asignando ? <Loader2 size={14} className="animate-spin" /> : 'Asignar'}
          </button>
        </div>
        {asignarMsg && (
          <p style={{ marginTop: '12px', fontSize: '0.82rem', color: asignarMsg.ok ? '#22c55e' : '#ef4444' }}>{asignarMsg.texto}</p>
        )}
        {clientesAtendidos.length === 0 && (
          <p style={{ marginTop: '12px', fontSize: '0.8rem', color: '#999' }}>Aún no has atendido a ningún cliente, así que no hay nadie a quien asignarle un paquete todavía.</p>
        )}
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--aura-gray)', padding: '60px' }}>Cargando...</p>}
      {error && <p style={{ textAlign: 'center', color: '#c62828', padding: '30px', background: '#ffebee', borderRadius: '20px' }}>{error}</p>}

      {!loading && !error && (
        paquetes.length === 0 ? (
          <div className="card-aura" style={{ padding: '60px', textAlign: 'center' }}>
            <p style={{ color: 'var(--aura-gray)', margin: 0 }}>Ninguno de tus clientes tiene paquetes activos por el momento.</p>
          </div>
        ) : (
          <div className="card-aura" style={{ overflow: 'hidden', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#faf8ff', textAlign: 'left' }}>
                  {['Cliente', 'Paquete', 'Sesiones', 'Adquirido', 'Vence', 'Estado', 'Acción'].map(c => (
                    <th key={c} style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--aura-gray)', fontWeight: 700 }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paquetes.map((p, i) => (
                  <tr key={p.idClientePaquete} style={{ borderBottom: '1px solid #f0edf5', background: i % 2 === 0 ? 'white' : '#faf9ff' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--aura-navy)' }}>{p.cliente}</td>
                    <td style={{ padding: '10px 14px', color: '#555' }}>{p.paquete}</td>
                    <td style={{ padding: '10px 14px', color: '#555' }}>{p.sesionesRestantes} de {p.sesionesTotales}</td>
                    <td style={{ padding: '10px 14px', color: '#999', fontSize: '0.82rem' }}>{formatFecha(p.fechaAdquisicion)}</td>
                    <td style={{ padding: '10px 14px', color: '#999', fontSize: '0.82rem' }}>{p.fechaExpiracion ? formatFecha(p.fechaExpiracion) : '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        background: p.estado === 'Activo' ? '#f0fdf4' : p.estado === 'Expirado' ? '#fef2f2' : '#f4f4f4',
                        color: p.estado === 'Activo' ? '#22c55e' : p.estado === 'Expirado' ? '#ef4444' : '#888',
                        padding: '4px 12px', borderRadius: 20, fontSize: '0.76rem', fontWeight: 700
                      }}>{p.estado}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {p.estado === 'Activo' && p.sesionesRestantes > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          <button onClick={() => registrarSesion(p.idClientePaquete)} disabled={procesando === p.idClientePaquete}
                            style={{ background: '#fdf2f8', color: '#db2777', border: 'none', padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: procesando === p.idClientePaquete ? 0.6 : 1 }}>
                            {procesando === p.idClientePaquete ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                            {procesando === p.idClientePaquete ? 'Procesando…' : 'Registrar sesión'}
                          </button>
                          {mensaje?.id === p.idClientePaquete && (
                            <span style={{ fontSize: '0.74rem', color: mensaje.ok ? '#22c55e' : '#ef4444' }}>{mensaje.texto}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
};

export default PaquetesEspecialista;
