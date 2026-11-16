import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/apiClient';
import {
  Building2, Shield, Users, UserCheck, Package,
  Stethoscope, Gift, FileCheck, ClipboardList, LogOut,
  Plus, Edit, Trash2, CheckCircle, XCircle, X, Search, Save, CalendarOff
} from 'lucide-react';

type Seccion = 'sucursales'|'perfiles'|'usuarios'|'empleados'|'servicios'|'inventario'|'expedientes'|'paquetes'|'consentimiento'|'diasBloqueados'|'auditoria';

// Secciones con create/edit real contra el backend
const SECCIONES_CON_CREAR = ['sucursales', 'empleados', 'expedientes', 'diasBloqueados', 'usuarios', 'servicios', 'inventario', 'paquetes', 'consentimiento'];
// Secciones aún no implementadas — solo muestran un aviso
const SECCIONES_PROXIMAMENTE: Seccion[] = [];

const ID_SUCURSAL_DEFAULT = 1; // AuraSpa Principal — única sucursal activa

// ── DATOS INICIALES (secciones fuera de alcance: siguen locales) ───────────────
const INIT_AUDITORIA = [
  { id:1, usuario:'admin',   accion:'Modificó precio de Facial Hidratante', valorAnterior:'RD$ 1,500.00', valorNuevo:'RD$ 1,800.00', fecha:'05/06/2026 09:15' },
  { id:2, usuario:'admin',   accion:'Creó nuevo empleado: Nicole Martínez',  valorAnterior:'—',            valorNuevo:'Especialista',  fecha:'04/06/2026 14:30' },
  { id:3, usuario:'cajero',  accion:'Modificó precio de Masaje Relajante',   valorAnterior:'RD$ 2,000.00', valorNuevo:'RD$ 2,500.00', fecha:'03/06/2026 11:00' },
];

// ── VALIDACIONES ───────────────────────────────────────────────────────────────
const soloLetras   = (v: string) => v.replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ\s'-]/g, '');
const soloNumeros  = (v: string) => v.replace(/\D/g, '').slice(0, 9);

// ── NÓMINA RD: deducciones de ley sobre el sueldo bruto mensual ────────────────
// AFP 2.87% · SFS/ARS 3.04% (aportes del empleado) · ISR según escala DGII
const calcularNominaRD = (sueldoMensual: number) => {
  const afp = sueldoMensual * 0.0287;
  const sfs = sueldoMensual * 0.0304;
  const baseAnual = (sueldoMensual - afp - sfs) * 12;
  let isrAnual = 0;
  if      (baseAnual > 867123.01) isrAnual = 79776 + (baseAnual - 867123.01) * 0.25;
  else if (baseAnual > 624329.01) isrAnual = 31216 + (baseAnual - 624329.01) * 0.20;
  else if (baseAnual > 416220.01) isrAnual = (baseAnual - 416220.01) * 0.15;
  const isr = isrAnual / 12;
  const neto = sueldoMensual - afp - sfs - isr;
  return { afp, sfs, isr, neto };
};

// ── ESTILOS ────────────────────────────────────────────────────────────────────
const iS: React.CSSProperties = { width:'100%', padding:'10px 15px', borderRadius:'12px', border:'1px solid #e0d8f5', outline:'none', background:'#fcfcfc', fontSize:'0.88rem', boxSizing:'border-box' };
const lS: React.CSSProperties = { display:'block', marginBottom:'5px', fontSize:'0.8rem', color:'var(--aura-gray)', fontWeight:'600' };
const tdS: React.CSSProperties = { padding:'10px 14px', fontSize:'0.85rem', color:'var(--aura-gray)' };
const tdB: React.CSSProperties = { ...tdS, fontWeight:'600', color:'var(--aura-navy)' };

// ── SUBCOMPONENTES ─────────────────────────────────────────────────────────────
const TH: React.FC<{cols:string[]}> = ({cols}) => (
  <thead>
    <tr style={{background:'#EDE8F5'}}>
      {cols.map(h => <th key={h} style={{padding:'10px 14px',textAlign:'left',fontWeight:'600',color:'var(--aura-navy)',borderBottom:'2px solid #e8e0f5',fontSize:'0.82rem',whiteSpace:'nowrap'}}>{h}</th>)}
    </tr>
  </thead>
);

const BadgeActivo: React.FC<{activo:boolean}> = ({activo}) => (
  <span style={{background:activo?'#f0fdf4':'#fef2f2',color:activo?'#22c55e':'#ef4444',padding:'3px 10px',borderRadius:'20px',fontSize:'0.75rem',fontWeight:'600'}}>
    {activo ? 'Activo' : 'Inactivo'}
  </span>
);

