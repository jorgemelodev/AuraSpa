import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import AuroraRing, { type EstadoAurora } from './AuroraRing';
import { useAuroraVoz, hablar, sonidoActivacion, type Idioma } from './useAuroraVoz';
import type { AuroraAbrirDetalle } from './auroraBus';
import { Mic, Calendar, Sparkles, Clock, MapPin, DollarSign, X, Keyboard, UserCheck } from 'lucide-react';

type Fase = 'dormida' | 'menu' | 'conversando';

interface Burbuja { rol: 'aurora' | 'usuario'; texto: string; }

const TXT = {
  es: {
    escuchando: 'Di "Hola Aurora"',
    menuTitulo: '¿Cómo te ayudo hoy?',
    opServicios: 'Ver servicios', opPrecios: 'Consultar precios',
    opHorarios: 'Horarios', opUbicacion: 'Ubicación', opAgendar: 'Agendar cita',
    opCheckin: 'Verificar llegada de cliente', opHablar: 'Hablar con Aurora',
    escribir: 'Escribe tu consulta…', cerrar: 'Cerrar', dictando: 'Te escucho…',
  },
  en: {
    escuchando: 'Say "Hey Aurora"',
    menuTitulo: 'How can I help you today?',
    opServicios: 'View services', opPrecios: 'Check prices',
    opHorarios: 'Hours', opUbicacion: 'Location', opAgendar: 'Book appointment',
    opCheckin: 'Verify client arrival', opHablar: 'Talk to Aurora',
    escribir: 'Type your question…', cerrar: 'Close', dictando: 'Listening…',
  },
};

/**
 * Aurora — asistente de voz global de AuraSpa.
 * Montada en toda la app: escucha pasiva del wake word y overlay de
 * activación con congelamiento de pantalla, anillo premium y menú.
 * El staff ve además el acceso directo a verificación de llegada.
 */
