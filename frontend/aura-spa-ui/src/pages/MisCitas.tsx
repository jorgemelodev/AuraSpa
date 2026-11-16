import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, User, Star, CheckCircle, XCircle, AlertCircle, Plus, Loader2, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../services/apiClient';
import jsPDF from 'jspdf';
import { getLogoBase64 } from '../utils/pdfLogo';
import { HORAS_SPA, formatHora12, horaFueraDeHorarioDomingo } from '../utils/horasSpa';
import SelectorFecha from '../components/SelectorFecha';

interface Cita {
  idCita: number;
  servicio: string;
  categoria: string;
  especialista: string;
  idEmpleado?: number | null;
  sucursal: string;
  fechaHora: string;
  estado: 'Pendiente' | 'Confirmada' | 'Completada' | 'Cancelada' | 'Rechazada';
  precioAcordado?: number;
}

// Igual que en Agendamiento.tsx: margen mínimo de anticipación para reprogramar el mismo día
const MARGEN_HORAS_HOY = 2;
const esHoy = (fecha: string) => fecha === new Date().toISOString().split('T')[0];
const horaPasada = (fecha: string, hora: string) => {
  if (!esHoy(fecha)) return false;
  const [h, m] = hora.split(':').map(Number);
  const limite = new Date();
  limite.setHours(limite.getHours() + MARGEN_HORAS_HOY);
  const horaSlot = new Date();
  horaSlot.setHours(h, m, 0, 0);
  return horaSlot < limite;
};

const estadoConfig: Record<string, { color: string; bg: string; icono: React.ReactNode; label: string }> = {
  Pendiente:  { color: '#D4AA00', bg: '#FDF8EC', icono: <AlertCircle size={14} />, label: 'Pendiente' },
  Confirmada: { color: '#6B5B93', bg: '#f0ecff', icono: <CheckCircle size={14} />, label: 'Confirmada' },
  Completada: { color: '#22c55e', bg: '#f0fdf4', icono: <CheckCircle size={14} />, label: 'Completada' },
  Cancelada:  { color: '#ef4444', bg: '#fef2f2', icono: <XCircle size={14} />,     label: 'Cancelada' },
  Rechazada:  { color: '#ef4444', bg: '#fef2f2', icono: <XCircle size={14} />,     label: 'Rechazada' },
};

