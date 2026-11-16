import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  value: string; // 'YYYY-MM-DD'
  onChange: (fecha: string) => void;
  diasBloqueados: Record<string, string>; // 'YYYY-MM-DD' -> motivo
  minDate?: string; // 'YYYY-MM-DD', por defecto hoy
  error?: boolean;
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['D','L','M','M','J','V','S'];

const toISO = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Selector de fecha propio (no nativo) — permite deshabilitar y pintar en gris días específicos (feriados/bloqueados), algo que <input type="date"> no soporta. */
const SelectorFecha: React.FC<Props> = ({ value, onChange, diasBloqueados, minDate, error }) => {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const minD = minDate ? new Date(`${minDate}T00:00`) : hoy;
  const [abierto, setAbierto] = useState(false);
  const [mesVista, setMesVista] = useState(() => {
    const base = value ? new Date(`${value}T00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const primerDiaSemana = new Date(mesVista.getFullYear(), mesVista.getMonth(), 1).getDay();
  const diasEnMes = new Date(mesVista.getFullYear(), mesVista.getMonth() + 1, 0).getDate();
  const celdas: (Date | null)[] = [
    ...Array(primerDiaSemana).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => new Date(mesVista.getFullYear(), mesVista.getMonth(), i + 1)),
  ];

  const triggerStyle: React.CSSProperties = {
    width: '100%', padding: '12px 15px', borderRadius: '15px',
    border: error ? '1px solid #ef4444' : '1px solid #ddd', outline: 'none',
    background: '#fcfcfc', fontSize: '0.9rem', boxSizing: 'border-box', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <div onClick={() => setAbierto(v => !v)} style={triggerStyle}>
        <span style={{ color: value ? 'var(--aura-navy)' : '#999' }}>
          {value ? new Date(`${value}T00:00`).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Selecciona una fecha...'}
        </span>
        <CalendarIcon size={16} color="#999" />
      </div>
      {abierto && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '6px', background: 'white', border: '1px solid #eee', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: '16px', zIndex: 200, width: '280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <button type="button" onClick={() => setMesVista(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--aura-navy)' }}><ChevronLeft size={18} /></button>
            <strong style={{ fontSize: '0.88rem', color: 'var(--aura-navy)' }}>{MESES[mesVista.getMonth()]} {mesVista.getFullYear()}</strong>
            <button type="button" onClick={() => setMesVista(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--aura-navy)' }}><ChevronRight size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px', marginBottom: '4px' }}>
            {DIAS_SEMANA.map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: '0.72rem', color: '#aaa', fontWeight: 600 }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px' }}>
            {celdas.map((d, i) => {
              if (!d) return <div key={i} />;
              const iso = toISO(d);
              const bloqueado = diasBloqueados[iso];
              const pasado = d < minD;
              const deshabilitado = !!bloqueado || pasado;
              const seleccionado = iso === value;
              return (
                <button key={i} type="button" disabled={deshabilitado}
                  title={bloqueado || undefined}
                  onClick={() => { onChange(iso); setAbierto(false); }}
                  style={{
                    padding: '8px 0', borderRadius: '10px', border: 'none', fontSize: '0.82rem',
                    cursor: deshabilitado ? 'not-allowed' : 'pointer',
                    background: seleccionado ? 'var(--aura-lavender)' : 'transparent',
                    color: deshabilitado ? '#ccc' : seleccionado ? 'white' : 'var(--aura-navy)',
                    fontWeight: seleccionado ? 700 : 400,
                  }}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SelectorFecha;