const Btns: React.FC<{onEdit:()=>void;onDelete:()=>void}> = ({onEdit,onDelete}) => (
  <td style={{padding:'10px 14px'}}>
    <div style={{display:'flex',gap:'6px'}}>
      <button onClick={onEdit}   title="Editar"   style={{background:'#f0ecff',border:'none',cursor:'pointer',color:'var(--aura-lavender)',padding:'5px 10px',borderRadius:'8px'}}><Edit   size={13}/></button>
      <button onClick={onDelete} title="Eliminar" style={{background:'#fef2f2',border:'none',cursor:'pointer',color:'#ef4444',          padding:'5px 10px',borderRadius:'8px'}}><Trash2 size={13}/></button>
    </div>
  </td>
);

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────────
const Core: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [seccion, setSeccion]       = useState<Seccion>('sucursales');
  const [busqueda, setBusqueda]     = useState('');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editId, setEditId]         = useState<number|null>(null);
  const [confirmDel, setConfirmDel] = useState<{id:number;nombre:string}|null>(null);
  const [confirmToggle, setConfirmToggle] = useState<{nombre:string; activo:boolean; ejecutando?:boolean; accion:()=>Promise<void>}|null>(null);
  const [confirmSave, setConfirmSave]= useState(false);
  const [guardadoOk, setGuardadoOk] = useState<string|null>(null);
  const [errorToast, setErrorToast] = useState<string|null>(null);
  const [cargando, setCargando]     = useState(false);

  const [sucursales,      setSucursales]      = useState<any[]>([]);
  const [perfiles,        setPerfiles]        = useState<any[]>([]);
  const [usuarios,        setUsuarios]        = useState<any[]>([]);
  const [empleados,       setEmpleados]       = useState<any[]>([]);
  const [servicios,       setServicios]       = useState<any[]>([]);
  const [inventario,      setInventario]      = useState<any[]>([]);
  const [expedientes,     setExpedientes]     = useState<any[]>([]);
  const [diasBloqueados,  setDiasBloqueados]  = useState<any[]>([]);
  const [auditoriaLog] = useState(INIT_AUDITORIA);
  const [paquetes,        setPaquetes]        = useState<any[]>([]);
  const [categoriasServ,  setCategoriasServ]  = useState<any[]>([]);
  const [clientes,        setClientes]        = useState<any[]>([]);
  const [consentimientos, setConsentimientos] = useState<any[]>([]);

  // Paquetes por cliente (asignar + historial)
  const [ppcClienteId, setPpcClienteId] = useState('');
  const [ppcPaqueteId, setPpcPaqueteId] = useState('');
  const [ppcFechaExpiracion, setPpcFechaExpiracion] = useState('');
  const [ppcHistorial, setPpcHistorial] = useState<any[]>([]);
  const [ppcCargando, setPpcCargando] = useState(false);
  const [ppcError, setPpcError] = useState('');

  const cargarHistorialCliente = useCallback(async (idCliente: string) => {
    if (!idCliente) { setPpcHistorial([]); return; }
    setPpcCargando(true);
    try {
      const r = await apiClient.get(`/api/paquetes/cliente/${idCliente}`);
      setPpcHistorial(r.data);
    } catch { setPpcHistorial([]); }
    finally { setPpcCargando(false); }
  }, []);

  const asignarPaqueteACliente = async () => {
    setPpcError('');
    if (!ppcClienteId) { setPpcError('Selecciona un cliente.'); return; }
    if (!ppcPaqueteId) { setPpcError('Selecciona un paquete.'); return; }
    try {
      await apiClient.post('/api/paquetes/asignar', {
        idCliente: Number(ppcClienteId),
        idPaquete: Number(ppcPaqueteId),
        fechaExpiracion: ppcFechaExpiracion || undefined,
      });
      mostrarToast('Paquete asignado al cliente correctamente.');
      setPpcPaqueteId(''); setPpcFechaExpiracion('');
      await cargarHistorialCliente(ppcClienteId);
    } catch (err: any) {
      const msg = err.response?.data;
      setPpcError(typeof msg === 'string' ? msg : 'No se pudo asignar el paquete.');
    }
  };

  const mostrarToast = (msg: string, esError = false) => {
    if (esError) { setErrorToast(msg); setTimeout(() => setErrorToast(null), 3000); }
    else         { setGuardadoOk(msg); setTimeout(() => setGuardadoOk(null), 3000); }
  };

  const cargarSucursales = useCallback(async () => {
    try { const r = await apiClient.get('/api/core/sucursales'); setSucursales(r.data); } catch { setSucursales([]); }
  }, []);
  const cargarPerfiles = useCallback(async () => {
    try { const r = await apiClient.get('/api/core/perfiles'); setPerfiles(r.data); } catch { setPerfiles([]); }
  }, []);
  const cargarUsuarios = useCallback(async () => {
    try { const r = await apiClient.get('/api/core/usuarios'); setUsuarios(r.data); } catch { setUsuarios([]); }
  }, []);
  const cargarEmpleados = useCallback(async () => {
    try { const r = await apiClient.get('/api/core/empleados'); setEmpleados(r.data); } catch { setEmpleados([]); }
  }, []);
  const cargarServicios = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/core/servicios');
      setServicios(r.data);
      const c = await apiClient.get('/api/core/categorias-servicio');
      setCategoriasServ(c.data);
    } catch (err:any) {
      setServicios([]);
      mostrarToast(err.response?.data?.mensaje || 'No se pudieron cargar los servicios. Verifica la conexión con el servidor.', true);
    }
  }, []);
  const cargarPaquetes = useCallback(async () => {
    try { const r = await apiClient.get('/api/core/paquetes'); setPaquetes(r.data); }
    catch (err:any) {
      setPaquetes([]);
      mostrarToast(err.response?.status===404
        ? 'No se pudieron cargar los paquetes: falta ejecutar el script SQL que crea la tabla Paquete.'
        : 'No se pudieron cargar los paquetes. Verifica la conexión con el servidor.', true);
    }
  }, []);
  const cargarInventario = useCallback(async () => {
    try {
      const idSuc = sucursales[0]?.id ?? ID_SUCURSAL_DEFAULT;
      const r = await apiClient.get(`/api/core/productos/${idSuc}`);
      setInventario(r.data);
    } catch (err:any) {
      setInventario([]);
      mostrarToast(err.response?.data?.mensaje || 'No se pudieron cargar los productos. Verifica la conexión con el servidor.', true);
    }
  }, [sucursales]);
  const cargarDiasBloqueados = useCallback(async () => {
    // El panel Core necesita ver también los inactivos (para poder reactivarlos)
    try { const r = await apiClient.get('/api/core/dias-bloqueados/todos'); setDiasBloqueados(r.data); } catch { setDiasBloqueados([]); }
  }, []);
  const cargarExpedientes = useCallback(async () => {
    try { const r = await apiClient.get('/api/core/expedientes'); setExpedientes(r.data); } catch { setExpedientes([]); }
  }, []);
  const cargarClientes = useCallback(async () => {
    try { const r = await apiClient.get('/api/auth/clientes'); setClientes(r.data); } catch { setClientes([]); }
  }, []);
  const cargarConsentimientos = useCallback(async () => {
    try { const r = await apiClient.get('/api/core/consentimientos'); setConsentimientos(r.data); } catch { setConsentimientos([]); }
  }, []);

  // Sucursales se cargan siempre al montar — las necesita el formulario de Empleados
  useEffect(() => { cargarSucursales(); }, [cargarSucursales]);

  useEffect(() => {
    const cargarSeccion = async () => {
      if (seccion==='sucursales') { setCargando(true); await cargarSucursales(); }
      else if (seccion==='perfiles')   { setCargando(true); await cargarPerfiles(); }
      else if (seccion==='usuarios')   { setCargando(true); await cargarUsuarios(); }
      else if (seccion==='empleados')  { setCargando(true); await cargarEmpleados(); }
      else if (seccion==='servicios')  { setCargando(true); await cargarServicios(); }
      else if (seccion==='inventario') { setCargando(true); await cargarInventario(); }
      else if (seccion==='diasBloqueados') { setCargando(true); await cargarDiasBloqueados(); }
      else if (seccion==='paquetes')   { setCargando(true); await Promise.all([cargarPaquetes(), cargarClientes()]); }
      else if (seccion==='expedientes') { setCargando(true); await Promise.all([cargarExpedientes(), cargarClientes()]); }
      else if (seccion==='consentimiento') { setCargando(true); await cargarConsentimientos(); }
      else return;
      setCargando(false);
    };
    cargarSeccion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion]);

  // Formulario dinámico — estado controlado
  const [form, setForm] = useState<Record<string,string>>({});
  const setF = (k:string, v:string) => setForm(prev => ({...prev, [k]:v}));

  // Los montos se escriben como pesos enteros (ver placeholders: "12000", "1500"...).
  // Antes se permitía el punto porque el usuario podía querer escribir separador de
  // miles ("12.500"), pero Number() lo interpreta como decimal (12.5) y si además
  // se usaba coma de decimales ("12.500,00") el punto agregado por el navegador al
  // limpiar rompía el parseo y el backend devolvía 400 al crear/editar el registro.
  const limpiarMonto = (v: string) => v.replace(/\D/g,'');

  const abrirCrear = () => {
    setEditId(null);
    setForm({});
    setModalOpen(true);
  };

  const abrirEditar = (id: number) => {
    setEditId(id);
    // Pre-cargar datos del registro seleccionado
    let datos: Record<string,string> = {};
    if (seccion==='sucursales') {
      const r = sucursales.find(x=>x.id===id)!;
      datos = { nombre:r.nombre, direccion:r.direccion, telefono:r.telefono||'' };
    } else if (seccion==='empleados') {
      const r = empleados.find(x=>x.id===id)!;
      datos = { nombres:r.nombres, apellidos:r.apellidos, documento:r.documento, tipoEmpleado:r.tipoEmpleado, telefono:r.telefono||'', sucursal:r.sucursal, tipoDocumento:String(r.idTipoDoc||1), sueldo:String(r.sueldo??''), direccion:r.direccion||'' };
    } else if (seccion==='expedientes') {
      const r = expedientes.find(x=>x.id===id)!;
      datos = { idCliente:String(r.idCliente), cliente:r.cliente, alergias:r.alergias||'', tipoPiel:r.tipoPiel||'Normal', medicamentos:r.medicamentos||'', notas:r.notas||'' };
    } else if (seccion==='usuarios') {
      const r = usuarios.find(x=>x.id===id)!;
      datos = { nombre:r.nombre, apellido:r.apellido, email:r.email, perfil:r.perfil };
    } else if (seccion==='servicios') {
      const r = servicios.find(x=>x.id===id)!;
      datos = { nombre:r.nombre, descripcion:r.descripcion||'', categoria:String(r.idCategoria||''), precio:String(r.precio), duracion:String(r.duracion||'') };
    } else if (seccion==='inventario') {
      const r = inventario.find(x=>x.id===id)!;
      datos = { nombre:r.nombre, descripcion:r.descripcion||'', precio:String(r.precio), stock:String(r.stock), stockMinimo:String(r.stockMinimo) };
    } else if (seccion==='paquetes') {
      const r = paquetes.find(x=>x.id===id)!;
      datos = { nombre:r.nombre, descripcion:r.descripcion||'', categoria:r.categoria||'', precio:String(r.precio), sesiones:String(r.sesiones) };
    } else if (seccion==='consentimiento') {
      const r = consentimientos.find(x=>x.id===id)!;
      datos = { titulo:r.titulo, descripcion:r.descripcion||'', contenido:r.contenido };
    } else if (seccion==='diasBloqueados') {
      const r = diasBloqueados.find(x=>x.id===id)!;
      const df = new Date(r.fecha);
      const fechaLocal = `${df.getFullYear()}-${String(df.getMonth()+1).padStart(2,'0')}-${String(df.getDate()).padStart(2,'0')}`;
      datos = { fecha:fechaLocal, motivo:r.motivo||'' };
    }
    setForm(datos);
    setModalOpen(true);
  };

  const softDelete = async (id: number) => {
    if (seccion==='sucursales') {
      try {
        await apiClient.delete(`/api/core/sucursales/${id}`);
        await cargarSucursales();
        mostrarToast('Sucursal desactivada correctamente.');
      } catch {
        mostrarToast('No se pudo desactivar la sucursal.', true);
      }
    } else if (seccion==='expedientes') {
      try {
        await apiClient.delete(`/api/core/expedientes/${id}`);
        await cargarExpedientes();
        mostrarToast('Expediente desactivado correctamente.');
      } catch {
        mostrarToast('No se pudo desactivar el expediente.', true);
      }
    }
    setConfirmDel(null);
  };

  const reactivarExpediente = async (id: number) => {
    try {
      await apiClient.put(`/api/core/expedientes/${id}/reactivar`);
      await cargarExpedientes();
      mostrarToast('Expediente reactivado correctamente.');
    } catch {
      mostrarToast('No se pudo reactivar el expediente.', true);
    }
  };

  const toggleUsuario = async (id: number) => {
    try {
      await apiClient.put(`/api/core/usuarios/${id}/toggle`);
      await cargarUsuarios();
      mostrarToast('Estado del usuario actualizado correctamente.');
    } catch {
      mostrarToast('No se pudo actualizar el usuario.', true);
    }
  };

  const toggleEmpleado = async (id: number) => {
    try {
      await apiClient.put(`/api/core/empleados/${id}/toggle`);
      await cargarEmpleados();
      mostrarToast('Estado del empleado actualizado correctamente.');
    } catch {
      mostrarToast('No se pudo actualizar el empleado.', true);
    }
  };

  const toggleGenerico = async (recurso: string, id: number, recargar: () => Promise<void>) => {
    try {
      await apiClient.put(`/api/core/${recurso}/${id}/toggle`);
      await recargar();
      mostrarToast('Estado actualizado correctamente.');
    } catch (err:any) {
      mostrarToast(typeof err.response?.data === 'string' ? err.response.data : 'No se pudo actualizar el estado.', true);
    }
  };

  const guardar = async () => {
    try {
      if (seccion==='sucursales') {
        const payload = { nombre: form.nombre||'', direccion: form.direccion||'', telefono: form.telefono||null };
        if (editId) await apiClient.put(`/api/core/sucursales/${editId}`, payload);
        else        await apiClient.post('/api/core/sucursales', payload);
        await cargarSucursales();
        mostrarToast(editId ? 'Sucursal actualizada correctamente.' : 'Sucursal creada correctamente.');
      } else if (seccion==='empleados') {
        const idSucursal = sucursales.find(s=>s.nombre===form.sucursal)?.id ?? sucursales[0]?.id ?? ID_SUCURSAL_DEFAULT;
        const payload = {
          nombres: form.nombres||'', apellidos: form.apellidos||'', numeroDocumento: form.documento||'',
          idTipoDoc: Number(form.tipoDocumento||1),
          tipoEmpleado: form.tipoEmpleado||'Especialista', telefono: form.telefono||null, idSucursal,
          sueldo: form.sueldo ? Number(form.sueldo) : null, direccion: form.direccion||null
        };
        if (editId) {
          await apiClient.put(`/api/core/empleados/${editId}`, payload);
          mostrarToast('Empleado actualizado correctamente.');
        } else {
          const r = await apiClient.post('/api/core/empleados', payload);
          mostrarToast(r.data.passwordProvisional
            ? `Empleado creado. Usuario: ${r.data.emailEmpresarial} / Contraseña provisional: ${r.data.passwordProvisional}`
            : 'Empleado creado correctamente.');
        }
        await cargarEmpleados();
      } else if (seccion==='expedientes') {
        const payload = { idCliente:Number(form.idCliente||0), tipoPiel:form.tipoPiel||'Normal', alergias:form.alergias||'Ninguna', medicamentos:form.medicamentos||'Ninguno', notas:form.notas||'' };
        if (editId) await apiClient.put(`/api/core/expedientes/${editId}`, payload);
        else        await apiClient.post('/api/core/expedientes', payload);
        await cargarExpedientes();
        mostrarToast(editId ? 'Expediente actualizado correctamente.' : 'Expediente creado correctamente.');
      } else if (seccion==='diasBloqueados') {
        if (!form.motivo || !form.motivo.trim()) { mostrarToast('El motivo es obligatorio para bloquear una fecha.', true); return; }
        if (!form.fecha) { mostrarToast('Selecciona una fecha.', true); return; }
        const payload = { fecha: form.fecha, motivo: form.motivo.trim() };
        if (editId) await apiClient.put(`/api/core/dias-bloqueados/${editId}`, payload);
        else        await apiClient.post('/api/core/dias-bloqueados', payload);
        await cargarDiasBloqueados();
        mostrarToast(editId ? 'Día no laborable actualizado correctamente.' : 'Día bloqueado correctamente.');
      } else if (seccion==='usuarios') {
        const idPerfil = perfiles.find(pf=>pf.nombre===form.perfil)?.id ?? perfiles[0]?.id ?? 1;
        const payload = { nombre:form.nombre||'', apellido:form.apellido||'', email:form.email||'', password:form.password||null, idPerfil };
        if (editId) await apiClient.put(`/api/core/usuarios/${editId}`, payload);
        else        await apiClient.post('/api/core/usuarios', payload);
        await cargarUsuarios();
        mostrarToast(editId ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.');
      } else if (seccion==='servicios') {
        if (!form.duracion || Number(form.duracion) <= 0) { mostrarToast('La duración del servicio es obligatoria.', true); return; }
        const payload = { nombre:form.nombre||'', descripcion:form.descripcion||null, idCategoria:form.categoria?Number(form.categoria):null, precioBase:Number(form.precio||0), duracionMinutos:form.duracion?Number(form.duracion):null };
        if (editId) await apiClient.put(`/api/core/servicios/${editId}`, payload);
        else        await apiClient.post('/api/core/servicios', payload);
        await cargarServicios();
        mostrarToast(editId ? 'Servicio actualizado correctamente.' : 'Servicio creado correctamente.');
      } else if (seccion==='inventario') {
        const idSucursal = sucursales[0]?.id ?? ID_SUCURSAL_DEFAULT;
        const payload = { nombre:form.nombre||'', descripcion:form.descripcion||null, precioBase:Number(form.precio||0), stock:Number(form.stock||0), stockMinimo:Number(form.stockMinimo||5), idSucursal };
        if (editId) await apiClient.put(`/api/core/productos/${editId}`, payload);
        else        await apiClient.post('/api/core/productos', payload);
        await cargarInventario();
        mostrarToast(editId ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.');
      } else if (seccion==='paquetes') {
        const payload = { nombre:form.nombre||'', descripcion:form.descripcion||null, categoria:form.categoria||null, precio:Number(form.precio||0), sesiones:Number(form.sesiones||1) };
        if (editId) await apiClient.put(`/api/core/paquetes/${editId}`, payload);
        else        await apiClient.post('/api/core/paquetes', payload);
        await cargarPaquetes();
        mostrarToast(editId ? 'Paquete actualizado correctamente.' : 'Paquete creado correctamente.');
      } else if (seccion==='consentimiento') {
        const payload = { titulo:form.titulo||'', descripcion:form.descripcion||null, contenido:form.contenido||'' };
        if (editId) await apiClient.put(`/api/core/consentimientos/${editId}`, payload);
        else        await apiClient.post('/api/core/consentimientos', payload);
        await cargarConsentimientos();
        mostrarToast(editId ? 'Documento de consentimiento actualizado correctamente.' : 'Documento de consentimiento creado correctamente.');
      }
    } catch (err: any) {
      const msg = err.response?.data;
      mostrarToast(typeof msg === 'string' ? msg : 'No se pudo guardar. Intenta de nuevo.', true);
    } finally {
      setConfirmSave(false);
      setModalOpen(false);
      setEditId(null);
      setForm({});
    }
  };

  const tabs = [
    {id:'sucursales',    label:'Sucursales',    icon:<Building2 size={14}/>},
    {id:'perfiles',      label:'Perfiles',      icon:<Shield size={14}/>},
    {id:'usuarios',      label:'Usuarios',      icon:<Users size={14}/>},
    {id:'empleados',     label:'Empleados',     icon:<UserCheck size={14}/>},
    {id:'servicios',     label:'Servicios',     icon:<ClipboardList size={14}/>},
    {id:'inventario',    label:'Inventario',    icon:<Package size={14}/>},
    {id:'expedientes',   label:'Expedientes',   icon:<Stethoscope size={14}/>},
    {id:'paquetes',      label:'Paquetes',      icon:<Gift size={14}/>},
    {id:'consentimiento',label:'Consentimiento',icon:<FileCheck size={14}/>},
    {id:'diasBloqueados',label:'Días No Laborables',icon:<CalendarOff size={14}/>},
    {id:'auditoria',     label:'Auditoría',     icon:<ClipboardList size={14}/>},
  ];

  // ── FORMULARIOS POR SECCIÓN ────────────────────────────────────────────────
  const NOMBRE_SINGULAR: Record<string,string> = {
    sucursales: 'Sucursal', empleados: 'Empleado', expedientes: 'Expediente', diasBloqueados: 'Día No Laborable',
    usuarios: 'Usuario', servicios: 'Servicio', inventario: 'Producto', paquetes: 'Paquete',
    consentimiento: 'Documento de consentimiento'
  };
  const renderForm = () => {
    const titulo = `${editId ? 'Editar' : 'Nuevo'} ${NOMBRE_SINGULAR[seccion] ?? ''}`;
    let campos = null;

    if (seccion==='sucursales') campos = (
      <>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Nombre de la sucursal</label>
            <input value={form.nombre||''} onChange={e=>setF('nombre',soloLetras(e.target.value))} placeholder="Ej: AuraSpa Piantini" style={iS}/></div>
          <div><label style={lS}>Teléfono (9 dígitos)</label>
            <input value={form.telefono||''} onChange={e=>setF('telefono',soloNumeros(e.target.value))} placeholder="8091234567" maxLength={9} style={iS}/></div>
        </div>
        <div style={{marginBottom:'14px'}}><label style={lS}>Dirección</label>
          <input value={form.direccion||''} onChange={e=>setF('direccion',e.target.value)} placeholder="Dirección completa" style={iS}/></div>
      </>
    );
    else if (seccion==='empleados') campos = (
      <>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Nombres</label>
            <input value={form.nombres||''} onChange={e=>setF('nombres',soloLetras(e.target.value))} placeholder="Nombres" style={iS}/></div>
          <div><label style={lS}>Apellidos</label>
            <input value={form.apellidos||''} onChange={e=>setF('apellidos',soloLetras(e.target.value))} placeholder="Apellidos" style={iS}/></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Tipo de documento</label>
            <select value={form.tipoDocumento||'1'} onChange={e=>setF('tipoDocumento',e.target.value)} style={iS}>
              <option value="1">Cédula</option>
              <option value="3">Pasaporte</option>
            </select></div>
          <div><label style={lS}>Número de documento</label>
            <input value={form.documento||''}
              onChange={e=>setF('documento', form.tipoDocumento==='3' ? e.target.value.slice(0,20) : e.target.value.replace(/\D/g,'').slice(0,11))}
              placeholder={form.tipoDocumento==='3' ? 'Pasaporte' : '00000000000'} style={iS}/></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Teléfono (9 dígitos)</label>
            <input value={form.telefono||''} onChange={e=>setF('telefono',soloNumeros(e.target.value))} placeholder="8091234567" maxLength={9} style={iS}/></div>
          <div><label style={lS}>Sueldo bruto mensual (RD$)</label>
            <input value={form.sueldo||''} onChange={e=>setF('sueldo',limpiarMonto(e.target.value))} placeholder="45000" style={iS}/></div>
        </div>
        <div style={{marginBottom:'14px'}}><label style={lS}>Dirección del hogar</label>
          <input value={form.direccion||''} onChange={e=>setF('direccion',e.target.value)} placeholder="Calle, número, sector, ciudad" style={iS}/></div>
        {Number(form.sueldo) > 0 && (()=>{ const nm = calcularNominaRD(Number(form.sueldo)); return (
          <div style={{background:'#faf8ff',border:'1px solid #e9dfff',borderRadius:'12px',padding:'12px 16px',marginBottom:'14px',fontSize:'0.82rem',color:'var(--aura-gray)'}}>
            <strong style={{color:'var(--aura-navy)'}}>Deducciones de ley (RD):</strong>{' '}
            AFP (2.87%): <strong>RD$ {nm.afp.toLocaleString('es-DO',{maximumFractionDigits:2})}</strong> ·{' '}
            SFS/ARS (3.04%): <strong>RD$ {nm.sfs.toLocaleString('es-DO',{maximumFractionDigits:2})}</strong> ·{' '}
            ISR: <strong>RD$ {nm.isr.toLocaleString('es-DO',{maximumFractionDigits:2})}</strong>{' '}
            → Neto: <strong style={{color:'#16a34a'}}>RD$ {nm.neto.toLocaleString('es-DO',{maximumFractionDigits:2})}</strong>
          </div>
        );})()}
        {!editId && form.nombres && form.apellidos && (
          <p style={{fontSize:'0.78rem',color:'#8b7bb5',marginBottom:'14px'}}>
            📧 Se asignará el correo empresarial: <strong>{(form.nombres.trim().toLowerCase().split(' ')[0]+'.'+form.apellidos.trim().toLowerCase().split(' ')[0]).normalize('NFD').replace(/[\u0300-\u036f]/g,'')}@auraspa.com</strong>
          </p>
        )}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Tipo de empleado</label>
            <select value={form.tipoEmpleado||'Especialista'} onChange={e=>setF('tipoEmpleado',e.target.value)} style={iS}>
              {['Especialista','Cajero','Admin'].map(t=><option key={t}>{t}</option>)}
            </select></div>
          <div><label style={lS}>Sucursal</label>
            <select value={form.sucursal||'AuraSpa Piantini'} onChange={e=>setF('sucursal',e.target.value)} style={iS}>
              {sucursales.map(s=><option key={s.id}>{s.nombre}</option>)}
            </select></div>
        </div>
      </>
    );
    else if (seccion==='expedientes') campos = (
      <>
        <div style={{marginBottom:'14px'}}><label style={lS}>Cliente</label>
          {editId ? (
            <input value={form.cliente||''} readOnly style={iS}/>
          ) : (
            <select value={form.idCliente||''} onChange={e=>setF('idCliente',e.target.value)} style={iS}>
              <option value="">Selecciona un cliente...</option>
              {clientes.map((c:any)=><option key={c.idCliente} value={c.idCliente}>{c.nombres} {c.apellidos}</option>)}
            </select>
          )}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Tipo de piel</label>
            <select value={form.tipoPiel||'Normal'} onChange={e=>setF('tipoPiel',e.target.value)} style={iS}>
              {['Normal','Mixta','Seca','Grasa','Sensible'].map(t=><option key={t}>{t}</option>)}
            </select></div>
          <div><label style={lS}>Alergias</label>
            <input value={form.alergias||''} onChange={e=>setF('alergias',e.target.value)} placeholder="Ej: Látex, Ninguna" style={iS}/></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Medicamentos</label>
            <input value={form.medicamentos||''} onChange={e=>setF('medicamentos',e.target.value)} placeholder="Ej: Ninguno" style={iS}/></div>
          <div><label style={lS}>Notas del especialista</label>
            <input value={form.notas||''} onChange={e=>setF('notas',e.target.value)} placeholder="Observaciones" style={iS}/></div>
        </div>
      </>
    );
    else if (seccion==='diasBloqueados') campos = (
      <>
        <div style={{marginBottom:'14px'}}><label style={lS}>Fecha</label>
          <input type="date" value={form.fecha||''} onChange={e=>setF('fecha',e.target.value)} style={iS}/></div>
        <div style={{marginBottom:'14px'}}><label style={lS}>Motivo *</label>
          <input value={form.motivo||''} onChange={e=>setF('motivo',e.target.value)} placeholder="Ej: Feriado nacional, cierre por mantenimiento" style={iS}/>
          {!form.motivo?.trim() && <p style={{fontSize:'0.76rem',color:'#ef4444',marginTop:'6px'}}>El motivo es obligatorio.</p>}
        </div>
      </>
    );
    else if (seccion==='usuarios') campos = (
      <>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Nombre</label>
            <input value={form.nombre||''} onChange={e=>setF('nombre',soloLetras(e.target.value))} placeholder="Nombre" style={iS}/></div>
          <div><label style={lS}>Apellido</label>
            <input value={form.apellido||''} onChange={e=>setF('apellido',soloLetras(e.target.value))} placeholder="Apellido" style={iS}/></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Correo electrónico</label>
            <input type="email" value={form.email||''} onChange={e=>setF('email',e.target.value)} placeholder="usuario@correo.com" style={iS}/></div>
          <div><label style={lS}>Perfil</label>
            <select value={form.perfil||perfiles[0]?.nombre||''} onChange={e=>setF('perfil',e.target.value)} style={iS}>
              {perfiles.map(pf=><option key={pf.id}>{pf.nombre}</option>)}
            </select></div>
        </div>
        <div style={{marginBottom:'14px'}}><label style={lS}>{editId ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
          <input type="password" value={form.password||''} onChange={e=>setF('password',e.target.value)} placeholder={editId?'Dejar vacío para no cambiarla':'Mínimo 8 caracteres'} style={iS}/></div>
      </>
    );
    else if (seccion==='servicios') campos = (
      <>
        <div style={{marginBottom:'14px'}}><label style={lS}>Nombre del servicio</label>
          <input value={form.nombre||''} onChange={e=>setF('nombre',e.target.value)} placeholder="Ej: Facial Hidratante" style={iS}/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Categoría</label>
            <select value={form.categoria||''} onChange={e=>setF('categoria',e.target.value)} style={iS}>
              <option value="">— Elegir —</option>
              {categoriasServ.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></div>
          <div><label style={lS}>Precio (RD$)</label>
            <input value={form.precio||''} onChange={e=>setF('precio',limpiarMonto(e.target.value))} placeholder="1500" style={iS}/></div>
          <div><label style={lS}>Duración (min) *</label>
            <input value={form.duracion||''} onChange={e=>setF('duracion',e.target.value.replace(/\D/g,''))} placeholder="60" required style={iS}/></div>
        </div>
        <div style={{marginBottom:'14px'}}><label style={lS}>Descripción</label>
          <input value={form.descripcion||''} onChange={e=>setF('descripcion',e.target.value)} placeholder="Descripción breve" style={iS}/></div>
      </>
    );
    else if (seccion==='inventario') campos = (
      <>
        <div style={{marginBottom:'14px'}}><label style={lS}>Nombre del producto</label>
          <input value={form.nombre||''} onChange={e=>setF('nombre',e.target.value)} placeholder="Ej: Crema hidratante 250ml" style={iS}/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Precio (RD$)</label>
            <input value={form.precio||''} onChange={e=>setF('precio',limpiarMonto(e.target.value))} placeholder="950" style={iS}/></div>
          <div><label style={lS}>Stock</label>
            <input value={form.stock||''} onChange={e=>setF('stock',e.target.value.replace(/\D/g,''))} placeholder="20" style={iS}/></div>
          <div><label style={lS}>Stock mínimo</label>
            <input value={form.stockMinimo||''} onChange={e=>setF('stockMinimo',e.target.value.replace(/\D/g,''))} placeholder="5" style={iS}/></div>
        </div>
        <div style={{marginBottom:'14px'}}><label style={lS}>Descripción</label>
          <input value={form.descripcion||''} onChange={e=>setF('descripcion',e.target.value)} placeholder="Descripción breve" style={iS}/></div>
      </>
    );
    else if (seccion==='paquetes') campos = (
      <>
        <div style={{marginBottom:'14px'}}><label style={lS}>Nombre del paquete</label>
          <input value={form.nombre||''} onChange={e=>setF('nombre',e.target.value)} placeholder="Ej: Depilación Láser — Axilas (6 sesiones)" style={iS}/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'14px',marginBottom:'14px'}}>
          <div><label style={lS}>Categoría</label>
            <input value={form.categoria||''} onChange={e=>setF('categoria',e.target.value)} placeholder="Ej: Depilación" style={iS}/></div>
          <div><label style={lS}>Precio (RD$)</label>
            <input value={form.precio||''} onChange={e=>setF('precio',limpiarMonto(e.target.value))} placeholder="12000" style={iS}/></div>
          <div><label style={lS}>Sesiones</label>
            <input value={form.sesiones||''} onChange={e=>setF('sesiones',e.target.value.replace(/\D/g,''))} placeholder="6" style={iS}/></div>
        </div>
        <div style={{marginBottom:'14px'}}><label style={lS}>Descripción</label>
          <input value={form.descripcion||''} onChange={e=>setF('descripcion',e.target.value)} placeholder="Qué incluye el paquete" style={iS}/></div>
      </>
    );
    else if (seccion==='consentimiento') campos = (
      <>
        <div style={{marginBottom:'14px'}}><label style={lS}>Título</label>
          <input value={form.titulo||''} onChange={e=>setF('titulo',e.target.value)} placeholder="Ej: Consentimiento para tratamiento facial" style={iS}/></div>
        <div style={{marginBottom:'14px'}}><label style={lS}>Descripción</label>
          <input value={form.descripcion||''} onChange={e=>setF('descripcion',e.target.value)} placeholder="Descripción breve del documento de consentimiento" style={iS}/></div>
        <div style={{marginBottom:'14px'}}><label style={lS}>Contenido (texto legal)</label>
          <textarea value={form.contenido||''} onChange={e=>setF('contenido',e.target.value)} placeholder="Texto completo del consentimiento informado..." rows={8}
            style={{...iS, resize:'vertical' as const}}/></div>
      </>
    );
    return (
      <div className="card-aura" style={{padding:'25px',marginBottom:'20px',borderLeft:'4px solid var(--aura-lavender)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
          <h4 style={{fontWeight:'700',color:'var(--aura-navy)',margin:0}}>
            {titulo}
          </h4>
          <button onClick={()=>{setModalOpen(false);setForm({});setEditId(null);}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--aura-gray)'}}><X size={18}/></button>
        </div>
        {campos}
        <div style={{display:'flex',gap:'10px',marginTop:'5px'}}>
          <button onClick={()=>setConfirmSave(true)} className="btn-AuraSpa" style={{padding:'10px 25px',display:'flex',alignItems:'center',gap:'7px'}}>
            <Save size={15}/> {editId ? 'Guardar cambios' : 'Crear registro'}
          </button>
          <button onClick={()=>{setModalOpen(false);setForm({});setEditId(null);}} className="btn-outline-aura" style={{padding:'10px 25px'}}>Cancelar</button>
        </div>
      </div>
    );
  };

  const filtrar = (arr: any[], campo='nombre') =>
    arr.filter(x => (x[campo]||'').toLowerCase().includes(busqueda.toLowerCase()) ||
                    JSON.stringify(x).toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <div style={{minHeight:'100vh',background:'var(--aura-beige)'}}>

      {/* ── Modal eliminar ── */}
      {confirmDel && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}>
          <div className="card-aura" style={{maxWidth:'380px',width:'90%',padding:'40px',borderRadius:'24px',textAlign:'center'}}>
            <div style={{fontSize:'2.5rem',marginBottom:'12px'}}>⚠️</div>
            <h4 style={{color:'var(--aura-navy)',fontWeight:'bold',marginBottom:'8px'}}>¿Eliminar registro?</h4>
            <p style={{color:'#888',fontSize:'0.88rem',marginBottom:'24px'}}>
              <strong>{confirmDel.nombre}</strong> será desactivado del sistema (soft delete).
            </p>
            <div style={{display:'flex',gap:'10px',justifyContent:'center'}}>
              <button onClick={()=>softDelete(confirmDel.id)} style={{padding:'10px 25px',background:'#ef4444',color:'white',border:'none',borderRadius:'30px',cursor:'pointer',fontWeight:'700'}}>Sí, eliminar</button>
              <button onClick={()=>setConfirmDel(null)} className="btn-outline-aura" style={{padding:'10px 25px'}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal activar/desactivar (genérico) ── */}
      {confirmToggle && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}>
          <div className="card-aura" style={{maxWidth:'380px',width:'90%',padding:'40px',borderRadius:'24px',textAlign:'center'}}>
            <div style={{fontSize:'2.5rem',marginBottom:'12px'}}>{confirmToggle.activo ? '⚠️' : '✅'}</div>
            <h4 style={{color:'var(--aura-navy)',fontWeight:'bold',marginBottom:'8px'}}>
              ¿{confirmToggle.activo ? 'Desactivar' : 'Activar'} este registro?
            </h4>
            <p style={{color:'#888',fontSize:'0.88rem',marginBottom:'24px'}}>
              <strong>{confirmToggle.nombre}</strong> {confirmToggle.activo ? 'dejará de estar disponible en el sistema.' : 'volverá a estar disponible en el sistema.'}
            </p>
            <div style={{display:'flex',gap:'10px',justifyContent:'center'}}>
              <button disabled={confirmToggle.ejecutando}
                onClick={async ()=>{ setConfirmToggle(t=>t?{...t,ejecutando:true}:t); await confirmToggle.accion(); setConfirmToggle(null); }}
                style={{padding:'10px 25px',background:confirmToggle.activo?'#ef4444':'#22c55e',color:'white',border:'none',borderRadius:'30px',cursor:'pointer',fontWeight:'700',opacity:confirmToggle.ejecutando?0.6:1}}>
                {confirmToggle.ejecutando ? 'Procesando…' : `Sí, ${confirmToggle.activo?'desactivar':'activar'}`}
              </button>
              <button onClick={()=>setConfirmToggle(null)} disabled={confirmToggle.ejecutando} className="btn-outline-aura" style={{padding:'10px 25px'}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal confirmar guardar ── */}
      {confirmSave && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}>
          <div className="card-aura" style={{maxWidth:'360px',width:'90%',padding:'40px',borderRadius:'24px',textAlign:'center'}}>
            <div style={{fontSize:'2.5rem',marginBottom:'12px'}}>💾</div>
            <h4 style={{color:'var(--aura-navy)',fontWeight:'bold',marginBottom:'8px'}}>¿Confirmar cambios?</h4>
            <p style={{color:'#888',fontSize:'0.88rem',marginBottom:'24px'}}>Esta acción {editId?'actualizará':'creará'} el registro en el sistema.</p>
            <div style={{display:'flex',gap:'10px',justifyContent:'center'}}>
              <button onClick={guardar} className="btn-AuraSpa" style={{padding:'10px 25px'}}>Sí, guardar</button>
              <button onClick={()=>setConfirmSave(false)} className="btn-outline-aura" style={{padding:'10px 25px'}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast éxito / error ── */}
      {guardadoOk && (
        <div style={{position:'fixed',top:'20px',right:'20px',background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'14px',padding:'14px 20px',zIndex:3000,display:'flex',alignItems:'center',gap:'8px',boxShadow:'0 4px 20px rgba(0,0,0,0.1)'}}>
          <CheckCircle size={18} color="#22c55e"/>
          <span style={{color:'#16a34a',fontWeight:'600',fontSize:'0.9rem'}}>{guardadoOk}</span>
        </div>
      )}
      {errorToast && (
        <div style={{position:'fixed',top:'20px',right:'20px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'14px',padding:'14px 20px',zIndex:3000,display:'flex',alignItems:'center',gap:'8px',boxShadow:'0 4px 20px rgba(0,0,0,0.1)'}}>
          <XCircle size={18} color="#ef4444"/>
          <span style={{color:'#b91c1c',fontWeight:'600',fontSize:'0.9rem'}}>{errorToast}</span>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{background:'white',borderBottom:'1px solid #f0edf5',padding:'15px 40px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <h2 style={{color:'var(--aura-navy)',fontWeight:'bold',margin:0,fontSize:'1.2rem'}}>AuraSpa <span style={{color:'var(--aura-lavender)'}}>Core</span></h2>
          <span style={{background:'#f0ecff',color:'var(--aura-lavender)',padding:'3px 12px',borderRadius:'20px',fontSize:'0.75rem',fontWeight:'600'}}>Panel Administrativo</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'15px'}}>
          <div style={{position:'relative'}}>
            <Search size={15} style={{position:'absolute',left:'11px',top:'10px',color:'#999'}}/>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar..."
              style={{padding:'8px 12px 8px 32px',borderRadius:'30px',border:'1px solid #e0d8f5',outline:'none',fontSize:'0.85rem',width:'200px'}}/>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <div style={{width:'28px',height:'28px',borderRadius:'50%',background:'var(--aura-navy)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:'0.8rem',fontWeight:'700'}}>{user?.nombre?.[0]||'A'}</div>
            <span style={{fontSize:'0.85rem',fontWeight:'500',color:'var(--aura-navy)'}}>{user?.nombre}</span>
          </div>
          <button onClick={()=>navigate('/dashboard/staff')} style={{background:'none',border:'none',cursor:'pointer',color:'#888',display:'flex',alignItems:'center',gap:'4px',fontSize:'0.82rem'}}>
            <LogOut size={14}/> Salir
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{background:'white',borderBottom:'1px solid #f0edf5',padding:'0 40px',display:'flex',overflowX:'auto'}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>{setSeccion(t.id as Seccion);setBusqueda('');setModalOpen(false);setEditId(null);setForm({});}}
            style={{padding:'12px 14px',border:'none',background:'none',cursor:'pointer',fontSize:'0.8rem',whiteSpace:'nowrap',
              display:'flex',alignItems:'center',gap:'5px',
              color:seccion===t.id?'var(--aura-lavender)':'var(--aura-gray)',
              fontWeight:seccion===t.id?'700':'400',
              borderBottom:seccion===t.id?'2px solid var(--aura-lavender)':'2px solid transparent'}}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Contenido ── */}
      <div style={{padding:'28px 40px'}}>

        {/* Encabezado de sección + botón agregar */}
        {seccion !== 'auditoria' && !SECCIONES_PROXIMAMENTE.includes(seccion) && (
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px',flexWrap:'wrap',gap:'10px'}}>
            <div>
              <h3 style={{color:'var(--aura-navy)',fontWeight:'bold',margin:0}}>{tabs.find(t=>t.id===seccion)?.label}</h3>
              <p style={{color:'#888',margin:0,fontSize:'0.83rem'}}>Gestión de {tabs.find(t=>t.id===seccion)?.label?.toLowerCase()} del sistema</p>
            </div>
            {SECCIONES_CON_CREAR.includes(seccion) && (
              <button onClick={abrirCrear} className="btn-AuraSpa" style={{padding:'10px 18px',display:'flex',alignItems:'center',gap:'6px',fontSize:'0.85rem'}}>
                <Plus size={15}/> Nuevo registro
              </button>
            )}
          </div>
        )}

        {cargando && <p style={{textAlign:'center',color:'var(--aura-gray)',padding:'40px'}}>Cargando...</p>}

        {/* Formulario (crear / editar) */}
        {modalOpen && SECCIONES_CON_CREAR.includes(seccion) && renderForm()}

        {/* ── SUCURSALES ── */}
        {seccion==='sucursales' && (
          <div className="card-aura" style={{overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <TH cols={['Nombre','Dirección','Teléfono','Estado','Acciones']}/>
              <tbody>{filtrar(sucursales).map((s,i)=>(
                <tr key={s.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                  <td style={tdB}>{s.nombre}</td><td style={tdS}>{s.direccion}</td>
                  <td style={tdS}>{s.telefono}</td><td style={tdS}><BadgeActivo activo={s.activo}/></td>
                  <Btns onEdit={()=>abrirEditar(s.id)} onDelete={()=>setConfirmDel({id:s.id,nombre:s.nombre})}/>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ── PERFILES (solo lectura) ── */}
        {seccion==='perfiles' && (
          <div className="card-aura" style={{overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <TH cols={['Nombre','Descripción']}/>
              <tbody>{filtrar(perfiles).map((p,i)=>(
                <tr key={p.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                  <td style={tdB}>{p.nombre}</td><td style={tdS}>{p.descripcion}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ── USUARIOS (activar/desactivar) ── */}
        {seccion==='usuarios' && (
          <div className="card-aura" style={{overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <TH cols={['Nombre','Email','Perfil','Estado','Acciones']}/>
              <tbody>{filtrar(usuarios,'nombre').map((u,i)=>(
                <tr key={u.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                  <td style={tdB}>{u.nombre} {u.apellido}</td><td style={tdS}>{u.email}</td><td style={tdS}>{u.perfil}</td>
                  <td style={tdS}><BadgeActivo activo={u.activo}/></td>
                  <td style={{padding:'10px 14px'}}>
                    <button onClick={()=>abrirEditar(u.id)} title="Editar" style={{background:'#f0ecff',border:'none',cursor:'pointer',color:'var(--aura-lavender)',padding:'5px 10px',borderRadius:'8px',marginRight:'6px'}}><Edit size={13}/></button>
                    {!(u.perfil==='Admin' && u.activo) && (
                      <button onClick={()=>setConfirmToggle({nombre:`${u.nombre} ${u.apellido}`, activo:u.activo, accion:()=>toggleUsuario(u.id)})}
                        style={{background:u.activo?'#fef2f2':'#f0fdf4',border:'none',cursor:'pointer',color:u.activo?'#ef4444':'#22c55e',padding:'6px 14px',borderRadius:'20px',fontSize:'0.78rem',fontWeight:'600'}}>
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ── EMPLEADOS ── */}
        {seccion==='empleados' && (
          <div className="card-aura" style={{overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <TH cols={['Código','Nombre','Documento','Tipo','Sueldo','Sucursal','Acciones']}/>
              <tbody>{filtrar(empleados,'nombres').map((e,i)=>(
                <tr key={e.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                  <td style={tdS}>{e.codigo||'—'}</td>
                  <td style={tdB}>{e.nombres} {e.apellidos}<div style={{fontWeight:400,fontSize:'0.72rem',color:'#999'}}>{e.emailEmpresarial||''}</div>
                    {e.contrasenaProvisional && (
                      <span style={{display:'inline-block',marginTop:'4px',background:'#fffbeb',color:'#92400e',border:'1px solid #fcd34d',padding:'2px 10px',borderRadius:'20px',fontSize:'0.7rem',fontWeight:600}}>
                        Contraseña provisional
                      </span>
                    )}</td>
                  <td style={tdS}>{e.documento}</td>
                  <td style={tdS}>{e.tipoEmpleado}</td>
                  <td style={tdS}>{e.sueldo?`RD$ ${Number(e.sueldo).toLocaleString()}`:'—'}</td>
                  <td style={tdS}>{e.sucursal}</td>
                  <td style={{padding:'10px 14px', display:'flex', gap:'6px', alignItems:'center'}}>
                    <button onClick={()=>abrirEditar(e.id)} title="Editar" style={{background:'#f0ecff',border:'none',cursor:'pointer',color:'var(--aura-lavender)',padding:'5px 10px',borderRadius:'8px'}}><Edit size={13}/></button>
                    <button onClick={()=>setConfirmToggle({nombre:`${e.nombres} ${e.apellidos}`, activo:e.activo!==false, accion:()=>toggleEmpleado(e.id)})}
                      style={{border:'none',cursor:'pointer',padding:'5px 12px',borderRadius:'8px',fontSize:'0.75rem',fontWeight:600,
                        background: e.activo===false ? '#f0fdf4' : '#fef2f2', color: e.activo===false ? '#22c55e' : '#ef4444'}}>
                      {e.activo===false ? 'Activar' : 'Desactivar'}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ── SERVICIOS (CRUD) ── */}
        {seccion==='servicios' && (
          <div className="card-aura" style={{overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <TH cols={['Nombre','Categoría','Precio','Duración','Estado','Acciones']}/>
              <tbody>{filtrar(servicios).map((s,i)=>(
                <tr key={s.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                  <td style={tdB}>{s.nombre}</td><td style={tdS}>{s.categoria}</td>
                  <td style={tdS}>RD$ {s.precio.toLocaleString()}</td><td style={tdS}>{s.duracion} min</td>
                  <td style={tdS}><BadgeActivo activo={s.activo}/></td>
                  <td style={{padding:'10px 14px'}}>
                    <button onClick={()=>abrirEditar(s.id)} title="Editar" style={{background:'#f0ecff',border:'none',cursor:'pointer',color:'var(--aura-lavender)',padding:'5px 10px',borderRadius:'8px',marginRight:'6px'}}><Edit size={13}/></button>
                    <button onClick={()=>setConfirmToggle({nombre:s.nombre, activo:s.activo, accion:()=>toggleGenerico('servicios', s.id, cargarServicios)})}
                      style={{background:s.activo?'#fef2f2':'#f0fdf4',border:'none',cursor:'pointer',color:s.activo?'#ef4444':'#22c55e',padding:'6px 14px',borderRadius:'20px',fontSize:'0.78rem',fontWeight:'600'}}>
                      {s.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ── INVENTARIO (CRUD) ── */}
        {seccion==='inventario' && (
          <div className="card-aura" style={{overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <TH cols={['Producto','Precio','Stock','Stock Mín.','Estado','Acciones']}/>
              <tbody>{filtrar(inventario).map((item,i)=>(
                <tr key={item.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                  <td style={tdB}>{item.nombre}</td>
                  <td style={tdS}>RD$ {Number(item.precio).toLocaleString()}</td>
                  <td style={tdS}><span style={{color:item.stock<=item.stockMinimo?'#ef4444':'inherit',fontWeight:item.stock<=item.stockMinimo?'700':'400'}}>{item.stock}</span></td>
                  <td style={tdS}>{item.stockMinimo}</td>
                  <td style={tdS}><BadgeActivo activo={item.activo}/></td>
                  <td style={{padding:'10px 14px'}}>
                    <button onClick={()=>abrirEditar(item.id)} title="Editar" style={{background:'#f0ecff',border:'none',cursor:'pointer',color:'var(--aura-lavender)',padding:'5px 10px',borderRadius:'8px',marginRight:'6px'}}><Edit size={13}/></button>
                    <button onClick={()=>setConfirmToggle({nombre:item.nombre, activo:item.activo, accion:()=>toggleGenerico('productos', item.id, cargarInventario)})}
                      style={{background:item.activo?'#fef2f2':'#f0fdf4',border:'none',cursor:'pointer',color:item.activo?'#ef4444':'#22c55e',padding:'6px 14px',borderRadius:'20px',fontSize:'0.78rem',fontWeight:'600'}}>
                      {item.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ── EXPEDIENTES ── */}
        {seccion==='expedientes' && (
          <div className="card-aura" style={{overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <TH cols={['Cliente','Tipo Piel','Alergias','Medicamentos','Notas','Estado','Acciones']}/>
              <tbody>{filtrar(expedientes,'cliente').map((e,i)=>(
                <tr key={e.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                  <td style={tdB}>{e.cliente}</td><td style={tdS}>{e.tipoPiel}</td>
                  <td style={tdS}>{e.alergias}</td><td style={tdS}>{e.medicamentos}</td><td style={tdS}>{e.notas}</td>
                  <td style={tdS}><BadgeActivo activo={(e as any).activo??true}/></td>
                  {e.activo ? (
                    <Btns onEdit={()=>abrirEditar(e.id)} onDelete={()=>setConfirmDel({id:e.id,nombre:e.cliente})}/>
                  ) : (
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',gap:'6px'}}>
                        <button onClick={()=>abrirEditar(e.id)} title="Editar" style={{background:'#f0ecff',border:'none',cursor:'pointer',color:'var(--aura-lavender)',padding:'5px 10px',borderRadius:'8px'}}><Edit size={13}/></button>
                        <button onClick={()=>reactivarExpediente(e.id)} title="Reactivar" style={{background:'#f0fdf4',border:'none',cursor:'pointer',color:'#22c55e',padding:'6px 14px',borderRadius:'20px',fontSize:'0.78rem',fontWeight:'600'}}>Reactivar</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ── PAQUETES (CRUD) ── */}
        {seccion==='paquetes' && (
          <div className="card-aura" style={{overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <TH cols={['Paquete','Categoría','Sesiones','Precio','Estado','Acciones']}/>
              <tbody>{filtrar(paquetes).map((pq,i)=>(
                <tr key={pq.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                  <td style={tdB}>{pq.nombre}<div style={{fontWeight:400,fontSize:'0.75rem',color:'#999'}}>{pq.descripcion}</div></td>
                  <td style={tdS}>{pq.categoria||'—'}</td>
                  <td style={tdS}>{pq.sesiones}</td>
                  <td style={tdS}>RD$ {Number(pq.precio).toLocaleString()}</td>
                  <td style={tdS}><BadgeActivo activo={pq.activo}/></td>
                  <td style={{padding:'10px 14px'}}>
                    <button onClick={()=>abrirEditar(pq.id)} title="Editar" style={{background:'#f0ecff',border:'none',cursor:'pointer',color:'var(--aura-lavender)',padding:'5px 10px',borderRadius:'8px',marginRight:'6px'}}><Edit size={13}/></button>
                    <button onClick={()=>setConfirmToggle({nombre:pq.nombre, activo:pq.activo, accion:()=>toggleGenerico('paquetes', pq.id, cargarPaquetes)})}
                      style={{background:pq.activo?'#fef2f2':'#f0fdf4',border:'none',cursor:'pointer',color:pq.activo?'#ef4444':'#22c55e',padding:'6px 14px',borderRadius:'20px',fontSize:'0.78rem',fontWeight:'600'}}>
                      {pq.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ── PAQUETES POR CLIENTE (asignar + historial) ── */}
        {seccion==='paquetes' && (
          <div className="card-aura" style={{padding:'25px',marginTop:'20px'}}>
            <h4 style={{fontWeight:'700',color:'var(--aura-navy)',marginBottom:'16px'}}>Paquetes por Cliente</h4>
            <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1.5fr auto',gap:'12px',alignItems:'end',marginBottom:'10px'}}>
              <div>
                <label style={lS}>Cliente</label>
                <select value={ppcClienteId} onChange={e=>{ setPpcClienteId(e.target.value); cargarHistorialCliente(e.target.value); }} style={iS}>
                  <option value="">— Buscar cliente —</option>
                  {clientes.map((c:any)=><option key={c.idCliente} value={c.idCliente}>{c.nombres} {c.apellidos}</option>)}
                </select>
              </div>
              <div>
                <label style={lS}>Paquete a asignar</label>
                <select value={ppcPaqueteId} onChange={e=>setPpcPaqueteId(e.target.value)} style={iS}>
                  <option value="">— Elegir paquete —</option>
                  {paquetes.filter((p:any)=>p.activo).map((p:any)=><option key={p.id} value={p.id}>{p.nombre} ({p.sesiones} sesiones)</option>)}
                </select>
              </div>
              <div>
                <label style={lS}>Vence (opcional)</label>
                <input type="date" value={ppcFechaExpiracion} onChange={e=>setPpcFechaExpiracion(e.target.value)} style={iS}/>
              </div>
              <button onClick={asignarPaqueteACliente} className="btn-AuraSpa" style={{padding:'11px 20px',whiteSpace:'nowrap'}}>Asignar</button>
            </div>
            {ppcError && <p style={{color:'#ef4444',fontSize:'0.82rem',marginBottom:'10px'}}>{ppcError}</p>}

            {ppcClienteId && (
              <div style={{marginTop:'20px'}}>
                <h5 style={{fontWeight:'600',color:'var(--aura-navy)',marginBottom:'10px',fontSize:'0.88rem'}}>Historial de sesiones de este cliente</h5>
                {ppcCargando ? (
                  <p style={{color:'#999',fontSize:'0.85rem'}}>Cargando...</p>
                ) : ppcHistorial.length===0 ? (
                  <p style={{color:'#999',fontSize:'0.85rem'}}>Este cliente no tiene paquetes asignados todavía.</p>
                ) : (
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                    <thead>
                      <tr style={{background:'#faf8ff',textAlign:'left'}}>
                        {['Paquete','Sesiones','Adquirido','Vence','Estado'].map(h=>(
                          <th key={h} style={{padding:'8px 12px',fontSize:'0.76rem',color:'var(--aura-gray)',fontWeight:700}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ppcHistorial.map((h:any)=>(
                        <tr key={h.idClientePaquete} style={{borderBottom:'1px solid #f0edf5'}}>
                          <td style={{padding:'8px 12px'}}>{h.paquete}</td>
                          <td style={{padding:'8px 12px'}}>{h.sesionesRestantes} de {h.sesionesTotales}</td>
                          <td style={{padding:'8px 12px',color:'#999'}}>{new Date(h.fechaAdquisicion).toLocaleDateString('es-DO')}</td>
                          <td style={{padding:'8px 12px',color:'#999'}}>{h.fechaExpiracion ? new Date(h.fechaExpiracion).toLocaleDateString('es-DO') : '—'}</td>
                          <td style={{padding:'8px 12px'}}>
                            <span style={{background:h.estado==='Activo'?'#f0fdf4':h.estado==='Expirado'?'#fef2f2':'#f4f4f4',
                              color:h.estado==='Activo'?'#22c55e':h.estado==='Expirado'?'#ef4444':'#888',
                              padding:'3px 10px',borderRadius:20,fontSize:'0.74rem',fontWeight:700}}>{h.estado}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── CONSENTIMIENTO (formularios) ── */}
        {seccion==='consentimiento' && (
          <div className="card-aura" style={{overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <TH cols={['Título','Descripción','Estado','Acciones']}/>
              <tbody>{filtrar(consentimientos,'titulo').map((c,i)=>(
                <tr key={c.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                  <td style={tdB}>{c.titulo}</td>
                  <td style={tdS}>{c.descripcion||'—'}</td>
                  <td style={tdS}><BadgeActivo activo={c.activo}/></td>
                  <td style={{padding:'10px 14px'}}>
                    <button onClick={()=>abrirEditar(c.id)} title="Editar" style={{background:'#f0ecff',border:'none',cursor:'pointer',color:'var(--aura-lavender)',padding:'5px 10px',borderRadius:'8px',marginRight:'6px'}}><Edit size={13}/></button>
                    <button onClick={()=>setConfirmToggle({nombre:c.titulo, activo:c.activo, accion:()=>toggleGenerico('consentimientos', c.id, cargarConsentimientos)})}
                      style={{background:c.activo?'#fef2f2':'#f0fdf4',border:'none',cursor:'pointer',color:c.activo?'#ef4444':'#22c55e',padding:'6px 14px',borderRadius:'20px',fontSize:'0.78rem',fontWeight:'600'}}>
                      {c.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ── DÍAS NO LABORABLES ── */}
        {seccion==='diasBloqueados' && (
          <div className="card-aura" style={{overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <TH cols={['Fecha','Motivo','Estado','Acciones']}/>
              <tbody>{diasBloqueados.length===0?(
                <tr><td colSpan={4} style={{padding:'30px',textAlign:'center',color:'#bbb',fontSize:'0.88rem'}}>No hay días bloqueados registrados</td></tr>
              ):filtrar(diasBloqueados,'motivo').map((d,i)=>(
                <tr key={d.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                  <td style={tdB}>{new Date(d.fecha).toLocaleDateString('es-DO',{day:'numeric',month:'long',year:'numeric'})}</td>
                  <td style={tdS}>{d.motivo}</td>
                  <td style={tdS}><BadgeActivo activo={d.activo!==false}/></td>
                  <td style={{padding:'10px 14px'}}>
                    <button onClick={()=>abrirEditar(d.id)} title="Editar" style={{background:'#f0ecff',border:'none',cursor:'pointer',color:'var(--aura-lavender)',padding:'5px 10px',borderRadius:'8px',marginRight:'6px'}}><Edit size={13}/></button>
                    <button onClick={()=>setConfirmToggle({nombre:d.motivo, activo:d.activo!==false, accion:()=>toggleGenerico('dias-bloqueados', d.id, cargarDiasBloqueados)})}
                      style={{border:'none',cursor:'pointer',padding:'5px 12px',borderRadius:'8px',fontSize:'0.75rem',fontWeight:600,
                        background: d.activo===false ? '#f0fdf4' : '#fef2f2', color: d.activo===false ? '#22c55e' : '#ef4444'}}>
                      {d.activo===false ? 'Reactivar' : 'Desbloquear'}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ── AUDITORÍA (solo lectura) ── */}
        {seccion==='auditoria' && (
          <div>
            <div style={{marginBottom:'18px'}}>
              <h3 style={{color:'var(--aura-navy)',fontWeight:'bold',margin:0}}>Auditoría del Sistema</h3>
              <p style={{color:'#888',margin:0,fontSize:'0.83rem'}}>Registro de cambios realizados — solo lectura</p>
            </div>
            <div className="card-aura" style={{overflow:'hidden',padding:0}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <TH cols={['Usuario','Acción','Valor Anterior','Valor Nuevo','Fecha']}/>
                <tbody>{filtrar(auditoriaLog,'accion').map((a,i)=>(
                  <tr key={a.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                    <td style={tdB}>{a.usuario}</td><td style={tdS}>{a.accion}</td>
                    <td style={tdS}>{a.valorAnterior}</td><td style={tdS}>{a.valorNuevo}</td>
                    <td style={tdS}>{a.fecha}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Core;
