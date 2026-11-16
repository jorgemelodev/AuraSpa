import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../../services/apiClient';
import { obtenerDescriptorPromedio, cargarModelos } from './rostro';
import { ScanFace, Trash2, CheckCircle, Camera } from 'lucide-react';

/**
 * Registro de rostro (enrolamiento) — se muestra en Perfil › Seguridad.
 * Captura 3 muestras, promedia el descriptor de 128 dimensiones y lo
 * guarda vía POST /api/aurora/rostro/registrar. Sin fotos.
 * Usos: 2º factor del Core (Admin) y check-in de clientes en recepción.
 */
const RegistroRostro: React.FC = () => {
  const [registrado, setRegistrado] = useState<boolean | null>(null);
  const [fechaRegistro, setFechaRegistro] = useState<string | null>(null);
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    apiClient.get('/api/aurora/rostro/estado')
      .then(r => { setRegistrado(r.data.registrado); setFechaRegistro(r.data.fecha); })
      .catch(() => setRegistrado(false));
    return () => detenerCamara();
  }, []);

  const detenerCamara = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamaraActiva(false);
  };

  const iniciarCamara = async () => {
    setMsg(null);
    try {
      cargarModelos(); // precarga en paralelo
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
      streamRef.current = stream;
      setCamaraActiva(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 50);
    } catch {
      setMsg({ tipo: 'error', texto: 'No pude acceder a la cámara. Verifica los permisos del navegador.' });
    }
  };

  const capturar = async () => {
    if (!videoRef.current) return;
    setCapturando(true); setProgreso(0); setMsg(null);
    try {
      const descriptor = await obtenerDescriptorPromedio(videoRef.current, 3, setProgreso);
      if (!descriptor) {
        setMsg({ tipo: 'error', texto: 'No detecté un rostro. Acércate, mejora la luz e intenta de nuevo.' });
        return;
      }
      const r = await apiClient.post('/api/aurora/rostro/registrar', { descriptor });
      setRegistrado(true);
      setFechaRegistro(new Date().toISOString());
      setMsg({ tipo: 'ok', texto: r.data?.mensaje ?? 'Rostro registrado correctamente.' });
      detenerCamara();
    } catch {
      setMsg({ tipo: 'error', texto: 'Error al guardar el registro. Intenta de nuevo.' });
    } finally { setCapturando(false); }
  };

  const eliminar = async () => {
    if (!window.confirm('¿Eliminar tu registro facial? Dejarás de poder verificarte por rostro.')) return;
    try {
      await apiClient.delete('/api/aurora/rostro');
      sessionStorage.removeItem('aura_core_verificado');
      sessionStorage.removeItem('aura_core_verificado_ts');
      setRegistrado(false); setFechaRegistro(null);
      setMsg({ tipo: 'ok', texto: 'Registro facial eliminado.' });
    } catch { setMsg({ tipo: 'error', texto: 'No se pudo eliminar. Intenta de nuevo.' }); }
  };

  return (
    <div className="card-aura" style={{ padding: '35px', marginTop: '25px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <ScanFace size={22} color="var(--aura-lavender)" />
        <h3 style={{ color: 'var(--aura-navy)', fontWeight: 'bold', margin: 0 }}>Reconocimiento facial (Aurora)</h3>
      </div>
      <p style={{ color: 'var(--aura-gray)', fontSize: '0.9rem', marginBottom: 20 }}>
        Exclusivo para administradores: registra tu rostro para proteger el acceso al
        <strong> Core</strong> (panel administrativo) con verificación facial. Solo se guarda
        un vector matemático de 128 números — <strong>nunca se almacenan fotos</strong> (Ley 172-13).
      </p>

      {msg && (
        <div style={{
          background: msg.tipo === 'ok' ? '#f0fdf4' : '#ffebee',
          color: msg.tipo === 'ok' ? '#22c55e' : '#c62828',
          padding: '13px', borderRadius: '12px', marginBottom: '18px',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem',
        }}>
          {msg.tipo === 'ok' && <CheckCircle size={16} />} {msg.texto}
        </div>
      )}

      {registrado === null ? (
        <p style={{ color: '#999', fontSize: '0.85rem' }}>Cargando estado…</p>
      ) : registrado && !camaraActiva ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '8px 16px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={15} /> Rostro registrado
            {fechaRegistro && <span style={{ fontWeight: 400, color: '#4b8f5f' }}>· {new Date(fechaRegistro).toLocaleDateString('es-DO')}</span>}
          </span>
          <button onClick={iniciarCamara} className="btn-AuraSpa" style={{ padding: '9px 18px', fontSize: '0.85rem' }}>
            Actualizar rostro
          </button>
          <button onClick={eliminar} style={{ padding: '9px 16px', borderRadius: 12, border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      ) : !camaraActiva ? (
        <button onClick={iniciarCamara} className="btn-AuraSpa" style={{ padding: '11px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Camera size={17} /> Registrar mi rostro
        </button>
      ) : null}

      {camaraActiva && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'inline-block', borderRadius: 18, overflow: 'hidden', boxShadow: '0 0 0 3px rgba(168,85,247,0.5)' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: 320, display: 'block', transform: 'scaleX(-1)' }} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={capturar} disabled={capturando} className="btn-AuraSpa" style={{ padding: '10px 22px', opacity: capturando ? 0.6 : 1 }}>
              {capturando ? `Capturando… ${progreso}/3` : 'Capturar (3 muestras)'}
            </button>
            <button onClick={detenerCamara} disabled={capturando} style={{ padding: '10px 18px', borderRadius: 12, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '0.85rem' }}>
              Cancelar
            </button>
          </div>
          <p style={{ color: '#999', fontSize: '0.78rem', marginTop: 8 }}>
            Mira de frente a la cámara con buena luz. La primera vez tarda unos segundos en cargar el modelo.
          </p>
        </div>
      )}
    </div>
  );
};

export default RegistroRostro;
