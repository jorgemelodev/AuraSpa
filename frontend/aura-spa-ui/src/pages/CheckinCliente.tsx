import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/apiClient';
import { ArrowLeft, UserCheck, Bell, IdCard } from 'lucide-react';

interface Resultado {
  reconocido: boolean;
  nombre?: string;
  mensaje: string;
  proximaCita?: string;
}

/**
 * Verificación de llegada de clientes (staff).
 * El empleado ingresa la cédula o pasaporte del cliente: el backend confirma
 * su identidad y su cita de hoy, guarda la Notificacion para el staff y
 * alerta a recepción en tiempo real por SignalR.
 * (El Face ID es exclusivo del Admin para el acceso al Core.)
 */
const CheckinCliente: React.FC = () => {
  const navigate = useNavigate();
  const [verificando, setVerificando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [tipoDoc, setTipoDoc] = useState<'cedula' | 'pasaporte'>('cedula');
  const [documento, setDocumento] = useState('');

  const formatearDocumento = (valor: string) => {
    if (tipoDoc === 'cedula') {
      let v = valor.replace(/\D/g, '');
      if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3);
      if (v.length > 11) v = v.slice(0, 11) + '-' + v.slice(11);
      return v.slice(0, 13);
    }
    return valor.toUpperCase().slice(0, 20);
  };

  const verificar = async () => {
    if (!documento) return;
    setVerificando(true); setResultado(null);
    try {
      const r = await apiClient.post('/api/aurora/checkin', { documento });
      setResultado({
        reconocido: r.data.reconocido,
        nombre: r.data.nombre,
        mensaje: r.data.reconocido
          ? r.data.mensaje
          : `No encontré a nadie con ese ${tipoDoc === 'cedula' ? 'número de cédula' : 'pasaporte'}. Verifica el número o registra al cliente.`,
        proximaCita: r.data.proximaCita,
      });
      if (r.data.reconocido) setDocumento('');
    } catch {
      setResultado({ reconocido: false, mensaje: 'Error de conexión con el servidor.' });
    } finally { setVerificando(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--aura-beige, #f6f1ea)', padding: '30px 20px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--aura-navy)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, fontSize: '0.9rem' }}>
          <ArrowLeft size={16} /> Volver
        </button>

        <div className="card-aura" style={{ padding: '35px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
            <UserCheck size={24} color="var(--aura-lavender)" />
            <h2 style={{ color: 'var(--aura-navy)', fontWeight: 'bold', margin: 0 }}>Verificación de llegada</h2>
          </div>
          <p style={{ color: 'var(--aura-gray)', fontSize: '0.9rem', marginBottom: 26 }}>
            Verifica la identidad del cliente para confirmar su cita de hoy.
            Recepción recibirá la alerta al instante. <Bell size={13} style={{ verticalAlign: '-2px' }} />
          </p>

          <div style={{ margin: '0 auto', maxWidth: 380 }}>
            <div style={{ marginBottom: 10, textAlign: 'left' }}>
              <select value={tipoDoc}
                onChange={e => { setTipoDoc(e.target.value as 'cedula' | 'pasaporte'); setDocumento(''); setResultado(null); }}
                style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 14, border: '1px solid #ddd', outline: 'none', fontSize: '0.9rem', background: 'white' }}>
                <option value="cedula">Cédula del cliente</option>
                <option value="pasaporte">Pasaporte del cliente</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <IdCard size={16} style={{ position: 'absolute', left: 13, top: 14, color: '#a78bfa' }} />
                <input value={documento}
                  onChange={e => setDocumento(formatearDocumento(e.target.value))}
                  onKeyDown={e => { if (e.key === 'Enter') verificar(); }}
                  placeholder={tipoDoc === 'cedula' ? '000-0000000-0' : 'Número de pasaporte'}
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', padding: '13px 12px 13px 38px', borderRadius: 14, border: '1px solid #ddd', outline: 'none', fontSize: '0.95rem' }} />
              </div>
              <button onClick={verificar} disabled={verificando || !documento} className="btn-AuraSpa"
                style={{ padding: '0 26px', opacity: (!documento || verificando) ? 0.5 : 1 }}>
                {verificando ? 'Verificando…' : 'Verificar'}
              </button>
            </div>
          </div>

          {resultado && (
            <div style={{
              marginTop: 22, padding: '16px 20px', borderRadius: 16, textAlign: 'left',
              background: resultado.reconocido ? '#f0fdf4' : '#fff7ed',
              border: `1px solid ${resultado.reconocido ? '#bbf7d0' : '#fed7aa'}`,
              color: resultado.reconocido ? '#166534' : '#9a3412', fontSize: '0.92rem', lineHeight: 1.5,
            }}>
              {resultado.reconocido && resultado.nombre && (
                <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ {resultado.nombre}{resultado.proximaCita ? ` — cita a las ${resultado.proximaCita}` : ''}</div>
              )}
              {resultado.mensaje}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckinCliente;