const AuroraKiosk: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const esStaff = isAuthenticated && ['Admin', 'Cajero', 'Especialista'].includes(user?.perfil || '');

  const [fase, setFase] = useState<Fase>('dormida');
  const [idioma, setIdioma] = useState<Idioma>('es');
  const [estadoRing, setEstadoRing] = useState<EstadoAurora>('idle');
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [inputTexto, setInputTexto] = useState('');
  const [ultimaConsulta, setUltimaConsulta] = useState<string | null>(null);
  const t = TXT[idioma];
  const activa = fase !== 'dormida';

  // ── Activación por wake word con idioma inteligente ────────────
  const despertar = useCallback((idiomaDetectado: Idioma) => {
    setIdioma(idiomaDetectado);
    sonidoActivacion();                       // BIP relajante
    setFase('menu');                          // menú obligatorio, no habla sola
    setEstadoRing('escuchando');
    setBurbujas([]);
  }, []);

  const apagar = useCallback(() => {
    speechSynthesis.cancel();
    setFase('dormida'); setEstadoRing('idle');
    setBurbujas([]); setInputTexto('');
  }, []);

  // Cierra el overlay SIN cortar la voz (para navegar mientras termina de hablar)
  const apagarSuave = useCallback(() => {
    setFase('dormida'); setEstadoRing('idle');
    setBurbujas([]); setInputTexto('');
  }, []);

  // ── Conversación con el backend ─────────────────────────────────
  const enviarAurora = useCallback(async (texto: string, idiomaMsg: Idioma) => {
    setUltimaConsulta(texto);
    setBurbujas(prev => [...prev, { rol: 'usuario', texto }]);
    setEstadoRing('procesando');
    try {
      const r = await apiClient.post('/api/aurora/mensaje', { texto, idioma: idiomaMsg });
      const { texto: respuesta, accion, datos } = r.data as { texto: string; accion?: string; datos?: Record<string, string> };
      setBurbujas(prev => [...prev, { rol: 'aurora', texto: respuesta }]);
      setEstadoRing('hablando');

      // Destino según la acción (se navega cuando Aurora TERMINA de hablar)
      let destino: string | null = null;
      if (accion === 'agendar') {
        const qs = new URLSearchParams(datos ?? {}).toString();
        destino = qs ? `/agendamiento?${qs}` : '/agendamiento';
      } else if (accion === 'catalogo') destino = '/catalog';
      else if (accion === 'checkin') destino = '/checkin-cliente';
      else if (accion === 'reportes') {
        const qs = new URLSearchParams(datos ?? {}).toString();
        destino = qs ? `/reportes?${qs}` : '/reportes';
      }
      else if (accion === 'mis-citas') destino = '/mis-citas';
      else if (accion === 'citas-especialista') destino = '/citas-especialista';
      else if (accion === 'caja') destino = '/caja';
      else if (accion === 'cuentas-por-cobrar') destino = '/cuentas-por-cobrar';
      else if (accion === 'core') destino = '/core';

      hablar(respuesta, idiomaMsg, () => {
        setEstadoRing('escuchando');
        if (destino) { apagarSuave(); navigate(destino); }
      });
    } catch {
      const err = idiomaMsg === 'es' ? 'Tuve un problema de conexión. Intenta de nuevo.' : 'I had a connection problem. Please try again.';
      setBurbujas(prev => [...prev, { rol: 'aurora', texto: err }]);
      setEstadoRing('escuchando');
    }
  }, [navigate, apagarSuave]);

  const { soportado, transcripcion } = useAuroraVoz({
    activo: fase === 'dormida' || fase === 'conversando',
    modoDictado: fase === 'conversando',
    idioma,
    onWake: despertar,
    onFrase: (frase) => enviarAurora(frase, idioma),
  });

  // ── Bus de eventos: cualquier botón de la app puede abrir Aurora ──
  useEffect(() => {
    const handler = (e: Event) => {
      const { idioma: idm, consulta } = (e as CustomEvent<AuroraAbrirDetalle>).detail || { idioma: 'es' as Idioma };
      setIdioma(idm);
      sonidoActivacion();
      setBurbujas([]);
      if (consulta) {
        setFase('conversando');
        setEstadoRing('procesando');
        enviarAurora(consulta, idm);
      } else {
        setFase('menu');
        setEstadoRing('escuchando');
      }
    };
    window.addEventListener('aurora:abrir', handler);
    return () => window.removeEventListener('aurora:abrir', handler);
  }, [enviarAurora]);

  // ── Menú obligatorio de configuración ───────────────────────────
  const opcionMenu = (op: string) => {
    if (op === 'checkin') { apagar(); navigate('/checkin-cliente'); return; }
    if (op === 'agendar') { apagar(); navigate('/agendamiento'); return; }
    if (op === 'hablar') {
      setFase('conversando'); setEstadoRing('escuchando');
      const saludo = idioma === 'es'
        ? 'Te escucho. Pregúntame lo que necesites.'
        : "I'm listening. Ask me anything you need.";
      setBurbujas([{ rol: 'aurora', texto: saludo }]);
      hablar(saludo, idioma);
      return;
    }
    // servicios / precios / horarios / ubicacion → consulta directa
    setFase('conversando');
    const consultas: Record<string, Record<Idioma, string>> = {
      servicios: { es: '¿Qué servicios ofrecen?', en: 'What services do you offer?' },
      precios:   { es: '¿Cuáles son los precios?', en: 'What are the prices?' },
      horarios:  { es: '¿Cuál es el horario?', en: 'What are your hours?' },
      ubicacion: { es: '¿Dónde están ubicados?', en: 'Where are you located?' },
    };
    enviarAurora(consultas[op][idioma], idioma);
  };

  // ── Estilos base ────────────────────────────────────────────────
  const chip: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 22px',
    borderRadius: '18px', border: '1px solid rgba(192,132,252,0.35)',
    background: 'rgba(124,58,237,0.15)', color: '#ede9fe', cursor: 'pointer',
    fontSize: '1rem', fontWeight: 600, backdropFilter: 'blur(4px)', transition: 'all .2s',
  };

  return (
    <>
      {/* ── Indicador de escucha pasiva (discreto, global) ── */}
      {!activa && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 900,
          display: 'flex', alignItems: 'center', gap: 9, padding: '9px 16px', borderRadius: 40,
          background: 'rgba(23,18,38,0.88)', color: '#d8b4fe', fontSize: '0.82rem', fontWeight: 600,
          boxShadow: '0 8px 30px rgba(124,58,237,0.35)', backdropFilter: 'blur(6px)', cursor: 'pointer' }}
          onClick={() => despertar('es')} title={`${t.escuchando} / "Hey Aurora"`}>
          <span style={{ position: 'relative', display: 'inline-flex', width: 9, height: 9 }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#a855f7', animation: 'aurora-halo 1.8s infinite' }} />
            <span style={{ position: 'relative', width: 9, height: 9, borderRadius: '50%', background: '#a855f7' }} />
          </span>
          {soportado ? <Mic size={14} /> : <Sparkles size={14} />}
          Aurora
        </div>
      )}

      {/* ── OVERLAY: congelamiento de pantalla (backdrop-blur + bg oscuro) ── */}
      {activa && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1500,
          background: 'rgba(10,7,20,0.55)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'aurora-fade .35s ease', padding: '24px', overflowY: 'auto',
        }}>
          <button onClick={apagar} title={t.cerrar} style={{ position: 'absolute', top: 22, right: 26, background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', borderRadius: '50%', padding: 10, cursor: 'pointer' }}>
            <X size={20} />
          </button>

          {/* Anillo premium con logo botánico */}
          <AuroraRing estado={estadoRing} size={fase === 'menu' ? 200 : 150} />

          {/* Selector de idioma detectado */}
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            {(['es', 'en'] as Idioma[]).map(l => (
              <button key={l} onClick={() => {
                if (l === idioma) return;
                setIdioma(l);
                if (fase === 'conversando' && ultimaConsulta) {
                  // Reconsultar la última pregunta en el nuevo idioma (retraduce la respuesta)
                  setBurbujas([]);
                  speechSynthesis.cancel();
                  enviarAurora(ultimaConsulta, l);
                }
              }} style={{
                padding: '5px 16px', borderRadius: 20, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
                border: '1px solid rgba(192,132,252,0.5)',
                background: idioma === l ? 'linear-gradient(135deg,#a855f7,#6B5B93)' : 'transparent',
                color: idioma === l ? 'white' : '#c4b5fd',
              }}>{l.toUpperCase()}</button>
            ))}
          </div>

          {/* ── MENÚ OBLIGATORIO DE CONFIGURACIÓN ── */}
          {fase === 'menu' && (
            <div style={{ marginTop: 28, textAlign: 'center', animation: 'aurora-up .4s ease' }}>
              <h2 style={{ color: '#f5f3ff', fontWeight: 700, marginBottom: 22, letterSpacing: '0.5px' }}>{t.menuTitulo}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, maxWidth: 720 }}>
                <button className="aurora-chip" style={chip} onClick={() => opcionMenu('servicios')}><Sparkles size={18} color="#c084fc" /> {t.opServicios}</button>
                <button className="aurora-chip" style={chip} onClick={() => opcionMenu('precios')}><DollarSign size={18} color="#c084fc" /> {t.opPrecios}</button>
                <button className="aurora-chip" style={chip} onClick={() => opcionMenu('horarios')}><Clock size={18} color="#c084fc" /> {t.opHorarios}</button>
                <button className="aurora-chip" style={chip} onClick={() => opcionMenu('ubicacion')}><MapPin size={18} color="#c084fc" /> {t.opUbicacion}</button>
                <button className="aurora-chip" style={{ ...chip, gridColumn: esStaff ? undefined : '1 / -1', justifyContent: 'center' }} onClick={() => opcionMenu('agendar')}>
                  <Calendar size={18} color="#c084fc" /> {t.opAgendar}
                </button>
                {esStaff && (
                  <button className="aurora-chip" style={chip} onClick={() => opcionMenu('checkin')}><UserCheck size={18} color="#c084fc" /> {t.opCheckin}</button>
                )}
                <button className="aurora-chip" style={{ ...chip, gridColumn: '1 / -1', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(168,85,247,0.35), rgba(107,91,147,0.35))' }}
                        onClick={() => opcionMenu('hablar')}>
                  <Mic size={18} color="#e9d5ff" /> {t.opHablar}
                </button>
              </div>
            </div>
          )}

          {/* ── CONVERSACIÓN (voz + texto) ── */}
          {fase === 'conversando' && (
            <div style={{ marginTop: 24, width: '100%', maxWidth: 560, animation: 'aurora-up .4s ease' }}>
              <div style={{ maxHeight: '34vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}>
                {burbujas.map((b, i) => (
                  <div key={i} style={{
                    alignSelf: b.rol === 'usuario' ? 'flex-end' : 'flex-start', maxWidth: '85%',
                    padding: '12px 16px', borderRadius: b.rol === 'usuario' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: b.rol === 'usuario' ? 'linear-gradient(135deg,#7c3aed,#6B5B93)' : 'rgba(255,255,255,0.94)',
                    color: b.rol === 'usuario' ? 'white' : '#2a2140', fontSize: '0.92rem', lineHeight: 1.5,
                  }}>
                    {b.texto.split('\n').map((ln, j) => (
                      <span key={j}>{ln.split(/\*\*(.*?)\*\*/g).map((p, k) => k % 2 === 1 ? <strong key={k}>{p}</strong> : p)}{j < b.texto.split('\n').length - 1 && <br />}</span>
                    ))}
                  </div>
                ))}
              </div>

              {/* Transcripción en vivo */}
              <div style={{ textAlign: 'center', minHeight: 22, color: '#c4b5fd', fontSize: '0.85rem', fontStyle: 'italic', margin: '10px 0' }}>
                {soportado && estadoRing === 'escuchando' ? (transcripcion ? `"${transcripcion}"` : t.dictando) : ''}
              </div>

              {/* Entrada por texto (fallback accesible) */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Keyboard size={15} style={{ position: 'absolute', left: 14, top: 14, color: '#a78bfa' }} />
                  <input value={inputTexto} onChange={e => setInputTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && inputTexto.trim()) { enviarAurora(inputTexto.trim(), idioma); setInputTexto(''); } }}
                    placeholder={t.escribir}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px 12px 38px', borderRadius: 24, border: '1px solid rgba(192,132,252,0.4)', background: 'rgba(255,255,255,0.1)', color: 'white', outline: 'none', fontSize: '0.9rem' }} />
                </div>
                <button onClick={() => { if (inputTexto.trim()) { enviarAurora(inputTexto.trim(), idioma); setInputTexto(''); } }}
                  className="btn-AuraSpa" style={{ borderRadius: 24, padding: '0 22px' }}>➤</button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes aurora-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes aurora-up { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .aurora-chip:hover { background: rgba(168,85,247,0.35) !important; border-color: rgba(216,180,254,0.8) !important; transform: translateY(-2px); }
        .aurora-chip:active { transform: scale(0.97); background: rgba(168,85,247,0.5) !important; }
      `}</style>
    </>
  );
};

export default AuroraKiosk;
