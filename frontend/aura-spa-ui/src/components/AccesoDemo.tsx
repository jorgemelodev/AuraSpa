import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApiDisponible } from '../services/apiDisponible';

/** Botón "Entrar como Cliente Demo": inicia la sesión simulada y navega al destino. */
export const BotonDemo: React.FC<{ destino?: string; style?: React.CSSProperties }> = ({ destino = '/catalog', style }) => {
  const { loginDemo } = useAuth();
  const navigate = useNavigate();
  return (
    <button type="button"
      onClick={() => { loginDemo(); navigate(destino); }}
      style={{
        width: '100%', padding: '14px', borderRadius: '50px', cursor: 'pointer',
        border: '2px dashed var(--aura-lavender)', background: '#f8f6ff',
        color: 'var(--aura-lavender-dark, #6B5B93)', fontWeight: 700, fontSize: '0.98rem', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        ...style,
      }}>
      <Sparkles size={17} /> Entrar como Cliente Demo
    </button>
  );
};

/** Banner discreto que se muestra arriba solo cuando el backend no responde. */
export const BannerModoDemo: React.FC = () => {
  const apiDisponible = useApiDisponible();
  if (apiDisponible !== false) return null;
  return (
    <div role="status"
      style={{ background: '#f0ecff', color: 'var(--aura-lavender-dark, #6B5B93)', borderBottom: '1px solid #e4defa', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, padding: '6px 16px' }}>
      Modo Demo (datos simulados sin backend activo)
    </div>
  );
};

export const NotaDemo: React.FC = () => (
  <p style={{ textAlign: 'center', color: '#999', fontSize: '0.76rem', margin: '8px 0 0' }}>
    Prueba citas y compras sin registrarte. Los datos solo se guardan en este navegador.
  </p>
);

/** Modal que aparece al intentar reservar o comprar sin sesión iniciada. */
export const ModalAccesoRequerido: React.FC<{
  mensaje: string;
  destino: string;
  onCerrar: () => void;
}> = ({ mensaje, destino, onCerrar }) => {
  const navigate = useNavigate();
  return createPortal(
    <div onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
      <div className="card-aura animate-fade-in" onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="acceso-requerido-titulo"
        style={{ position: 'relative', maxWidth: '420px', width: '100%', padding: '40px 32px 32px', borderRadius: '25px', textAlign: 'center' }}>
        <button onClick={onCerrar} aria-label="Cerrar"
          style={{ position: 'absolute', top: '14px', right: '14px', background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}>
          <X size={20} />
        </button>
        <h4 id="acceso-requerido-titulo" style={{ color: 'var(--aura-navy)', fontWeight: 'bold', marginBottom: '8px' }}>Inicia sesión para continuar</h4>
        <p style={{ color: '#888', fontSize: '0.88rem', marginBottom: '24px' }}>{mensaje}</p>
        <BotonDemo destino={destino} />
        <NotaDemo />
        <button className="btn-AuraSpa"
          onClick={() => navigate('/login', { state: { from: destino } })}
          style={{ width: '100%', padding: '13px', marginTop: '18px' }}>
          Iniciar sesión con mi cuenta
        </button>
      </div>
    </div>,
    document.body
  );
};
