import React, { useEffect, useState } from 'react';
import { abrirAurora } from '../components/aurora/auroraBus';
import { Sparkles, Mic, DollarSign, Clock, MapPin, Hand } from 'lucide-react';

/**
 * Pantalla de quiosco del spa (/kiosko).
 * Se deja abierta en la tablet/pantalla de recepción. Aurora (global)
 * escucha el wake word; estos botones táctiles son el equivalente
 * funcional para clientes que prefieren tocar en vez de hablar.
 */
const Kiosko: React.FC = () => {
  const [hora, setHora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
    padding: '22px 26px', borderRadius: 22, cursor: 'pointer',
    border: '1px solid rgba(192,132,252,0.35)', background: 'rgba(124,58,237,0.16)',
    color: '#ede9fe', fontSize: '1.05rem', fontWeight: 600,
    backdropFilter: 'blur(4px)', transition: 'all .18s', width: '100%',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 20%, #2a2140 0%, #171226 55%, #0d0a18 100%)',
      color: 'white', textAlign: 'center', padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Sparkles size={30} color="#c084fc" />
        <h1 style={{ fontSize: '2.6rem', fontWeight: 300, letterSpacing: '6px', margin: 0 }}>
          AURA<span style={{ fontWeight: 700, color: '#c084fc' }}>SPA</span>
        </h1>
      </div>
      <p style={{ color: '#a78bfa', fontSize: '1rem', letterSpacing: '2px', marginBottom: 4 }}>
        BIENVENIDA · WELCOME
      </p>
      <p style={{ color: '#6d5f94', fontSize: '0.9rem', marginBottom: 34 }}>
        {hora.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
      </p>

      {/* Activación principal: por voz o por toque */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, width: '100%', maxWidth: 620, marginBottom: 26 }}>
        <button className="kiosko-btn" style={{ ...btn, background: 'linear-gradient(135deg, rgba(168,85,247,0.4), rgba(107,91,147,0.4))', fontSize: '1.15rem', padding: '26px' }}
                onClick={() => abrirAurora('es')}>
          <Mic size={22} color="#e9d5ff" /> "Hola Aurora"
        </button>
        <button className="kiosko-btn" style={{ ...btn, background: 'linear-gradient(135deg, rgba(168,85,247,0.4), rgba(107,91,147,0.4))', fontSize: '1.15rem', padding: '26px' }}
                onClick={() => abrirAurora('en')}>
          <Mic size={22} color="#e9d5ff" /> "Hey Aurora"
        </button>
      </div>
      <p style={{ color: '#8b7bb5', fontSize: '0.82rem', marginBottom: 26, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Hand size={14} /> Dilo en voz alta o toca un botón · Say it out loud or tap a button
      </p>

      {/* Accesos directos: abren Aurora ya respondiendo la consulta */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, width: '100%', maxWidth: 620 }}>
        <button className="kiosko-btn" style={btn} onClick={() => abrirAurora('es', '¿Qué servicios ofrecen?')}>
          <Sparkles size={18} color="#c084fc" /> Servicios
        </button>
        <button className="kiosko-btn" style={btn} onClick={() => abrirAurora('es', '¿Cuáles son los precios?')}>
          <DollarSign size={18} color="#c084fc" /> Precios
        </button>
        <button className="kiosko-btn" style={btn} onClick={() => abrirAurora('es', '¿Cuál es el horario?')}>
          <Clock size={18} color="#c084fc" /> Horarios
        </button>
        <button className="kiosko-btn" style={btn} onClick={() => abrirAurora('es', '¿Dónde están ubicados?')}>
          <MapPin size={18} color="#c084fc" /> Ubicación
        </button>
      </div>

      <style>{`
        .kiosko-btn:hover { background: rgba(168,85,247,0.38) !important; border-color: rgba(216,180,254,0.85) !important; transform: translateY(-2px); }
        .kiosko-btn:active { transform: scale(0.97); background: rgba(168,85,247,0.55) !important; }
      `}</style>
    </div>
  );
};

export default Kiosko;
