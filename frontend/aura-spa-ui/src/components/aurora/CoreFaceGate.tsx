import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../../services/apiClient';
import { obtenerDescriptor, cargarModelos } from './rostro';
import AuroraRing from './AuroraRing';
import { ShieldCheck, ScanFace, AlertTriangle } from 'lucide-react';

type Estado = 'cargando' | 'sin-registro' | 'verificar' | 'verificando' | 'ok' | 'fallo';

/**
 * Segundo factor biométrico para el Core (panel de administración).
 * - Admin CON rostro registrado: debe verificarse para ver el Core.
 * - Admin SIN rostro registrado: entra igual, con sugerencia de registrarlo.
 * La verificación es 1:1 contra el descriptor del propio admin y se
 * recuerda durante la sesión del navegador.
 */
const CoreFaceGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [msg, setMsg] = useState('');
  const [intentos, setIntentos] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // La verificación expira a las 3 horas (con la sesión iniciada) y también
  // al salir de la aplicación (sessionStorage se borra al cerrar la pestaña).
  // El registro del rostro es permanente: nunca hay que volver a registrarlo.
  const VIGENCIA_MS = 3 * 60 * 60 * 1000;
  const ts = Number(sessionStorage.getItem('aura_core_verificado_ts') || 0);
  const yaVerificado = sessionStorage.getItem('aura_core_verificado') === '1'
    && ts > 0 && (Date.now() - ts) < VIGENCIA_MS;

  useEffect(() => {
    // Siempre consultamos el estado del registro: si el admin eliminó su
    // rostro, debe ver la alerta de sugerencia aunque se haya verificado antes.
    apiClient.get('/api/aurora/rostro/estado')
      .then(r => {
        if (!r.data.registrado) {
          sessionStorage.removeItem('aura_core_verificado');
          sessionStorage.removeItem('aura_core_verificado_ts');
          setEstado('sin-registro');
        } else {
          setEstado(yaVerificado ? 'ok' : 'verificar');
        }
      })
      .catch(() => setEstado('sin-registro'));
  }, [yaVerificado]);

  // Cámara activa solo durante la verificación
  useEffect(() => {
    if (estado !== 'verificar' && estado !== 'verificando' && estado !== 'fallo') return;
    if (streamRef.current) return;
    (async () => {
      try {
        cargarModelos();
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch { setMsg('No pude acceder a la cámara. Verifica los permisos.'); }
    })();
    return () => {
      // La cámara se apaga explícitamente al verificar con éxito
      // (detenerCamara) y al desmontar el componente (efecto aparte).
    };
  }, [estado]);

  // Apagar cámara al desmontar
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const detenerCamara = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const verificar = async () => {
    if (!videoRef.current) return;
    setEstado('verificando'); setMsg('');
    try {
      const descriptor = await obtenerDescriptor(videoRef.current);
      if (!descriptor) {
        setEstado('fallo'); setMsg('No detecté un rostro. Acércate y mejora la luz.'); return;
      }
      const r = await apiClient.post('/api/aurora/verificar-admin', { descriptor });
      if (r.data?.verificado) {
        sessionStorage.setItem('aura_core_verificado', '1');
        sessionStorage.setItem('aura_core_verificado_ts', String(Date.now()));
        detenerCamara();
        setEstado('ok');
      } else if (r.data?.sinRegistro) {
        detenerCamara();
        setEstado('sin-registro');
      } else {
        setIntentos(n => n + 1);
        setEstado('fallo');
        setMsg(r.data?.mensaje ?? 'El rostro no coincide.');
      }
    } catch { setEstado('fallo'); setMsg('Error de conexión con el servidor.'); }
  };

  if (estado === 'ok') return (
    <>
      {children}
      {/* Aviso discreto si entró sin rostro registrado */}
    </>
  );

  if (estado === 'cargando') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--aura-beige, #f6f1ea)' }}>
      <AuroraRing estado="procesando" size={120} />
    </div>
  );

  // Sin registro: dejar pasar con sugerencia (banner) — según diseño
  if (estado === 'sin-registro') return (
    <>
      <div style={{ background: 'linear-gradient(90deg, #fef3c7, #fde68a)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', color: '#92400e' }}>
        <AlertTriangle size={17} />
        <span>
          <strong>Sugerencia de seguridad:</strong> aún no has registrado tu rostro. Actívalo en
          <strong> Perfil › Seguridad</strong> para proteger el Core con verificación facial.
        </span>
      </div>
      {children}
    </>
  );

  // Pantalla de verificación (verificar / verificando / fallo)
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 20%, #2a2140 0%, #171226 60%, #0d0a18 100%)', padding: 24, textAlign: 'center',
    }}>
      <ShieldCheck size={34} color="#c084fc" style={{ marginBottom: 10 }} />
      <h2 style={{ color: '#f5f3ff', fontWeight: 700, marginBottom: 6 }}>Verificación de acceso al Core</h2>
      <p style={{ color: '#a78bfa', fontSize: '0.92rem', marginBottom: 22, maxWidth: 420 }}>
        El panel de administración está protegido con un segundo factor biométrico. Mira a la cámara para verificar tu identidad.
      </p>

      <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 0 0 3px rgba(168,85,247,0.55), 0 14px 40px rgba(0,0,0,0.5)' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: 340, maxWidth: '85vw', display: 'block', transform: 'scaleX(-1)' }} />
      </div>

      {msg && (
        <div style={{ marginTop: 14, background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(252,165,165,0.4)', color: '#fecaca', padding: '10px 18px', borderRadius: 12, fontSize: '0.86rem', maxWidth: 380 }}>
          {msg}
        </div>
      )}

      <button onClick={verificar} disabled={estado === 'verificando'} className="btn-AuraSpa"
              style={{ marginTop: 18, padding: '12px 30px', display: 'flex', alignItems: 'center', gap: 8, opacity: estado === 'verificando' ? 0.6 : 1 }}>
        <ScanFace size={17} /> {estado === 'verificando' ? 'Verificando…' : 'Verificar mi rostro'}
      </button>

      {intentos >= 2 && (
        <p style={{ color: '#8b7bb5', fontSize: '0.78rem', marginTop: 14, maxWidth: 380 }}>
          ¿Problemas con la verificación? Puedes actualizar tu registro facial desde Perfil › Seguridad
          (con otra sesión) o contactar a otro administrador.
        </p>
      )}
    </div>
  );
};

export default CoreFaceGate;
