import React from 'react';

export type EstadoAurora = 'idle' | 'escuchando' | 'procesando' | 'hablando';

/**
 * Anillo de Voz Premium de Aurora.
 * Gradiente puramente morado que pulsa según el estado, con el
 * logotipo botánico del spa (silueta femenina + hojas + flor de loto)
 * en el centro, sin texto.
 */
const AuroraRing: React.FC<{ estado: EstadoAurora; size?: number }> = ({ estado, size = 220 }) => {
  const velocidad = estado === 'escuchando' ? '1.2s' : estado === 'procesando' ? '0.7s' : estado === 'hablando' ? '0.9s' : '2.8s';
  const escala = estado === 'idle' ? 1 : 1.04;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      {/* Halos pulsantes */}
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute', inset: -(i * 14 + 8),
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(168,85,247,${0.18 - i * 0.05}) 0%, rgba(107,91,147,0) 70%)`,
          animation: `aurora-halo ${velocidad} ease-in-out ${i * 0.25}s infinite`,
        }} />
      ))}

      {/* Anillo con gradiente morado giratorio */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', padding: '5px',
        background: 'conic-gradient(from 0deg, #a855f7, #7c3aed, #6B5B93, #c084fc, #a855f7)',
        animation: `aurora-spin ${estado === 'procesando' ? '1.4s' : '4s'} linear infinite`,
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
        filter: 'drop-shadow(0 0 22px rgba(168,85,247,0.55))',
      }} />

      {/* Disco central con logo botánico */}
      <div style={{
        width: size - 34, height: size - 34, borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #2a2140 0%, #171226 70%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `scale(${escala})`, transition: 'transform 0.4s ease',
        boxShadow: 'inset 0 0 40px rgba(168,85,247,0.25)',
      }}>
        {/* Logotipo de Aurora */}
        <img src="/Aurora.png" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }} alt="Aurora" />
      </div>

      {/* Barras de audio cuando habla */}
      {estado === 'hablando' && (
        <div style={{ position: 'absolute', bottom: -34, display: 'flex', gap: '5px', alignItems: 'flex-end', height: '24px' }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              width: '5px', borderRadius: '3px',
              background: 'linear-gradient(180deg, #c084fc, #7c3aed)',
              animation: `aurora-bar 0.${5 + i}s ease-in-out infinite alternate`,
            }} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes aurora-halo { 0%,100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.12); opacity: 0.4; } }
        @keyframes aurora-spin { to { transform: rotate(360deg); } }
        @keyframes aurora-bar { from { height: 5px; } to { height: 24px; } }
      `}</style>
    </div>
  );
};

export default AuroraRing;
