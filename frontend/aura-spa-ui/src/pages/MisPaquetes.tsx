import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import apiClient from '../services/apiClient';

interface PaqueteCliente {
  idClientePaquete: number;
  nombre: string;
  categoria?: string | null;
  sesionesTotales: number;
  sesionesRestantes: number;
  fechaAdquisicion: string;
  fechaExpiracion?: string | null;
  estado: 'Activo' | 'Consumido' | 'Expirado';
}

const estadoConfig: Record<string, { color: string; bg: string; icono: React.ReactNode; label: string }> = {
  Activo:    { color: '#22c55e', bg: '#f0fdf4', icono: <CheckCircle size={14} />,   label: 'Activo' },
  Consumido: { color: '#888',    bg: '#f4f4f4', icono: <XCircle size={14} />,       label: 'Consumido' },
  Expirado:  { color: '#ef4444', bg: '#fef2f2', icono: <AlertTriangle size={14} />, label: 'Expirado' },
};

const MisPaquetes: React.FC = () => {
  const navigate = useNavigate();
  const [paquetes, setPaquetes] = useState<PaqueteCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get('/api/reservas/mis-paquetes')
      .then(res => setPaquetes(res.data))
      .catch(() => setError('No se pudieron cargar tus paquetes. Verifica tu conexión.'))
      .finally(() => setLoading(false));
  }, []);

  const formatFecha = (fecha: string) =>
    new Date(fecha).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--aura-beige)', padding: '40px 10%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ color: 'var(--aura-navy)', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Package size={26} color="var(--aura-lavender)" /> Mis Paquetes
          </h2>
          <p style={{ color: 'var(--aura-gray)', margin: 0, fontSize: '0.9rem' }}>Paquetes de sesiones que has adquirido y las que te quedan disponibles.</p>
        </div>
        <button onClick={() => navigate('/dashboard/client')} className="btn-outline-aura" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>← Volver</button>
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--aura-gray)', padding: '60px' }}>Cargando tus paquetes...</p>}
      {error && <p style={{ textAlign: 'center', color: '#c62828', padding: '30px', background: '#ffebee', borderRadius: '20px' }}>{error}</p>}

      {!loading && !error && (
        paquetes.length === 0 ? (
          <div className="card-aura" style={{ padding: '60px', textAlign: 'center' }}>
            <p style={{ color: 'var(--aura-gray)', margin: 0 }}>No tienes ningún paquete de sesiones activo por el momento.</p>
            <button className="btn-AuraSpa" onClick={() => navigate('/catalog')} style={{ marginTop: '20px', padding: '12px 30px' }}>
              Ver catálogo de servicios
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '18px' }}>
            {paquetes.map(p => {
              const config = estadoConfig[p.estado] ?? estadoConfig['Activo'];
              const porcentaje = p.sesionesTotales > 0 ? Math.round((p.sesionesRestantes / p.sesionesTotales) * 100) : 0;
              return (
                <div key={p.idClientePaquete} className="card-aura" style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <h4 style={{ fontWeight: 'bold', margin: 0, color: 'var(--aura-navy)' }}>{p.nombre}</h4>
                    <span style={{ background: config.bg, color: config.color, padding: '3px 12px', borderRadius: '30px', fontSize: '0.76rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                      {config.icono} {config.label}
                    </span>
                  </div>
                  {p.categoria && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0 0 14px' }}>{p.categoria}</p>}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--aura-gray)' }}>Sesiones restantes</span>
                    <strong style={{ color: 'var(--aura-navy)' }}>{p.sesionesRestantes} de {p.sesionesTotales}</strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#f0edf5', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
                    <div style={{ width: `${porcentaje}%`, height: '100%', background: 'var(--aura-lavender)', borderRadius: '10px' }} />
                  </div>

                  <div style={{ borderTop: '1px solid #f0edf5', paddingTop: '12px', fontSize: '0.8rem', color: 'var(--aura-gray)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>Adquirido</span><span>{formatFecha(p.fechaAdquisicion)}</span>
                    </div>
                    {p.fechaExpiracion && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Vence</span><span>{formatFecha(p.fechaExpiracion)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};

export default MisPaquetes;