const MisCitas: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<string>('Todas');
  const [cancelando, setCancelando] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<Record<number, string>>({});
  const [cancelBloqueado72h, setCancelBloqueado72h] = useState<Record<number, boolean>>({});

  const [resenaModal, setResenaModal] = useState<number | null>(null);
  const [calificacion, setCalificacion] = useState(0);
  const [comentario, setComentario] = useState('');
  const [resenaError, setResenaError] = useState('');
  const [resenaEnviando, setResenaEnviando] = useState(false);
  const [resenaExito, setResenaExito] = useState(false);
  const [citasConResena, setCitasConResena] = useState<number[]>([]);

  const [reprogramarModal, setReprogramarModal] = useState<number | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevaHora, setNuevaHora] = useState('');
  const [reprogramarError, setReprogramarError] = useState('');
  const [reprogramarEnviando, setReprogramarEnviando] = useState(false);
  const [reprogramarExito, setReprogramarExito] = useState(false);
  const [diasBloqueados, setDiasBloqueados] = useState<Record<string, string>>({});
  const [horasOcupadasReprogramar, setHorasOcupadasReprogramar] = useState<string[]>([]);

  useEffect(() => {
    fetchCitas();
    apiClient.get('/api/core/dias-bloqueados').then(res => {
      const mapa: Record<string, string> = {};
      res.data.forEach((d: any) => { mapa[new Date(d.fecha).toISOString().split('T')[0]] = d.motivo; });
      setDiasBloqueados(mapa);
    }).catch(() => {});
  }, []);

  // Consulta horas ocupadas del especialista de la cita al cambiar la nueva fecha en el modal de reprogramar
  useEffect(() => {
    setHorasOcupadasReprogramar([]);
    const cita = citas.find(c => c.idCita === reprogramarModal);
    if (!cita?.idEmpleado || !nuevaFecha) return;
    apiClient.get(`/api/citas/disponibilidad?idEmpleado=${cita.idEmpleado}&fecha=${nuevaFecha}`)
      .then(res => setHorasOcupadasReprogramar(res.data))
      .catch(() => setHorasOcupadasReprogramar([]));
  }, [reprogramarModal, nuevaFecha, citas]);

  // Si la hora ya elegida quedó ocupada o pasó el margen mínimo al cambiar la fecha, se deselecciona
  useEffect(() => {
    if (nuevaHora && (horasOcupadasReprogramar.includes(nuevaHora) || horaPasada(nuevaFecha, nuevaHora) || horaFueraDeHorarioDomingo(nuevaFecha, nuevaHora))) setNuevaHora('');
  }, [horasOcupadasReprogramar, nuevaFecha]);

  const fetchCitas = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/api/citas/mis-citas');
      setCitas(res.data);
    } catch {
      setError('No se pudieron cargar tus citas. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  // Cuando falta menos de 72h, calcula el déficit para explicar cuánto falta para el corte de las 72h
  const calcularTiempoParaCancelar = (fechaHora: string) => {
    const minutosHastaCita = Math.floor((new Date(fechaHora).getTime() - Date.now()) / 60000);
    const minutosFaltantes = 72 * 60 - minutosHastaCita;
    if (minutosFaltantes <= 0) return null;
    const horas = Math.floor(minutosFaltantes / 60);
    const minutos = minutosFaltantes % 60;
    return `Podrás cancelar esta cita en ${horas} horas y ${minutos} minutos.`;
  };

  const handleCancelar = async (idCita: number) => {
    if (!window.confirm('¿Seguro que quieres cancelar esta cita? Esta acción no se puede deshacer.')) return;
    setCancelando(idCita);
    setCancelError(prev => ({ ...prev, [idCita]: '' }));
    setCancelBloqueado72h(prev => ({ ...prev, [idCita]: false }));
    try {
      await apiClient.put(`/api/citas/${idCita}/cancelar`);
      setCitas(prev => prev.map(c => c.idCita === idCita ? { ...c, estado: 'Cancelada' } : c));
    } catch (err: any) {
      const msg = err.response?.data;
      const cita = citas.find(c => c.idCita === idCita);
      const tiempoRestante = cita ? calcularTiempoParaCancelar(cita.fechaHora) : null;
      setCancelError(prev => ({ ...prev, [idCita]: tiempoRestante ?? (typeof msg === 'string' ? msg : 'No se pudo cancelar la cita.') }));
      setCancelBloqueado72h(prev => ({ ...prev, [idCita]: !!tiempoRestante }));
    } finally {
      setCancelando(null);
    }
  };

  const citaYaPaso = (cita: Cita) => new Date(cita.fechaHora) < new Date();

  const puedeReprogramar = (cita: Cita) =>
    (cita.estado === 'Pendiente' || cita.estado === 'Confirmada') && !citaYaPaso(cita);

  // Cuando falta menos de 72h, calcula el déficit para explicar cuánto falta para el corte de las 72h
  const calcularTiempoParaReprogramar = (fechaHora: string) => {
    const minutosHastaCita = Math.floor((new Date(fechaHora).getTime() - Date.now()) / 60000);
    const minutosFaltantes = 72 * 60 - minutosHastaCita;
    if (minutosFaltantes <= 0) return null;
    const horas = Math.floor(minutosFaltantes / 60);
    const minutos = minutosFaltantes % 60;
    return `Podrás reprogramar esta cita en ${horas} horas y ${minutos} minutos.`;
  };

  const handleReprogramar = async () => {
    if (reprogramarModal === null || !nuevaFecha || !nuevaHora) return;
    if (horaFueraDeHorarioDomingo(nuevaFecha, nuevaHora)) { setReprogramarError('Los domingos atendemos de 10:00 AM a 4:00 PM.'); return; }
    const citaOriginal = citas.find(c => c.idCita === reprogramarModal);
    if (citaOriginal) {
      const tiempoRestante = calcularTiempoParaReprogramar(citaOriginal.fechaHora);
      if (tiempoRestante) { setReprogramarError(tiempoRestante); return; }
    }
    setReprogramarEnviando(true);
    setReprogramarError('');
    try {
      const fechaHora = `${nuevaFecha}T${nuevaHora}:00`;
      const res = await apiClient.put(`/api/citas/${reprogramarModal}/reprogramar`, { fechaHora });
      setCitas(prev => prev.map(c => c.idCita === reprogramarModal ? { ...c, fechaHora: res.data.fechaHora } : c));
      setReprogramarExito(true);
      setTimeout(() => {
        setReprogramarModal(null);
        setNuevaFecha('');
        setNuevaHora('');
        setReprogramarExito(false);
      }, 2000);
    } catch (err: any) {
      const msg = err.response?.data;
      const cita = citas.find(c => c.idCita === reprogramarModal);
      const tiempoRestante = cita ? calcularTiempoParaReprogramar(cita.fechaHora) : null;
      setReprogramarError(tiempoRestante ?? (typeof msg === 'string' ? msg : 'No se pudo reprogramar la cita.'));
    } finally {
      setReprogramarEnviando(false);
    }
  };

  const handleResena = async (citaId: number) => {
    setResenaEnviando(true);
    setResenaError('');
    try {
      await apiClient.post('/api/resenas', { idCita: citaId, calificacion, comentario });
      setCitasConResena(prev => [...prev, citaId]);
      setResenaExito(true);
      setTimeout(() => {
        setResenaModal(null);
        setCalificacion(0);
        setComentario('');
        setResenaExito(false);
      }, 2000);
    } catch (err: any) {
      const msg = err.response?.data;
      setResenaError(typeof msg === 'string' ? msg : 'No se pudo enviar la reseña.');
    } finally {
      setResenaEnviando(false);
    }
  };

  const descargarComprobante = async (cita: Cita) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const { fecha, hora } = formatFechaHora(cita.fechaHora);
    const referencia = `AURA-${cita.idCita.toString().padStart(4, '0')}`;
    const fechaHoy = new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });

    // Header navy
    doc.setFillColor(31, 45, 61);
    doc.rect(0, 0, pageWidth, 45, 'F');

    try {
      const logo = await getLogoBase64();
      doc.addImage(logo, 'PNG', margin, 4, 18, 20.5);
    } catch {
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('AURA', margin, 22);
      const auraWidth = doc.getTextWidth('AURA');
      doc.setTextColor(151, 138, 221);
      doc.text(' Spa', margin + auraWidth, 22);
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 220);
    doc.text('Comprobante de Cita', margin, 32);
    doc.text('AuraSpa Piantini — Sucursal Principal', margin, 39);

    doc.setFontSize(8);
    doc.setTextColor(180, 180, 200);
    doc.text('No. Referencia', pageWidth - margin, 22, { align: 'right' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(151, 138, 221);
    doc.text(referencia, pageWidth - margin, 30, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 200);
    doc.text(`Emitido: ${fechaHoy}`, pageWidth - margin, 38, { align: 'right' });

    doc.setDrawColor(151, 138, 221);
    doc.setLineWidth(0.8);
    doc.line(margin, 50, pageWidth - margin, 50);

    let y = 62;

    // Sección cliente
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31, 45, 61);
    doc.text('Información del Cliente', margin, y);
    doc.setDrawColor(220, 215, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 3, pageWidth - margin, y + 3);
    y += 12;

    const nombreCompleto = `${user?.nombre ?? ''} ${user?.apellido ?? ''}`.trim() || 'Cliente AuraSpa';
    const clienteData: [string, string][] = [
      ['Nombre:', nombreCompleto],
      ['Correo:', user?.email ?? '—'],
      ['Telefono:', user?.telefono ?? '—'],
    ];

    clienteData.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(label, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(31, 45, 61);
      doc.text(value, margin + 35, y);
      y += 9;
    });

    y += 8;
    doc.setDrawColor(220, 215, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;

    // Sección cita
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31, 45, 61);
    doc.text('Información de la Cita', margin, y);
    doc.setDrawColor(220, 215, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 3, pageWidth - margin, y + 3);
    y += 12;

    const citaData: [string, string][] = [
      ['Servicio:', cita.servicio],
      ['Especialista:', cita.especialista],
      ['Fecha:', fecha],
      ['Hora:', hora],
      ['Lugar:', cita.sucursal || 'AuraSpa Piantini — Sucursal Principal'],
    ];

    if (cita.precioAcordado) {
      citaData.push(['Precio:', `RD$ ${cita.precioAcordado.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`]);
    }

    citaData.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(label, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(31, 45, 61);
      doc.text(value, margin + 35, y);
      y += 9;
    });

    y += 8;
    doc.setDrawColor(220, 215, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;

    // Estado
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31, 45, 61);
    doc.text('Estado de la Cita', margin, y);
    doc.setDrawColor(220, 215, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 3, pageWidth - margin, y + 3);
    y += 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Estado:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(31, 45, 61);
    doc.text(cita.estado, margin + 35, y);

    y += 18;
    doc.setDrawColor(151, 138, 221);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(`${referencia} — Comprobante generado el ${fechaHoy}`, pageWidth / 2, y, { align: 'center' });
    doc.text('AuraSpa © 2026 — Este documento es un comprobante de reserva, no de pago.', pageWidth / 2, y + 7, { align: 'center' });

    doc.setFillColor(31, 45, 61);
    doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 200);
    doc.text('www.auraspa.com  |  contacto@auraspa.com  |  809-000-0000', pageWidth / 2, pageHeight - 4, { align: 'center' });

    doc.save(`comprobante-cita-${referencia}.pdf`);
  };

  const citasFiltradas = filtro === 'Todas' ? citas : citas.filter(c => c.estado === filtro);
  const CITAS_POR_PAGINA = 10;
  const [paginaActual, setPaginaActual] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(citasFiltradas.length / CITAS_POR_PAGINA));
  const citasPagina = citasFiltradas.slice((paginaActual - 1) * CITAS_POR_PAGINA, paginaActual * CITAS_POR_PAGINA);

  const formatFechaHora = (fechaHora: string) => {
    const d = new Date(fechaHora);
    return {
      fecha: d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }),
      hora: d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--aura-beige)', padding: '40px 10%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ color: 'var(--aura-navy)', fontWeight: 'bold', margin: 0 }}>Mis Citas</h2>
          <p style={{ color: 'var(--aura-gray)', margin: 0, fontSize: '0.9rem' }}>Historial y gestión de tus reservas</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-AuraSpa" onClick={() => navigate('/agendamiento')} style={{ padding: '10px 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> Nueva cita
          </button>
          <button onClick={() => navigate('/dashboard/client')} className="btn-outline-aura" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>← Volver</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', flexWrap: 'wrap' }}>
        {['Todas', 'Pendiente', 'Confirmada', 'Completada', 'Cancelada'].map(f => (
          <button key={f} onClick={() => { setFiltro(f); setPaginaActual(1); }} style={{
            padding: '8px 18px', borderRadius: '30px', border: '1px solid',
            borderColor: filtro === f ? 'var(--aura-lavender)' : '#ddd',
            background: filtro === f ? 'var(--aura-lavender)' : 'white',
            color: filtro === f ? 'white' : 'var(--aura-gray)',
            fontWeight: filtro === f ? '600' : '400',
            cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s'
          }}>{f}</button>
        ))}
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--aura-gray)', padding: '60px' }}>Cargando tus citas...</p>}
      {error && <p style={{ textAlign: 'center', color: '#c62828', padding: '30px', background: '#ffebee', borderRadius: '20px' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {citasFiltradas.length === 0 ? (
            <div className="card-aura" style={{ padding: '60px', textAlign: 'center' }}>
              <p style={{ color: 'var(--aura-gray)', margin: 0 }}>No tienes citas {filtro !== 'Todas' ? `con estado "${filtro}"` : 'registradas'}.</p>
              <button className="btn-AuraSpa" onClick={() => navigate('/agendamiento')} style={{ marginTop: '20px', padding: '12px 30px' }}>
                Agendar mi primera cita
              </button>
            </div>
          ) : citasPagina.map(cita => {
            const config = estadoConfig[cita.estado] ?? estadoConfig['Pendiente'];
            const { fecha, hora } = formatFechaHora(cita.fechaHora);
            return (
              <div key={cita.idCita} className="card-aura" style={{ padding: '25px 30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <h4 style={{ fontWeight: 'bold', margin: 0, color: 'var(--aura-navy)', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>{cita.servicio}</h4>
                      <span style={{ background: config.bg, color: config.color, padding: '3px 12px', borderRadius: '30px', fontSize: '0.78rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {config.icono} {config.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--aura-gray)', fontSize: '0.85rem' }}><User size={14} />{cita.especialista}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--aura-gray)', fontSize: '0.85rem' }}><Calendar size={14} />{fecha}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--aura-gray)', fontSize: '0.85rem' }}><Clock size={14} />{hora}</span>
                    </div>
                    {cita.precioAcordado && (
                      <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--aura-navy)', fontWeight: '600' }}>
                        RD$ {cita.precioAcordado.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                    {/* Comprobante solo para citas Confirmadas o Completadas */}
                    {(cita.estado === 'Confirmada' || cita.estado === 'Completada') && (
                      <button onClick={() => descargarComprobante(cita)} style={{
                        padding: '8px 18px', borderRadius: '30px', border: '1px solid #6B5B93',
                        background: '#f0ecff', color: '#6B5B93', fontWeight: '600', cursor: 'pointer', fontSize: '0.82rem',
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}>
                        <Download size={13} /> Comprobante
                      </button>
                    )}
                    {cita.estado === 'Completada' && (
                      citasConResena.includes(cita.idCita) ? (
                        <span style={{ padding: '8px 18px', borderRadius: '30px', color: '#22c55e', fontWeight: '600', fontSize: '0.82rem' }}>
                          ✓ Reseña enviada
                        </span>
                      ) : (
                        <button onClick={() => { setResenaModal(cita.idCita); setResenaError(''); }} style={{
                          padding: '8px 18px', borderRadius: '30px', border: '1px solid var(--aura-lavender)',
                          background: '#f0ecff', color: 'var(--aura-lavender)', fontWeight: '600', cursor: 'pointer', fontSize: '0.82rem'
                        }}>✍️ Dejar reseña</button>
                      )
                    )}
                    {puedeReprogramar(cita) && (
                      <button
                        onClick={() => { setReprogramarModal(cita.idCita); setNuevaFecha(''); setNuevaHora(''); setReprogramarError(''); }}
                        style={{ padding: '8px 18px', borderRadius: '30px', border: '1px solid #6B5B93', background: '#f0ecff', color: '#6B5B93', fontWeight: '600', cursor: 'pointer', fontSize: '0.82rem' }}
                      >
                        📅 Reprogramar
                      </button>
                    )}
                    {(cita.estado === 'Pendiente' || cita.estado === 'Confirmada') && !citaYaPaso(cita) && (
                      <>
                        <button
                          onClick={() => handleCancelar(cita.idCita)}
                          disabled={cancelando === cita.idCita}
                          style={{ padding: '8px 18px', borderRadius: '30px', border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', fontWeight: '600', cursor: 'pointer', fontSize: '0.82rem' }}
                        >
                          {cancelando === cita.idCita ? <Loader2 size={14} className="animate-spin" /> : 'Cancelar cita'}
                        </button>
                        {cancelError[cita.idCita] && (
                          <div style={{ textAlign: 'right', maxWidth: '240px' }}>
                            <p style={{ color: '#c62828', fontSize: '0.82rem', margin: 0 }}>
                              {cancelError[cita.idCita]}
                            </p>
                            {cancelBloqueado72h[cita.idCita] && (
                              <p style={{ color: 'var(--aura-gray)', fontSize: '0.78rem', margin: '6px 0 0' }}>
                                ¿Tienes una emergencia? Contáctanos directamente:{' '}
                                <a href="tel:8090000000" style={{ color: 'var(--aura-lavender)', fontWeight: '600', textDecoration: 'none' }}>
                                  📞 809-000-0000
                                </a>
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && citasFiltradas.length > CITAS_POR_PAGINA && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '25px' }}>
          <button onClick={() => setPaginaActual(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
            className="btn-outline-aura" style={{ padding: '8px 18px', fontSize: '0.85rem', opacity: paginaActual === 1 ? 0.5 : 1 }}>
            ← Anterior
          </button>
          <span style={{ color: 'var(--aura-gray)', fontSize: '0.88rem' }}>Página {paginaActual} de {totalPaginas}</span>
          <button onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
            className="btn-outline-aura" style={{ padding: '8px 18px', fontSize: '0.85rem', opacity: paginaActual === totalPaginas ? 0.5 : 1 }}>
            Siguiente →
          </button>
        </div>
      )}

      {resenaModal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card-aura" style={{ width: '100%', maxWidth: '460px', padding: '40px', borderRadius: '30px' }}>
            {resenaExito ? (
              <div style={{ background: '#f0fdf4', color: '#22c55e', borderRadius: '14px', padding: '18px', textAlign: 'center', fontWeight: '600', fontSize: '0.95rem' }}>
                ✅ ¡Gracias por tu reseña! Estará visible próximamente.
              </div>
            ) : (
              <>
                <h3 style={{ color: 'var(--aura-navy)', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>Dejar reseña</h3>
                <p style={{ color: 'var(--aura-gray)', textAlign: 'center', fontSize: '0.9rem', marginBottom: '25px' }}>
                  {citas.find(c => c.idCita === resenaModal)?.servicio}
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} size={36} fill={s <= calificacion ? '#fbbf24' : 'none'} color={s <= calificacion ? '#fbbf24' : '#ddd'}
                      style={{ cursor: 'pointer' }} onClick={() => setCalificacion(s)} />
                  ))}
                </div>
                <textarea value={comentario} onChange={(e) => setComentario(e.target.value)}
                  placeholder="Cuéntanos tu experiencia..." rows={3}
                  style={{ width: '100%', padding: '12px 15px', borderRadius: '15px', border: '1px solid #ddd', outline: 'none', background: '#fcfcfc', fontSize: '0.9rem', resize: 'none', marginBottom: '20px' }} />
                {resenaError && <p style={{ color: '#c62828', fontSize: '0.82rem', marginBottom: '15px', textAlign: 'center' }}>{resenaError}</p>}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleResena(resenaModal!)} className="btn-AuraSpa" style={{ flex: 1, padding: '12px' }} disabled={calificacion === 0 || resenaEnviando}>
                    {resenaEnviando ? <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto' }} /> : 'Publicar reseña'}
                  </button>
                  <button onClick={() => { setResenaModal(null); setCalificacion(0); setComentario(''); setResenaError(''); }} className="btn-outline-aura" style={{ flex: 1, padding: '12px' }}>Cancelar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {reprogramarModal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card-aura" style={{ width: '100%', maxWidth: '440px', padding: '40px', borderRadius: '30px' }}>
            {reprogramarExito ? (
              <div style={{ background: '#f0fdf4', color: '#22c55e', borderRadius: '14px', padding: '18px', textAlign: 'center', fontWeight: '600', fontSize: '0.95rem' }}>
                ✅ ¡Tu cita fue reprogramada!
              </div>
            ) : (
              <>
                <h3 style={{ color: 'var(--aura-navy)', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>Reprogramar cita</h3>
                <p style={{ color: 'var(--aura-gray)', textAlign: 'center', fontSize: '0.9rem', marginBottom: '25px' }}>
                  {citas.find(c => c.idCita === reprogramarModal)?.servicio}
                </p>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--aura-gray)', fontWeight: 500, fontSize: '0.9rem' }}>Nueva fecha</label>
                  <SelectorFecha value={nuevaFecha} onChange={(val) => { setReprogramarError(''); setNuevaFecha(val); }}
                    diasBloqueados={diasBloqueados} />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--aura-gray)', fontWeight: 500, fontSize: '0.9rem' }}>Nueva hora</label>
                  <select value={nuevaHora} onChange={(e) => setNuevaHora(e.target.value)} disabled={!nuevaFecha}
                    style={{ width: '100%', padding: '12px 15px', borderRadius: '15px', border: '1px solid #ddd', outline: 'none', background: '#fcfcfc', fontSize: '0.9rem', boxSizing: 'border-box', cursor: nuevaFecha ? 'pointer' : 'not-allowed' }}>
                    <option value="">Selecciona una hora...</option>
                    {HORAS_SPA.map(h => {
                      const ocupada = horasOcupadasReprogramar.includes(h);
                      const pasada = horaPasada(nuevaFecha, h);
                      const fueraDomingo = horaFueraDeHorarioDomingo(nuevaFecha, h);
                      return (
                        <option key={h} value={h} disabled={ocupada || pasada || fueraDomingo}>
                          {formatHora12(h)}{ocupada ? ' (ocupada)' : pasada ? ' (no disponible)' : fueraDomingo ? ' (fuera de horario)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  {nuevaFecha && new Date(`${nuevaFecha}T00:00`).getDay() === 0 && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--aura-lavender)', marginTop: '8px' }}>
                      Los domingos atendemos de 10:00 AM a 4:00 PM.
                    </p>
                  )}
                  {nuevaFecha && esHoy(nuevaFecha) && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--aura-gray)', marginTop: '8px' }}>
                      Para hoy, solo se pueden reprogramar horas con al menos {MARGEN_HORAS_HOY} horas de anticipación.
                    </p>
                  )}
                </div>
                {reprogramarError && <p style={{ color: '#c62828', fontSize: '0.82rem', marginBottom: '15px', textAlign: 'center' }}>{reprogramarError}</p>}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleReprogramar} className="btn-AuraSpa" style={{ flex: 1, padding: '12px' }} disabled={!nuevaFecha || !nuevaHora || reprogramarEnviando}>
                    {reprogramarEnviando ? <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto' }} /> : 'Confirmar cambio'}
                  </button>
                  <button onClick={() => { setReprogramarModal(null); setNuevaFecha(''); setNuevaHora(''); setReprogramarError(''); }} className="btn-outline-aura" style={{ flex: 1, padding: '12px' }}>Cancelar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MisCitas;
