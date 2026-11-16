import React, { useEffect, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { useAuth } from '../../context/AuthContext';
import { Bell, UserCheck, X } from 'lucide-react';

interface Alerta { id: number; tipo: 'llegada' | 'empleado'; mensaje: string; hora: string; }

const API = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:5036';

/**
 * Alertas privadas de recepción en tiempo real (SignalR).
 * Se monta globalmente; solo se conecta si el usuario es staff.
 * Escucha los eventos "LlegadaCliente" y "AccesoEmpleado" del AuroraHub.
 */
const RecepcionAlertas: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const esStaff = isAuthenticated && ['Admin', 'Cajero', 'Especialista'].includes(user?.perfil || user?.rol || '');

  useEffect(() => {
    if (!esStaff) return;

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API}/hubs/aurora`)
      .withAutomaticReconnect()
      .build();

    const agregar = (tipo: Alerta['tipo']) => (data: any) => {
      const nueva: Alerta = {
        id: Date.now() + Math.random(),
        tipo,
        mensaje: data?.mensaje ?? '',
        hora: data?.hora ?? new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }),
      };
      setAlertas(prev => [nueva, ...prev].slice(0, 4));
      // Sonido corto de campana
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.12, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6);
      } catch { /* noop */ }
      // Autodescartar a los 12s
      setTimeout(() => setAlertas(prev => prev.filter(a => a.id !== nueva.id)), 12000);
    };

    conn.on('LlegadaCliente', agregar('llegada'));
    conn.on('AccesoEmpleado', agregar('empleado'));

    conn.start()
      .then(() => conn.invoke('UnirseRecepcion'))
      .catch(() => { /* backend apagado: silencioso */ });

    return () => { conn.stop(); };
  }, [esStaff]);

  if (!esStaff || alertas.length === 0) return null;

  return (
    <div style={{ position: 'fixed', top: 80, right: 20, zIndex: 4000, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 }}>
      {alertas.map(a => (
        <div key={a.id} style={{
          display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px',
          borderRadius: 16, background: 'white', borderLeft: '4px solid #a855f7',
          boxShadow: '0 12px 40px rgba(107,91,147,0.28)', animation: 'alerta-in .3s ease',
        }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#a855f7,#6B5B93)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {a.tipo === 'llegada' ? <Bell size={17} color="white" /> : <UserCheck size={17} color="white" />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--aura-navy, #1F2D3D)' }}>
              {a.tipo === 'llegada' ? 'Aurora · Llegada de cliente' : 'Aurora · Verificación de personal'}
              <span style={{ fontWeight: 400, color: '#999', marginLeft: 6, fontSize: '0.72rem' }}>{a.hora}</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#444', marginTop: 3, lineHeight: 1.4 }}>{a.mensaje}</div>
          </div>
          <button onClick={() => setAlertas(prev => prev.filter(x => x.id !== a.id))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: 2 }}>
            <X size={15} />
          </button>
        </div>
      ))}
      <style>{`@keyframes alerta-in { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
};

export default RecepcionAlertas;
