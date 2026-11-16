import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth, saludoGenero } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/apiClient';
import jsPDF from 'jspdf';
import { getLogoBase64 } from '../utils/pdfLogo';
import {
  ShoppingCart, BarChart2, FileText, DoorOpen,
  CheckCircle, Trash2, Wifi, WifiOff, Send, LogOut, Clock,
  Search, CreditCard as CardIcon, Banknote, ArrowDownLeft, Download
} from 'lucide-react';

// ── TIPOS ─────────────────────────────────────────────────────
interface CartItem { id:number; descripcion:string; cantidad:number; precioUnitario:number; itbis:number; subtotal:number; idEmpleado?:number; }
type Seccion = 'apertura'|'ventas'|'movimientos'|'cotizaciones'|'cierre';
type Turno = 'Matutino (9AM-1PM)'|'Vespertino (1PM-5PM)'|'Personalizado';

interface ServicioApi { id:number; nombre:string; precio:number; categoria:string; }
interface EmpleadoApi { idEmpleado:number; nombreCompleto:string; }
interface ClienteApi { idCliente:number; nombre:string; numeroDocumento:string; tipoDocumento:string; email?:string; }
interface MovimientoApi { id:number; concepto:string; fecha:string; tipo:string; condicionPago:string; usuario:string; monto:number; estado:string; }
interface VentaSesionApi { idVenta:number; numeroFactura:string; idCliente:number|null; idMetodoPago:number|null; total:number; itbis:number; subtotal:number; estado:string; fecha:string; }

// Único método de pago real por botón — mapeado a MetodoPago.id_metodo_pago de la BD
const METODO_PAGO_ID: Record<string, number> = { Efectivo:1, Tarjeta:2, Transferencia:4 };
const METODO_PAGO_NOMBRE: Record<number, string> = { 1:'Efectivo', 2:'Tarjeta', 4:'Transferencia' };
const ID_SUCURSAL_DEFAULT = 1; // AuraSpa Principal — única sucursal activa
const ITBIS_RATE = 0.18;
const fmt = (n:number) => n.toLocaleString('es-DO',{minimumFractionDigits:2});
const formatFechaHora = (iso:string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-DO')} ${d.toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})}`;
};
const inputStyle:React.CSSProperties = { width:'100%', padding:'10px 15px', borderRadius:'15px', border:'1px solid #e8e0f5', outline:'none', background:'#fcfcfc', fontSize:'0.88rem', boxSizing:'border-box' };
const labelStyle:React.CSSProperties = { display:'block', marginBottom:'6px', fontSize:'0.82rem', color:'var(--aura-gray)', fontWeight:'500' };

// ── Tabla carrito ─────────────────────────────────────────────
const TablaCarrito:React.FC<{cart:CartItem[];onRemove:(id:number)=>void}> = ({cart,onRemove}) => (
  <div style={{overflowX:'auto'}}>
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
      <thead>
        <tr style={{background:'#EDE8F5'}}>
          {['#','Descripción','Cant.','Precio Unit.','ITBIS','Subtotal',''].map(h=>(
            <th key={h} style={{padding:'10px 14px',textAlign:'left',fontWeight:'600',color:'var(--aura-navy)',borderBottom:'2px solid #e8e0f5'}}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cart.length===0?(
          <tr><td colSpan={7} style={{padding:'30px',textAlign:'center',color:'#bbb',fontSize:'0.88rem'}}>Sin ítems — selecciona un servicio</td></tr>
        ):cart.map((item,i)=>(
          <tr key={item.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
            <td style={{padding:'10px 14px',color:'var(--aura-gray)'}}>{i+1}</td>
            <td style={{padding:'10px 14px',fontWeight:'500',color:'var(--aura-navy)'}}>{item.descripcion}</td>
            <td style={{padding:'10px 14px'}}>{item.cantidad}</td>
            <td style={{padding:'10px 14px'}}>RD$ {fmt(item.precioUnitario)}</td>
            <td style={{padding:'10px 14px',color:'var(--aura-gray)'}}>RD$ {fmt(item.itbis)}</td>
            <td style={{padding:'10px 14px',fontWeight:'600',color:'var(--aura-navy)'}}>RD$ {fmt(item.subtotal)}</td>
            <td style={{padding:'10px 14px'}}>
              <button onClick={()=>onRemove(item.id)} style={{background:'#fef2f2',border:'none',cursor:'pointer',color:'#ef4444',padding:'4px 10px',borderRadius:'8px'}}><Trash2 size={14}/></button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Quita guiones para poder comparar cédulas escritas con o sin formato (ej. "001-0000001-1" vs "00100000011")
const normalizarDoc = (s:string) => s.replace(/-/g,'').toLowerCase();

// ── Búsqueda de cliente: tipo de documento + número (primero), nombre se autocompleta al encontrar ──
const BuscarCliente:React.FC<{clientes:ClienteApi[];onSelect:(c:ClienteApi)=>void}> = ({clientes,onSelect}) => {
  const [qNombre, setQNombre] = useState('');
  const [tipoDoc, setTipoDoc] = useState<''|'Cédula'|'Pasaporte'>('');
  const [qNumero, setQNumero] = useState('');
  const [seleccionado, setSeleccionado] = useState(false);

  const filtrados = (!seleccionado && (qNombre.length>1 || qNumero.length>1)) ? clientes.filter(c=>
    (qNombre.length>1 ? c.nombre.toLowerCase().includes(qNombre.toLowerCase()) : true) &&
    (tipoDoc ? (c.tipoDocumento||'').toLowerCase().includes(tipoDoc.toLowerCase()) : true) &&
    (qNumero.length>1 ? normalizarDoc(c.numeroDocumento||'').includes(normalizarDoc(qNumero)) : true)
  ) : [];

  const seleccionar = (c: ClienteApi) => {
    onSelect(c);
    setQNombre(c.nombre);
    setQNumero(c.numeroDocumento||'');
    setTipoDoc((c.tipoDocumento||'').includes('Pasaporte') ? 'Pasaporte' : (c.tipoDocumento||'').includes('Cédula') ? 'Cédula' : '');
    setSeleccionado(true);
  };

  return (
    <div style={{position:'relative'}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.4fr',gap:'10px'}}>
        <select value={tipoDoc} onChange={e=>{setTipoDoc(e.target.value as '' | 'Cédula' | 'Pasaporte'); setSeleccionado(false);}} style={{...inputStyle,cursor:'pointer'}}>
          <option value="">Tipo de documento</option>
          <option value="Cédula">Cédula</option>
          <option value="Pasaporte">Pasaporte</option>
        </select>
        <input type="text" placeholder="Número de documento..." value={qNumero} onChange={e=>{setQNumero(e.target.value); setSeleccionado(false);}} style={inputStyle}/>
        <div style={{position:'relative'}}>
          <Search size={14} style={{position:'absolute',left:'12px',top:'12px',color:'#999'}}/>
          <input type="text" placeholder="Nombre (se autocompleta)..." value={qNombre} onChange={e=>{setQNombre(e.target.value); setSeleccionado(false);}}
            style={{...inputStyle,paddingLeft:'34px'}}/>
        </div>
      </div>
      {filtrados.length>0&&(
        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'white',border:'1px solid #eee',borderRadius:'12px',zIndex:100,boxShadow:'0 4px 20px rgba(0,0,0,0.1)',maxHeight:'180px',overflowY:'auto',marginTop:'4px'}}>
          {filtrados.map(c=>(
            <div key={c.idCliente} onClick={()=>seleccionar(c)} style={{padding:'10px 16px',cursor:'pointer',fontSize:'0.88rem',borderBottom:'1px solid #f5f5f5'}}
              onMouseEnter={e=>(e.currentTarget.style.background='#f0ecff')}
              onMouseLeave={e=>(e.currentTarget.style.background='white')}>
              {c.nombre} — {c.tipoDocumento||'Sin tipo'}: {c.numeroDocumento}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Modal pago con tarjeta ─────────────────────────────────────
const ModalTarjeta:React.FC<{total:number;condicion:string;onConfirm:()=>void;onCancel:()=>void}> = ({total,condicion,onConfirm,onCancel}) => {
  const [paso, setPaso] = useState<'procesar'|'exito'>('procesar');
  const [procesando, setProcesando] = useState(false);
  const [abono, setAbono] = useState('');

  const simularPago = () => {
    setProcesando(true);
    setTimeout(()=>{ setProcesando(false); setPaso('exito'); },2000);
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div className="card-aura animate-fade-in" style={{width:'420px',padding:'40px',borderRadius:'24px',textAlign:'center'}}>
        {paso==='procesar'?(
          <>
            <div style={{background:'#f0ecff',color:'var(--aura-lavender)',width:'64px',height:'64px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}>
              <CardIcon size={28}/>
            </div>
            <h3 style={{color:'var(--aura-navy)',fontWeight:'bold',marginBottom:'8px'}}>Procesando tarjeta</h3>
            {condicion==='Credito'&&(
              <div style={{marginBottom:'16px',textAlign:'left'}}>
                <label style={labelStyle}>Abono inicial (RD$) <span style={{color:'#888',fontWeight:'normal'}}>(opcional)</span></label>
                <input type="text" value={abono} onChange={e=>{ if(/^\d*\.?\d*$/.test(e.target.value)) setAbono(e.target.value); }}
                  placeholder="0.00" style={inputStyle}/>
                <p style={{color:'#888',fontSize:'0.78rem',marginTop:'4px'}}>
                  Saldo a crédito: RD$ {fmt(total - (parseFloat(abono)||0))}
                </p>
              </div>
            )}
            <div style={{background:'#f8f6ff',borderRadius:'14px',padding:'16px',marginBottom:'20px'}}>
              <div style={{fontSize:'0.82rem',color:'#888',marginBottom:'4px'}}>Total {condicion==='Credito'?'de la venta':'a cobrar'}</div>
              <div style={{fontSize:'1.8rem',fontWeight:'bold',color:'var(--aura-navy)'}}>RD$ {fmt(total)}</div>
            </div>
            {procesando?(
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'10px',padding:'16px',background:'#f0ecff',borderRadius:'14px'}}>
                <div style={{width:'20px',height:'20px',border:'3px solid var(--aura-lavender)',borderTop:'3px solid transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                <span style={{color:'var(--aura-lavender)',fontWeight:'600'}}>Pasando tarjeta...</span>
              </div>
            ):(
              <div style={{display:'flex',gap:'12px'}}>
                <button onClick={simularPago} className="btn-AuraSpa" style={{flex:1,padding:'13px',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>
                  <CardIcon size={16}/> Pasar tarjeta
                </button>
                <button onClick={onCancel} className="btn-outline-aura" style={{flex:1,padding:'13px'}}>Cancelar</button>
              </div>
            )}
          </>
        ):(
          <>
            <CheckCircle size={52} color="#22c55e" style={{marginBottom:'16px'}}/>
            <h3 style={{color:'var(--aura-navy)',fontWeight:'bold',marginBottom:'8px'}}>¡Pago aprobado!</h3>
            {condicion==='Credito'&&abono&&(
              <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'12px',padding:'14px',marginBottom:'16px',fontSize:'0.88rem'}}>
                <div>Abono recibido: <strong>RD$ {fmt(parseFloat(abono)||0)}</strong></div>
                <div>Saldo pendiente: <strong style={{color:'#f59e0b'}}>RD$ {fmt(total-(parseFloat(abono)||0))}</strong></div>
              </div>
            )}
            <p style={{color:'#888',fontSize:'0.88rem',marginBottom:'20px'}}>La transacción fue procesada correctamente.</p>
            <button onClick={onConfirm} className="btn-AuraSpa" style={{width:'100%',padding:'13px'}}>Finalizar</button>
          </>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
const Caja:React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const esAdmin = user?.perfil==='Admin';

  const [seccion,  setSeccion]  = useState<Seccion>('apertura');
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [fondoCaja,   setFondoCaja]   = useState(0);
  const [idSesionCaja, setIdSesionCaja] = useState<number|null>(null);
  const [conectado, setConectado] = useState(true);
  const [sucursalActiva, setSucursalActiva] = useState('AuraSpa Piantini — Sucursal Principal');
  const [idSucursalActiva, setIdSucursalActiva] = useState<number>(ID_SUCURSAL_DEFAULT);

  useEffect(() => {
    const verificarConexion = () => {
      apiClient.get('/api/catalog/categorias')
        .then(() => setConectado(true))
        .catch(() => setConectado(false));
    };
    verificarConexion();
    apiClient.get('/api/catalog/sucursales').then(res => {
      if (res.data.length > 0) { setSucursalActiva(res.data[0].nombre); setIdSucursalActiva(res.data[0].idSucursal); }
    }).catch(() => {});

    // Reactivo: se actualiza al instante si el navegador detecta cambio de red,
    // y se re-verifica contra el backend cada 30s por si la red sigue "arriba"
    // pero el servidor no responde (o viceversa).
    const alRecuperarConexion = () => verificarConexion();
    const alPerderConexion = () => setConectado(false);
    window.addEventListener('online', alRecuperarConexion);
    window.addEventListener('offline', alPerderConexion);
    const intervalo = setInterval(verificarConexion, 30000);
    return () => {
      window.removeEventListener('online', alRecuperarConexion);
      window.removeEventListener('offline', alPerderConexion);
      clearInterval(intervalo);
    };
  }, []);

  // Restaura una sesión de caja ya abierta (ej. tras recargar la página)
  useEffect(() => {
    if (!user?.id) return;
    apiClient.get(`/api/caja/sesion-activa/${user.id}`).then(res => {
      setIdSesionCaja(res.data.idSesionCaja);
      setFondoCaja(res.data.montoInicial);
      setHoraApertura(res.data.fechaApertura);
      setCajaAbierta(true);
      setSeccion('ventas');
    }).catch(() => {}); // 404 = no hay sesión activa, es normal
  }, [user?.id]);

  // Apertura
  const [montoApertura, setMontoApertura] = useState('');
  const [turno, setTurno] = useState<Turno>('Matutino (9AM-1PM)');
  const [montoError, setMontoError] = useState('');

  // Datos reales desde la API
  const [servicios,     setServicios]     = useState<ServicioApi[]>([]);
  const [especialistas, setEspecialistas] = useState<EmpleadoApi[]>([]);
  const [clientes,      setClientes]      = useState<ClienteApi[]>([]);
  const categoriasDisponibles = Array.from(new Set(servicios.map(s=>s.categoria))).sort();

  useEffect(() => {
    apiClient.get('/api/catalog/empleados/0').then(res => setEspecialistas(res.data)).catch(() => {});
    apiClient.get('/api/auth/clientes').then(res => {
      setClientes(res.data.map((c:any) => ({ idCliente:c.idCliente, nombre:`${c.nombres} ${c.apellidos}`, numeroDocumento:c.numeroDocumento, tipoDocumento:c.tipoDocumento||'', email:c.email||'' })));
    }).catch(() => {});
    Promise.all([
      apiClient.get('/api/catalog/services'),
      apiClient.get('/api/catalog/products'),
    ]).then(([svcRes, prodRes]) => {
      const svc = svcRes.data.map((s:any) => ({ id:s.idItem, nombre:s.nombre, precio:s.precioBase, categoria:s.categoria?.nombre ?? 'Otros' }));
      const prod = prodRes.data.map((p:any) => ({ id:p.idItem, nombre:p.nombre, precio:p.precioBase, categoria:'Productos' }));
      setServicios([...svc, ...prod]);
    }).catch(() => {});
  }, []);

  // Ventas
  const [cartVenta,      setCartVenta]      = useState<CartItem[]>([]);

  // Caja no tiene un botón de "Salir" propio (esta ruta no renderiza el Navbar) —
  // la sesión se cierra recargando/cerrando la pestaña o navegando a otra URL, así
  // que la advertencia nativa del navegador es la vía que realmente cubre ese caso.
  useEffect(() => {
    const alIntentarSalir = (e: BeforeUnloadEvent) => {
      if (cartVenta.length === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', alIntentarSalir);
    return () => window.removeEventListener('beforeunload', alIntentarSalir);
  }, [cartVenta.length]);
  const [ventaCliente,   setVentaCliente]   = useState('Cliente Final');
  const [ventaClienteId, setVentaClienteId] = useState<number|null>(null);
  const [ventaClienteDoc, setVentaClienteDoc] = useState('');
  const [ventaClienteTipoDoc, setVentaClienteTipoDoc] = useState('');
  const [ventaEspecialista, setVentaEspecialista] = useState('');
  const [ventaCategoria, setVentaCategoria] = useState('');
  const [ventaServicio,  setVentaServicio]  = useState('');
  const [ventaCantidad,  setVentaCantidad]  = useState('1');
  const [ventaCondicion, setVentaCondicion] = useState('Contado');
  const [ventaMetodo,    setVentaMetodo]    = useState('Efectivo');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [ventaSuccess,   setVentaSuccess]   = useState(false);
  const [ventaError,     setVentaError]     = useState('');
  const [espError,       setEspError]       = useState('');
  const [modalTarjeta,   setModalTarjeta]   = useState(false);
  const [requiereNCF,    setRequiereNCF]    = useState(false);
  const [ncfRnc,         setNcfRnc]         = useState('');
  const [ncfError,       setNcfError]       = useState('');
  const [clienteError,   setClienteError]   = useState('');
  const [ventaResetKey,  setVentaResetKey]  = useState(0);

  // Cotizaciones — sin especialista, solo ítems y precios; cliente es opcional (solo para enviar por correo)
  const [cartCot,   setCartCot]   = useState<CartItem[]>([]);
  const [cotServicio, setCotServicio] = useState('');
  const [cotCantidad, setCotCantidad] = useState('1');
  const [cotSuccess,  setCotSuccess]  = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [emailEnviando, setEmailEnviando] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [cotCliente, setCotCliente] = useState('');
  const [cotClienteId, setCotClienteId] = useState<number|null>(null);
  const [cotClienteEmail, setCotClienteEmail] = useState('');
  const [cotResetKey, setCotResetKey] = useState(0);
  const cotSnapshotRef = useRef<{items:CartItem[]; numero:string}|null>(null);
  const cotContador = useRef(1001);
  const [cotNumero, setCotNumero] = useState(`COT-${String(cotContador.current).padStart(4,'0')}`);
  const [cotizacionesRegistradas, setCotizacionesRegistradas] = useState<any[]>([]);
  const [cotError, setCotError] = useState('');
  const cargarCotizaciones = useCallback(async () => {
    try { const res = await apiClient.get('/api/caja/cotizaciones'); setCotizacionesRegistradas(res.data); }
    catch { setCotizacionesRegistradas([]); }
  }, []);
  useEffect(() => { if(seccion==='cotizaciones') cargarCotizaciones(); }, [seccion, cargarCotizaciones]);

  // Movimientos
  const [movFechaDesde, setMovFechaDesde] = useState('');
  const [movFechaHasta, setMovFechaHasta] = useState('');
  const [movFiltrados,  setMovFiltrados]  = useState<MovimientoApi[]>([]);
  const [movFechaError, setMovFechaError] = useState('');
  const [movFacturaFiltro, setMovFacturaFiltro] = useState('');
  const [movEmpleadoFiltro, setMovEmpleadoFiltro] = useState('');
  const [movCondicionFiltro, setMovCondicionFiltro] = useState('Todos');

  const cargarMovimientos = useCallback(async (desde?:string, hasta?:string) => {
    try {
      const res = await apiClient.get('/api/caja/movimientos', { params: { desde, hasta } });
      setMovFiltrados(res.data);
    } catch { setMovFiltrados([]); }
  }, []);

  useEffect(() => { if(seccion==='movimientos') cargarMovimientos(); }, [seccion, cargarMovimientos]);

  // Cierre
  const [montoCierre,      setMontoCierre]      = useState('');
  const [montoCierreError, setMontoCierreError] = useState('');
  const [cierreSuccess,    setCierreSuccess]    = useState(false);
  const [observacionCierre, setObservacionCierre] = useState('');
  const [ventasSesion, setVentasSesion] = useState<VentaSesionApi[]>([]);
  const [cxcPendienteTotal, setCxcPendienteTotal] = useState(0);
  const [horaApertura, setHoraApertura] = useState('');
  const [horaCierre,   setHoraCierre]   = useState('');

  useEffect(() => {
    if (seccion==='cierre' && idSesionCaja) {
      apiClient.get(`/api/caja/ventas/${idSesionCaja}`).then(res => setVentasSesion(res.data)).catch(() => setVentasSesion([]));
      apiClient.get('/api/caja/cxc').then(res => {
        setCxcPendienteTotal(res.data.reduce((a:number,c:any)=>a+c.saldoPendiente,0));
      }).catch(() => setCxcPendienteTotal(0));
    }
  }, [seccion, idSesionCaja]);

  const validarNumero = (val:string, setter:(v:string)=>void, errSetter:(v:string)=>void) => {
    if(val!==''&&!/^\d*\.?\d*$/.test(val)){ errSetter('Solo valores numéricos.'); return; }
    errSetter(''); setter(val);
  };

  const agregarItem = (cart:CartItem[], setCart:React.Dispatch<React.SetStateAction<CartItem[]>>, svcId:string, cantStr:string, idEmpleado?:number) => {
    const svc = servicios.find(s=>s.id===Number(svcId));
    if(!svc) return;
    const cantidad = parseInt(cantStr)||1;
    const sub = svc.precio*cantidad;
    const itbis = sub*ITBIS_RATE;
    const ex = cart.find(i=>i.id===svc.id);
    if(ex){
      setCart(cart.map(i=>i.id===svc.id?{...i,cantidad:i.cantidad+cantidad,itbis:(i.cantidad+cantidad)*svc.precio*ITBIS_RATE,subtotal:(i.cantidad+cantidad)*svc.precio*(1+ITBIS_RATE)}:i));
    } else {
      setCart([...cart,{id:svc.id,descripcion:svc.nombre,cantidad,precioUnitario:svc.precio,itbis,subtotal:sub+itbis,idEmpleado}]);
    }
  };

  const generarCotizacionPDF = async (items:CartItem[], numero:string): Promise<InstanceType<typeof jsPDF>> => {
    const doc = new jsPDF();
    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const fechaHoy = new Date().toLocaleDateString('es-DO', { day:'numeric', month:'long', year:'numeric' });

    doc.setFillColor(26,26,46);
    doc.rect(0,0,pageWidth,45,'F');
    try {
      const logo = await getLogoBase64();
      doc.addImage(logo, 'PNG', margin, 4, 18, 20.5);
    } catch {
      doc.setFontSize(22); doc.setFont('helvetica','bold');
      doc.setTextColor(255,255,255); doc.text('AURA', margin, 22);
      const auraWidth = doc.getTextWidth('AURA');
      doc.setTextColor(151,138,221); doc.text(' Spa', margin+auraWidth, 22);
    }
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(200,200,220);
    doc.text('Cotización de Servicios / Productos', margin, 32);
    doc.text(sucursalActiva, margin, 39);

    doc.setFontSize(8); doc.setTextColor(180,180,200);
    doc.text('No. Cotización', pageWidth-margin, 22, { align:'right' });
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(151,138,221);
    doc.text(numero, pageWidth-margin, 30, { align:'right' });
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(180,180,200);
    doc.text(`Emitido: ${fechaHoy}`, pageWidth-margin, 38, { align:'right' });

    doc.setDrawColor(151,138,221); doc.setLineWidth(0.8);
    doc.line(margin,50,pageWidth-margin,50);

    let y = 65;
    doc.setFillColor(237,232,245);
    doc.rect(margin,y-5,pageWidth-2*margin,10,'F');
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(31,45,61);
    doc.text('Servicio / Producto', margin+2, y+2);
    doc.text('Cant.', pageWidth-70, y+2, { align:'right' });
    doc.text('Precio Unit.', pageWidth-45, y+2, { align:'right' });
    doc.text('Subtotal', pageWidth-margin, y+2, { align:'right' });
    y += 12;

    doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
    items.forEach(item => {
      doc.text(item.descripcion.slice(0,35), margin+2, y);
      doc.text(String(item.cantidad), pageWidth-70, y, { align:'right' });
      doc.text(`RD$ ${item.precioUnitario.toLocaleString('es-DO',{minimumFractionDigits:2})}`, pageWidth-45, y, { align:'right' });
      doc.text(`RD$ ${(item.precioUnitario*item.cantidad).toLocaleString('es-DO',{minimumFractionDigits:2})}`, pageWidth-margin, y, { align:'right' });
      y += 7;
    });

    y += 5;
    doc.setDrawColor(220,216,240); doc.line(margin,y,pageWidth-margin,y); y += 8;
    const subtotal = items.reduce((a,i)=>a+i.precioUnitario*i.cantidad,0);
    const itbisTot = items.reduce((a,i)=>a+i.itbis,0);
    doc.setFont('helvetica','bold'); doc.setTextColor(31,45,61);
    doc.text(`Total (inc. ITBIS 18%): RD$ ${(subtotal+itbisTot).toLocaleString('es-DO',{minimumFractionDigits:2})}`, pageWidth-margin, y, { align:'right' });
    y += 18;

    doc.setDrawColor(151,138,221); doc.setLineWidth(0.5);
    doc.line(margin,y,pageWidth-margin,y); y += 8;
    doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(160,160,160);
    doc.text(`${numero} — Cotización válida por 15 días a partir del ${fechaHoy}`, pageWidth/2, y, { align:'center' });

    doc.setFillColor(26,26,46);
    doc.rect(0,pageHeight-12,pageWidth,12,'F');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(180,180,200);
    doc.text('www.auraspa.com  |  contacto@auraspa.com  |  809-000-0000', pageWidth/2, pageHeight-4, { align:'center' });

    return doc;
  };

  const generarFacturaVentaPDF = async (
    items:CartItem[], idVenta:number,
    cliente:{nombre:string;doc:string;tipoDoc:string},
    especialistaNombre:string, metodoPago:string, condicionPago:string,
    ncf?:string
  ) => {
    const doc = new jsPDF();
    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const fechaHoy = new Date().toLocaleDateString('es-DO', { day:'numeric', month:'long', year:'numeric' });
    const horaHoy  = new Date().toLocaleTimeString('es-DO', { hour:'2-digit', minute:'2-digit' });
    const numFactura = `FAC-${idVenta}`;

    doc.setFillColor(26,26,46);
    doc.rect(0,0,pageWidth,45,'F');
    try {
      const logo = await getLogoBase64();
      doc.addImage(logo, 'PNG', margin, 4, 18, 20.5);
    } catch {
      doc.setFontSize(22); doc.setFont('helvetica','bold');
      doc.setTextColor(255,255,255); doc.text('AURA', margin, 22);
      const auraWidth = doc.getTextWidth('AURA');
      doc.setTextColor(151,138,221); doc.text(' Spa', margin+auraWidth, 22);
    }
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(200,200,220);
    doc.text('Comprobante de Venta', margin, 32);
    doc.text(sucursalActiva, margin, 39);

    doc.setFontSize(8); doc.setTextColor(180,180,200);
    doc.text('No. Factura', pageWidth-margin, 16, { align:'right' });
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(151,138,221);
    doc.text(numFactura, pageWidth-margin, 24, { align:'right' });
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(180,180,200);
    doc.text(`${fechaHoy}, ${horaHoy}`, pageWidth-margin, 32, { align:'right' });
    if (ncf) {
      doc.setFont('helvetica','bold'); doc.setTextColor(210,205,235);
      doc.text(`NCF: ${ncf}`, pageWidth-margin, 40, { align:'right' });
    }

    doc.setDrawColor(151,138,221); doc.setLineWidth(0.8);
    doc.line(margin,50,pageWidth-margin,50);

    let y = 62;
    doc.setFontSize(9); doc.setTextColor(31,45,61);
    doc.setFont('helvetica','bold'); doc.text('Cliente:', margin, y);
    doc.setFont('helvetica','normal'); doc.text(cliente.nombre, margin+40, y);
    y += 7;
    if (cliente.doc) {
      const tipoDocCorto = cliente.tipoDoc?.includes('Pasaporte') ? 'Pasaporte' : cliente.tipoDoc?.includes('Cédula') ? 'Cédula' : (cliente.tipoDoc || 'Documento');
      doc.setFont('helvetica','bold'); doc.text(`${tipoDocCorto}:`, margin, y);
      doc.setFont('helvetica','normal'); doc.text(cliente.doc, margin+40, y);
      y += 7;
    }
    doc.setFont('helvetica','bold'); doc.text('Especialista:', margin, y);
    doc.setFont('helvetica','normal'); doc.text(especialistaNombre || '—', margin+40, y);
    y += 7;
    doc.setFont('helvetica','bold'); doc.text('Método de pago:', margin, y);
    doc.setFont('helvetica','normal'); doc.text(`${metodoPago} (${condicionPago})`, margin+40, y);
    y += 12;

    doc.setFillColor(237,232,245);
    doc.rect(margin,y-5,pageWidth-2*margin,10,'F');
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(31,45,61);
    doc.text('Servicio / Producto', margin+2, y+2);
    doc.text('Cant.', pageWidth-90, y+2, { align:'right' });
    doc.text('Precio Unit.', pageWidth-60, y+2, { align:'right' });
    doc.text('Subtotal', pageWidth-margin, y+2, { align:'right' });
    y += 12;

    doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
    items.forEach(item => {
      doc.text(item.descripcion.slice(0,35), margin+2, y);
      doc.text(String(item.cantidad), pageWidth-90, y, { align:'right' });
      doc.text(`RD$ ${fmt(item.precioUnitario)}`, pageWidth-60, y, { align:'right' });
      doc.text(`RD$ ${fmt(item.precioUnitario*item.cantidad)}`, pageWidth-margin, y, { align:'right' });
      y += 7;
    });

    y += 5;
    doc.setDrawColor(220,216,240); doc.line(margin,y,pageWidth-margin,y); y += 8;
    const subtotal = items.reduce((a,i)=>a+i.precioUnitario*i.cantidad,0);
    const itbisTot = items.reduce((a,i)=>a+i.itbis,0);
    doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
    doc.text('Subtotal:', pageWidth-90, y, { align:'right' }); doc.text(`RD$ ${fmt(subtotal)}`, pageWidth-margin, y, { align:'right' }); y += 7;
    doc.text('ITBIS (18%):', pageWidth-90, y, { align:'right' }); doc.text(`RD$ ${fmt(itbisTot)}`, pageWidth-margin, y, { align:'right' }); y += 9;
    doc.setDrawColor(151,138,221); doc.line(pageWidth-100,y-4,pageWidth-margin,y-4);
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(31,45,61);
    doc.text('Total a Pagar:', pageWidth-90, y, { align:'right' }); doc.text(`RD$ ${fmt(subtotal+itbisTot)}`, pageWidth-margin, y, { align:'right' });
    y += 18;

    doc.setDrawColor(151,138,221); doc.setLineWidth(0.5);
    doc.line(margin,y,pageWidth-margin,y); y += 8;
    doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(160,160,160);
    doc.text(`${numFactura} — Gracias por su preferencia`, pageWidth/2, y, { align:'center' });

    doc.setFillColor(26,26,46);
    doc.rect(0,pageHeight-12,pageWidth,12,'F');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(180,180,200);
    doc.text('www.auraspa.com  |  contacto@auraspa.com  |  809-000-0000', pageWidth/2, pageHeight-4, { align:'center' });

    doc.save(`factura-${numFactura}.pdf`);
  };

  // Reporte del día disponible en cualquier momento mientras la caja esté
  // abierta — a diferencia del reporte de cierre, no incluye diferencia de
  // efectivo (eso solo se conoce al contar el dinero al cerrar el turno).
  const descargarReporteDelDia = async () => {
    const itbisTotalDia = ventasNoCanceladas.reduce((a,v)=>a+v.itbis,0);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const fechaHoy = new Date().toLocaleDateString('es-DO', { day:'numeric', month:'long', year:'numeric' });

    doc.setFillColor(26,26,46);
    doc.rect(0,0,pageWidth,45,'F');
    try {
      const logo = await getLogoBase64();
      doc.addImage(logo, 'PNG', margin, 4, 18, 20.5);
    } catch {
      doc.setFontSize(22); doc.setFont('helvetica','bold');
      doc.setTextColor(255,255,255); doc.text('AURA', margin, 22);
      const w = doc.getTextWidth('AURA');
      doc.setTextColor(151,138,221); doc.text(' Spa', margin+w, 22);
    }
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(200,200,220);
    doc.text('Reporte del Día (turno en curso)', margin, 32);
    doc.text(sucursalActiva, margin, 39);
    doc.setFontSize(8); doc.setTextColor(180,180,200);
    doc.text(`Emitido: ${fechaHoy}`, pageWidth-margin, 22, { align:'right' });

    doc.setDrawColor(151,138,221); doc.setLineWidth(0.8);
    doc.line(margin,50,pageWidth-margin,50);

    let y = 62;
    doc.setFontSize(9); doc.setTextColor(31,45,61);
    const resumenFilas:[string,string][] = [
      ['Cajero:', user?.nombre || '—'],
      ['Turno:', turno],
      ['Hora apertura:', horaApertura ? formatFechaHora(horaApertura) : '—'],
      ['Fondo de apertura:', `RD$ ${fmt(fondoCaja)}`],
    ];
    resumenFilas.forEach(([label,valor]) => {
      doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80); doc.text(label, margin, y);
      doc.setFont('helvetica','bold'); doc.setTextColor(31,45,61); doc.text(valor, margin+70, y);
      y += 7;
    });

    y += 4;
    const totalesFilas:[string,string][] = [
      ['Ventas en efectivo:', `RD$ ${fmt(ventasEfectivo)}`],
      ['Ventas con tarjeta:', `RD$ ${fmt(ventasTarjeta)}`],
      ['Ventas por transferencia:', `RD$ ${fmt(ventasTransferencia)}`],
      ['ITBIS total del día:', `RD$ ${fmt(itbisTotalDia)}`],
    ];
    doc.setFontSize(9);
    totalesFilas.forEach(([label,valor]) => {
      doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80); doc.text(label, pageWidth-110, y);
      doc.setFont('helvetica','bold'); doc.setTextColor(31,45,61); doc.text(valor, pageWidth-margin, y, { align:'right' });
      y += 7;
    });

    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(31,45,61);
    doc.text('Total general del día (hasta el momento):', pageWidth-150, y);
    doc.text(`RD$ ${fmt(totalVentasTurno)}`, pageWidth-margin, y, { align:'right' });

    doc.setFillColor(26,26,46);
    doc.rect(0,doc.internal.pageSize.getHeight()-12,pageWidth,12,'F');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(180,180,200);
    doc.text('www.auraspa.com  |  contacto@auraspa.com  |  809-000-0000', pageWidth/2, doc.internal.pageSize.getHeight()-4, { align:'center' });

    doc.save(`reporte-del-dia-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const generarReporteCierrePDF = async () => {
    const doc = new jsPDF();
    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const fechaHoy = new Date().toLocaleDateString('es-DO', { day:'numeric', month:'long', year:'numeric' });

    doc.setFillColor(26,26,46);
    doc.rect(0,0,pageWidth,45,'F');
    try {
      const logo = await getLogoBase64();
      doc.addImage(logo, 'PNG', margin, 4, 18, 20.5);
    } catch {
      doc.setFontSize(22); doc.setFont('helvetica','bold');
      doc.setTextColor(255,255,255); doc.text('AURA', margin, 22);
      const auraWidth = doc.getTextWidth('AURA');
      doc.setTextColor(151,138,221); doc.text(' Spa', margin+auraWidth, 22);
    }
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(200,200,220);
    doc.text('Reporte de Cierre de Caja', margin, 32);
    doc.text(sucursalActiva, margin, 39);
    doc.setFontSize(8); doc.setTextColor(180,180,200);
    doc.text(`Emitido: ${fechaHoy}`, pageWidth-margin, 22, { align:'right' });

    doc.setDrawColor(151,138,221); doc.setLineWidth(0.8);
    doc.line(margin,50,pageWidth-margin,50);

    let y = 62;
    doc.setFontSize(9); doc.setTextColor(31,45,61);
    const resumenFilas:[string,string][] = [
      ['Cajero:', user?.nombre || '—'],
      ['Turno:', turno],
      ['Hora apertura:', horaApertura ? formatFechaHora(horaApertura) : '—'],
      ['Hora cierre:', horaCierre ? formatFechaHora(horaCierre) : '—'],
      ['Fondo de apertura:', `RD$ ${fmt(fondoCaja)}`],
    ];
    resumenFilas.forEach(([label,valor]) => {
      doc.setFont('helvetica','bold'); doc.text(label, margin, y);
      doc.setFont('helvetica','normal'); doc.text(valor, margin+55, y);
      y += 7;
    });
    y += 5;

    doc.setFillColor(237,232,245);
    doc.rect(margin,y-5,pageWidth-2*margin,10,'F');
    doc.setFontSize(8.5); doc.setFont('helvetica','bold'); doc.setTextColor(31,45,61);
    doc.text('Factura', margin+2, y+2);
    doc.text('Cliente', margin+45, y+2);
    doc.text('Método', pageWidth-85, y+2);
    doc.text('Total', pageWidth-margin, y+2, { align:'right' });
    y += 12;

    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
    ventasNoCanceladas.forEach(v => {
      const clienteNombre = v.idCliente ? (clientes.find(c=>c.idCliente===v.idCliente)?.nombre || 'Cliente') : 'Cliente Final';
      if (y > pageHeight - 45) { doc.addPage(); y = 25; }
      doc.text(v.numeroFactura || `FAC-${v.idVenta}`, margin+2, y);
      doc.text(clienteNombre.slice(0,25), margin+45, y);
      doc.text(METODO_PAGO_NOMBRE[v.idMetodoPago||0] || '—', pageWidth-85, y);
      doc.text(`RD$ ${fmt(v.total)}`, pageWidth-margin, y, { align:'right' });
      y += 6.5;
    });
    if (ventasNoCanceladas.length===0) { doc.text('Sin ventas registradas en este turno.', margin+2, y); y += 6.5; }

    y += 6;
    doc.setDrawColor(220,216,240); doc.line(margin,y,pageWidth-margin,y); y += 9;

    const itbisTotalDia = ventasNoCanceladas.reduce((a,v)=>a+v.itbis,0);
    const totalesFilas:[string,string][] = [
      ['Ventas en efectivo:', `RD$ ${fmt(ventasEfectivo)}`],
      ['Ventas con tarjeta:', `RD$ ${fmt(ventasTarjeta)}`],
      ['Ventas por transferencia:', `RD$ ${fmt(ventasTransferencia)}`],
      ['ITBIS total del día:', `RD$ ${fmt(itbisTotalDia)}`],
    ];
    doc.setFontSize(9);
    totalesFilas.forEach(([label,valor]) => {
      doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80); doc.text(label, pageWidth-110, y);
      doc.setFont('helvetica','bold'); doc.setTextColor(31,45,61); doc.text(valor, pageWidth-margin, y, { align:'right' });
      y += 7;
    });

    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(31,45,61);
    doc.text('Total general del día:', pageWidth-110, y);
    doc.text(`RD$ ${fmt(totalVentasTurno)}`, pageWidth-margin, y, { align:'right' }); y += 9;

    const diffColor:[number,number,number] = diferenciaCierre>=0 ? [22,197,94] : [239,68,68];
    doc.setTextColor(diffColor[0],diffColor[1],diffColor[2]);
    doc.text(`Diferencia de efectivo: RD$ ${fmt(diferenciaCierre)} ${diferenciaCierre>0?'(Sobrante)':diferenciaCierre<0?'(Faltante)':'(Cuadre exacto)'}`, pageWidth-110, y);
    y += 20;

    doc.setDrawColor(151,138,221); doc.setLineWidth(0.5);
    doc.line(margin,y,margin+70,y);
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(120,120,120);
    doc.text(`Firma del cajero: ${user?.nombre || ''}`, margin, y+6);
    doc.text(`Sello del sistema — AuraSpa POS — ${fechaHoy}`, pageWidth-margin, y+6, { align:'right' });

    doc.setFillColor(26,26,46);
    doc.rect(0,pageHeight-12,pageWidth,12,'F');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(180,180,200);
    doc.text('www.auraspa.com  |  contacto@auraspa.com  |  809-000-0000', pageWidth/2, pageHeight-4, { align:'center' });

    doc.save(`cierre-caja-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const handleAbrirCaja = async () => {
    if(!montoApertura||isNaN(Number(montoApertura))||Number(montoApertura)<0){ setMontoError('Ingresa un monto válido (puede ser 0).'); return; }
    try {
      const res = await apiClient.post('/api/caja/apertura', {
        idUsuario: user?.id,
        idSucursal: idSucursalActiva,
        montoInicial: Number(montoApertura),
        notas: turno
      });
      setIdSesionCaja(res.data.idSesionCaja);
      setFondoCaja(Number(montoApertura));
      setHoraApertura(res.data.fechaApertura);
      setCajaAbierta(true);
      setMontoError('');
      setSeccion('ventas');
    } catch (err:any) {
      const msg = err.response?.data;
      setMontoError(typeof msg === 'string' ? msg : 'No se pudo abrir la caja.');
    }
  };

  const subVenta = cartVenta.reduce((a,i)=>a+i.precioUnitario*i.cantidad,0);
  const itbVenta = cartVenta.reduce((a,i)=>a+i.itbis,0);
  const totVenta = cartVenta.reduce((a,i)=>a+i.subtotal,0);
  const cambioEfectivo = Number(efectivoRecibido)-totVenta;
  const efectivoInsuficiente = efectivoRecibido!==''&&Number(efectivoRecibido)<totVenta;

  const registrarVentaEnBackend = async () => {
    try {
      const especialistaNombre = especialistas.find(e=>e.idEmpleado===Number(ventaEspecialista))?.nombreCompleto || '';
      const res = await apiClient.post('/api/caja/venta', {
        idCliente: ventaClienteId,
        idSesionCaja: idSesionCaja,
        idMetodoPago: METODO_PAGO_ID[ventaMetodo],
        condicionPago: ventaCondicion==='Crédito' ? 'Credito' : 'Contado',
        detalles: cartVenta.map(i => ({ idItem:i.id, idEmpleado:i.idEmpleado, cantidad:i.cantidad, precioUnitario:i.precioUnitario, descuentoLinea:0 }))
      });
      const idVenta = res.data.idVenta;

      let ncfEmitido: string|undefined;
      if (requiereNCF) {
        try {
          const ncfRes = await apiClient.post('/api/ComprobanteFiscal/emitir', {
            idVenta,
            codigoTipoNCF: 'B01',
            rncCedulaReceptor: ncfRnc,
            nombreReceptor: ventaCliente,
            idUsuario: user?.id
          });
          ncfEmitido = ncfRes.data.numeroComprobante;
        } catch (ncfErr:any) {
          const msg = ncfErr.response?.data;
          setNcfError(typeof msg === 'string' ? msg : 'No se pudo emitir el comprobante fiscal; la venta sí quedó registrada.');
        }
      }

      await generarFacturaVentaPDF(
        cartVenta, idVenta,
        { nombre: ventaCliente, doc: ventaClienteDoc, tipoDoc: ventaClienteTipoDoc },
        especialistaNombre, ventaMetodo, ventaCondicion, ncfEmitido
      );

      setVentaError('');
      setVentaSuccess(true);
      setCartVenta([]); setEfectivoRecibido('');
      setVentaCliente('Cliente Final'); setVentaClienteId(null);
      setVentaClienteDoc(''); setVentaClienteTipoDoc('');
      setRequiereNCF(false); setNcfRnc(''); setClienteError('');
      setVentaResetKey(k=>k+1);
      setTimeout(()=>setVentaSuccess(false),3000);
    } catch (err:any) {
      const msg = err.response?.data;
      setVentaError(typeof msg === 'string' ? msg : 'No se pudo registrar la venta.');
    }
  };

  const enviarCotizacionPorCorreo = async () => {
    if (!cotClienteId) { setEmailError('Selecciona un cliente para enviar la cotización.'); return; }
    if (!cotClienteEmail) { setEmailError('Este cliente no tiene correo registrado.'); return; }
    const snap = cotSnapshotRef.current;
    if (!snap) return;
    setEmailEnviando(true); setEmailError('');
    try {
      const doc = await generarCotizacionPDF(snap.items, snap.numero);
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      await apiClient.post('/api/caja/cotizacion/enviar-correo', {
        email: cotClienteEmail,
        nombre: cotCliente,
        numeroCotizacion: snap.numero,
        pdfBase64
      });
      setEmailEnviado(true);
    } catch (err:any) {
      const msg = err.response?.data;
      setEmailError(typeof msg === 'string' ? msg : 'No se pudo enviar el correo. Intenta de nuevo.');
    } finally {
      setEmailEnviando(false);
    }
  };

  const handleFinalizarVenta = () => {
    if(!ventaClienteId){ setClienteError('Selecciona un cliente para finalizar la venta.'); return; }
    if(!ventaEspecialista){ setEspError('Selecciona un especialista.'); return; }
    if(cartVenta.length===0) return;
    if(requiereNCF && !ncfRnc.trim()){ setNcfError('Ingresa el RNC del cliente para emitir el comprobante fiscal.'); return; }
    setClienteError(''); setEspError(''); setNcfError('');
    if(ventaMetodo==='Tarjeta'){ setModalTarjeta(true); return; }
    registrarVentaEnBackend();
  };

  const confirmarPagoTarjeta = () => {
    setModalTarjeta(false);
    registrarVentaEnBackend();
  };

  const movMostrados = movFiltrados.filter(m =>
    (movFacturaFiltro.trim()===''||m.concepto.toLowerCase().includes(movFacturaFiltro.toLowerCase())) &&
    (movEmpleadoFiltro===''||movEmpleadoFiltro==='Todos'||m.usuario===movEmpleadoFiltro) &&
    (movCondicionFiltro==='Todos'||(movCondicionFiltro==='Crédito'?m.condicionPago==='Credito':m.condicionPago===movCondicionFiltro))
  );

  const ventasNoCanceladas = ventasSesion.filter(v=>v.estado!=='Cancelada');
  const totalVentasTurno   = ventasNoCanceladas.reduce((a,v)=>a+v.total,0);
  const ventasEfectivo     = ventasNoCanceladas.filter(v=>v.idMetodoPago===METODO_PAGO_ID.Efectivo).reduce((a,v)=>a+v.total,0);
  const ventasTarjeta      = ventasNoCanceladas.filter(v=>v.idMetodoPago===METODO_PAGO_ID.Tarjeta).reduce((a,v)=>a+v.total,0);
  const ventasTransferencia = ventasNoCanceladas.filter(v=>v.idMetodoPago===METODO_PAGO_ID.Transferencia).reduce((a,v)=>a+v.total,0);
  const diferenciaCierre = Number(montoCierre)-(fondoCaja+totalVentasTurno);

  const tabs = [
    {id:'apertura',    label:'Apertura',          icono:<DoorOpen size={16}/>},
    {id:'ventas',      label:'Ventas',             icono:<ShoppingCart size={16}/>},
    {id:'movimientos', label:'Movimientos',        icono:<BarChart2 size={16}/>},
    {id:'cotizaciones',label:'Cotizaciones',       icono:<FileText size={16}/>},
    {id:'cierre',      label:'Cerrar Caja',        icono:<LogOut size={16}/>},
  ];

  return (
    <div style={{minHeight:'100vh',background:'var(--aura-beige)'}}>
      {modalTarjeta&&<ModalTarjeta total={totVenta} condicion={ventaCondicion} onConfirm={confirmarPagoTarjeta} onCancel={()=>setModalTarjeta(false)}/>}

      {/* Header */}
      <div style={{background:'white',borderBottom:'1px solid #f0edf5',padding:'16px 40px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'15px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'15px'}}>
          <h2 style={{color:'var(--aura-navy)',fontWeight:'bold',margin:0,fontSize:'1.2rem'}}>
            AuraSpa <span style={{color:'var(--aura-lavender)'}}>Caja</span>
          </h2>
          <span style={{background:cajaAbierta?'#f0fdf4':'#fef2f2',color:cajaAbierta?'#22c55e':'#ef4444',padding:'4px 12px',borderRadius:'20px',fontSize:'0.78rem',fontWeight:'600'}}>
            {cajaAbierta?'● ABIERTA':'● CERRADA'}
          </span>
          {/* Admin puede abrir caja aunque ya esté abierta */}
          {esAdmin&&!cajaAbierta&&(
            <button onClick={()=>setSeccion('apertura')} style={{background:'#f0ecff',color:'var(--aura-lavender)',border:'none',padding:'5px 14px',borderRadius:'20px',cursor:'pointer',fontSize:'0.78rem',fontWeight:'600'}}>
              Abrir caja
            </button>
          )}
          {cajaAbierta&&(
            <button onClick={descargarReporteDelDia} title="Descargar reporte del día" style={{background:'#f0ecff',color:'var(--aura-lavender)',border:'none',padding:'5px 14px',borderRadius:'20px',cursor:'pointer',fontSize:'0.78rem',fontWeight:'600',display:'flex',alignItems:'center',gap:'6px'}}>
              <Download size={13}/> Reporte del día
            </button>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'20px',fontSize:'0.82rem'}}>
          <span style={{display:'flex',alignItems:'center',gap:'5px',color:'var(--aura-gray)'}}>
            {sucursalActiva}
          </span>
          <span style={{display:'flex',alignItems:'center',gap:'5px',color:conectado?'#22c55e':'#ef4444'}}>
            {conectado?<Wifi size={14}/>:<WifiOff size={14}/>}
            {conectado?'Conectado':'Sin conexión'}
          </span>
          <span style={{display:'flex',alignItems:'center',gap:'4px',color:'var(--aura-gray)'}}>
            <Clock size={14}/>{new Date().toLocaleTimeString('es-DO')}
          </span>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <div style={{width:'30px',height:'30px',borderRadius:'50%',background:'var(--aura-lavender)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:'700',fontSize:'0.85rem'}}>
              {user?.nombre?.[0]||'U'}
            </div>
            <span style={{fontWeight:'500',color:'var(--aura-navy)',fontSize:'0.88rem'}}>{user?.nombre} ({user?.perfil})</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{background:'white',borderBottom:'1px solid #f0edf5',padding:'0 40px',display:'flex',gap:'4px',overflowX:'auto'}}>
        {tabs.map(tab=>(
          <button key={tab.id}
            onClick={()=>(cajaAbierta||tab.id==='apertura')?setSeccion(tab.id as Seccion):undefined}
            style={{padding:'14px 20px',border:'none',background:'transparent',cursor:(cajaAbierta||tab.id==='apertura')?'pointer':'not-allowed',
              color:seccion===tab.id?'var(--aura-lavender)':(cajaAbierta||tab.id==='apertura')?'var(--aura-gray)':'#ccc',
              fontWeight:seccion===tab.id?'700':'400',fontSize:'0.88rem',whiteSpace:'nowrap',
              borderBottom:seccion===tab.id?'2px solid var(--aura-lavender)':'2px solid transparent',
              display:'flex',alignItems:'center',gap:'6px'}}>
            {tab.icono}{tab.label}
          </button>
        ))}
      </div>

      <div style={{padding:'30px 40px'}}>

        {/* ── APERTURA ── */}
        {seccion==='apertura'&&(
          <div style={{display:'flex',justifyContent:'center',padding:'40px 0'}}>
            <div className="card-aura animate-fade-in" style={{width:'100%',maxWidth:'520px',padding:'45px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'8px'}}>
                <div style={{background:'#EDE8F5',padding:'12px',borderRadius:'50%',color:'var(--aura-lavender)'}}><DoorOpen size={24}/></div>
                <h3 style={{fontWeight:'700',color:'var(--aura-navy)',margin:0}}>Apertura de Caja</h3>
              </div>
              <p style={{color:'var(--aura-gray)',fontSize:'0.88rem',marginBottom:'28px'}}>
                {saludoGenero(user)}, <strong>{user?.nombre}</strong>. Registra el fondo inicial para comenzar el turno.
              </p>
              {/* Fondo */}
              <div style={{marginBottom:'18px'}}>
                <label style={labelStyle}>Fondo de Apertura (RD$)</label>
                <input type="text" value={montoApertura} onChange={e=>validarNumero(e.target.value,setMontoApertura,setMontoError)}
                  placeholder="Ej: 5,000.00"
                  style={{...inputStyle,border:montoError?'1px solid #ef4444':'1px solid #e8e0f5'}}/>
                {montoError&&<p style={{color:'#ef4444',fontSize:'0.78rem',marginTop:'4px'}}>{montoError}</p>}
              </div>
              {/* Turno — dropdown no texto libre */}
              <div style={{marginBottom:'18px'}}>
                <label style={labelStyle}>Turno</label>
                <select value={turno} onChange={e=>setTurno(e.target.value as Turno)} style={{...inputStyle,cursor:'pointer'}}>
                  <option>Matutino (9AM-1PM)</option>
                  <option>Vespertino (1PM-5PM)</option>
                  <option>Personalizado</option>
                </select>
              </div>
              <button onClick={handleAbrirCaja} className="btn-AuraSpa" style={{width:'100%',padding:'14px'}}>Abrir Caja</button>
            </div>
          </div>
        )}

        {/* ── VENTAS ── */}
        {seccion==='ventas'&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:'25px',alignItems:'start'}}>
            <div>
              <div className="card-aura" style={{padding:'20px',marginBottom:'20px'}}>
                <h4 style={{fontWeight:'700',color:'var(--aura-navy)',marginBottom:'16px',fontSize:'0.95rem'}}>Información</h4>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'15px',marginBottom:'10px'}}>
                  <div>
                    <label style={labelStyle}>Cliente</label>
                    <BuscarCliente key={ventaResetKey} clientes={clientes} onSelect={c=>{setVentaCliente(c.nombre);setVentaClienteId(c.idCliente);setVentaClienteDoc(c.numeroDocumento);setVentaClienteTipoDoc(c.tipoDocumento);setClienteError('');}}/>
                    <p style={{fontSize:'0.75rem',color:'#888',marginTop:'3px'}}>Seleccionado: <strong>{ventaCliente}</strong></p>
                    {clienteError&&<p style={{color:'#ef4444',fontSize:'0.75rem',marginTop:'3px'}}>{clienteError}</p>}
                  </div>
                  <div>
                    <label style={labelStyle}>Cajero</label>
                    <input type="text" value={user?.nombre||''} disabled style={{...inputStyle,background:'#f0f0f0'}}/>
                  </div>
                  <div>
                    <label style={labelStyle}>Sucursal</label>
                    <input type="text" value={sucursalActiva} disabled style={{...inputStyle,background:'#f0f0f0'}}/>
                  </div>
                </div>
                <p style={{fontSize:'0.78rem',color:'var(--aura-gray)',margin:0,textAlign:'right'}}>
                  Fondo en caja: <strong style={{color:'var(--aura-navy)'}}>RD$ {fmt(fondoCaja)}</strong>
                </p>
              </div>

              <div className="card-aura" style={{padding:'20px',marginBottom:'20px'}}>
                <h4 style={{fontWeight:'700',color:'var(--aura-navy)',marginBottom:'16px',fontSize:'0.95rem'}}>Añadir Servicio / Producto</h4>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 80px auto',gap:'12px',alignItems:'end'}}>
                  <div>
                    <label style={labelStyle}>Categoría</label>
                    <select value={ventaCategoria} onChange={e=>setVentaCategoria(e.target.value)} style={{...inputStyle,cursor:'pointer'}}>
                      <option value="">Todas</option>
                      {categoriasDisponibles.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Especialista</label>
                    <select value={ventaEspecialista} onChange={e=>{setVentaEspecialista(e.target.value);setEspError('');}}
                      style={{...inputStyle,cursor:'pointer',border:espError?'1px solid #ef4444':'1px solid #e8e0f5'}}>
                      <option value="">Selecciona...</option>
                      {especialistas.map(e=><option key={e.idEmpleado} value={e.idEmpleado}>{e.nombreCompleto}</option>)}
                    </select>
                    {espError&&<p style={{color:'#ef4444',fontSize:'0.72rem',marginTop:'2px'}}>{espError}</p>}
                  </div>
                  <div>
                    <label style={labelStyle}>Servicio / Producto</label>
                    <select value={ventaServicio} onChange={e=>setVentaServicio(e.target.value)} style={{...inputStyle,cursor:'pointer'}}>
                      <option value="">Selecciona...</option>
                      {servicios.filter(s=>!ventaCategoria||s.categoria===ventaCategoria).map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Cant.</label>
                    <input type="text" value={ventaCantidad} onChange={e=>{if(/^\d*$/.test(e.target.value))setVentaCantidad(e.target.value);}} style={inputStyle}/>
                  </div>
                  <div>
                    <button onClick={()=>agregarItem(cartVenta,setCartVenta,ventaServicio,ventaCantidad,ventaEspecialista?Number(ventaEspecialista):undefined)} className="btn-AuraSpa" style={{padding:'10px 18px',whiteSpace:'nowrap'}}>+ Añadir</button>
                  </div>
                </div>
              </div>

              <div className="card-aura" style={{padding:'20px'}}>
                {ventaSuccess&&(
                  <div style={{display:'flex',alignItems:'center',gap:'8px',background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'12px',padding:'10px 16px',marginBottom:'15px'}}>
                    <CheckCircle size={16} color="#22c55e"/>
                    <span style={{color:'#16a34a',fontSize:'0.85rem'}}>Venta registrada exitosamente.</span>
                  </div>
                )}
                {ventaError&&(
                  <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'12px',padding:'10px 16px',marginBottom:'15px'}}>
                    <span style={{color:'#ef4444',fontSize:'0.85rem'}}>{ventaError}</span>
                  </div>
                )}
                <TablaCarrito cart={cartVenta} onRemove={id=>setCartVenta(cartVenta.filter(i=>i.id!==id))}/>
                <button onClick={()=>setCartVenta([])} style={{marginTop:'12px',background:'#fef2f2',color:'#ef4444',border:'1px solid #fecaca',padding:'8px 20px',borderRadius:'30px',cursor:'pointer',fontWeight:'600',fontSize:'0.85rem'}}>
                  Limpiar carrito
                </button>
              </div>
            </div>

            {/* Panel facturación */}
            <div className="card-aura" style={{padding:'25px',position:'sticky',top:'20px'}}>
              <h4 style={{fontWeight:'700',marginBottom:'20px',color:'var(--aura-navy)'}}>Facturación</h4>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px',fontSize:'0.88rem'}}>
                <span style={{color:'var(--aura-gray)'}}>Subtotal</span><span>RD$ {fmt(subVenta)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'15px',fontSize:'0.88rem'}}>
                <span style={{color:'var(--aura-gray)'}}>ITBIS (18%)</span><span>RD$ {fmt(itbVenta)}</span>
              </div>
              <hr style={{marginBottom:'15px',borderColor:'#f0edf5'}}/>

              <div style={{marginBottom:'12px'}}>
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.85rem',color:'var(--aura-navy)',fontWeight:'500',cursor:'pointer'}}>
                  <input type="checkbox" checked={requiereNCF} onChange={e=>{setRequiereNCF(e.target.checked);setNcfError('');}}/>
                  Requiere comprobante fiscal (NCF)
                </label>
                {requiereNCF&&(
                  <div style={{marginTop:'8px'}}>
                    <label style={labelStyle}>RNC / Cédula del cliente</label>
                    <input type="text" value={ncfRnc} onChange={e=>setNcfRnc(e.target.value)} placeholder="000-00000-0"
                      style={{...inputStyle,border:ncfError?'1px solid #ef4444':'1px solid #e8e0f5'}}/>
                    {ncfError&&<p style={{color:'#ef4444',fontSize:'0.75rem',marginTop:'4px'}}>{ncfError}</p>}
                  </div>
                )}
              </div>

              <div style={{marginBottom:'12px'}}>
                <label style={labelStyle}>Condición de Pago</label>
                <select value={ventaCondicion} onChange={e=>setVentaCondicion(e.target.value)} style={{...inputStyle,cursor:'pointer'}}>
                  <option>Contado</option><option>Crédito</option>
                </select>
              </div>
              <div style={{marginBottom:'12px'}}>
                <label style={labelStyle}>Método de Pago</label>
                <div style={{display:'flex',flexDirection:'column',gap:'8px',marginBottom:'8px'}}>
                  {['Efectivo','Tarjeta','Transferencia'].map(m=>(
                    <button key={m} onClick={()=>{setVentaMetodo(m);setEfectivoRecibido('');}}
                      style={{padding:'9px 12px',borderRadius:'10px',border:`2px solid ${ventaMetodo===m?'var(--aura-lavender)':'#eee'}`,background:ventaMetodo===m?'#f0ecff':'white',cursor:'pointer',fontSize:'0.82rem',fontWeight:ventaMetodo===m?'700':'400',color:ventaMetodo===m?'var(--aura-lavender)':'#666',display:'flex',alignItems:'center',justifyContent:'flex-start',gap:'8px',width:'100%',boxSizing:'border-box'}}>
                      {m==='Efectivo'?<Banknote size={14}/>:m==='Tarjeta'?<CardIcon size={14}/>:<ArrowDownLeft size={14}/>} {m}
                    </button>
                  ))}
                </div>
              </div>

              {ventaMetodo==='Efectivo'&&(
                <div style={{marginBottom:'12px'}}>
                  <label style={labelStyle}>Efectivo recibido (RD$)</label>
                  <input type="text" value={efectivoRecibido} onChange={e=>{if(/^\d*\.?\d*$/.test(e.target.value))setEfectivoRecibido(e.target.value);}}
                    placeholder="0.00" style={{...inputStyle,border:efectivoInsuficiente?'1px solid #ef4444':'1px solid #e8e0f5'}}/>
                  {efectivoInsuficiente&&<p style={{color:'#ef4444',fontSize:'0.75rem',marginTop:'4px'}}>Faltan RD$ {fmt(totVenta-Number(efectivoRecibido))}</p>}
                  {efectivoRecibido!==''&&!efectivoInsuficiente&&(
                    <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'10px',padding:'10px 14px',marginTop:'8px',display:'flex',justifyContent:'space-between'}}>
                      <span style={{fontSize:'0.82rem',color:'#16a34a',fontWeight:'500'}}>Cambio:</span>
                      <strong style={{color:'#16a34a'}}>RD$ {fmt(cambioEfectivo)}</strong>
                    </div>
                  )}
                </div>
              )}

              <div style={{background:'linear-gradient(135deg,var(--aura-navy),#2a2a72)',color:'white',padding:'16px',borderRadius:'15px',textAlign:'center',marginBottom:'16px',marginTop:'10px'}}>
                <div style={{fontSize:'0.75rem',opacity:0.8,marginBottom:'4px'}}>Total a Pagar</div>
                <div style={{fontSize:'1.6rem',fontWeight:'800'}}>RD$ {fmt(totVenta)}</div>
              </div>
              <button onClick={handleFinalizarVenta} className="btn-AuraSpa" style={{width:'100%',padding:'12px'}}
                disabled={cartVenta.length===0||(ventaMetodo==='Efectivo'&&efectivoInsuficiente)}>
                {ventaMetodo==='Tarjeta'?<><CardIcon size={15}/> Pasar Tarjeta</>:'Finalizar Compra'}
              </button>
            </div>
          </div>
        )}

        {/* ── MOVIMIENTOS ── */}
        {seccion==='movimientos'&&(
          <div>
            <div className="card-aura" style={{padding:'25px',marginBottom:'20px'}}>
              <h4 style={{fontWeight:'700',color:'var(--aura-navy)',marginBottom:'20px'}}>Filtros</h4>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:'15px',marginBottom:'15px'}}>
                <div><label style={labelStyle}>No. Factura</label><input type="text" placeholder="FAC-001" value={movFacturaFiltro} onChange={e=>setMovFacturaFiltro(e.target.value)} style={inputStyle}/></div>
                <div><label style={labelStyle}>Empleado</label><select value={movEmpleadoFiltro} onChange={e=>setMovEmpleadoFiltro(e.target.value)} style={inputStyle}><option value="Todos">Todos</option>{Array.from(new Set(movFiltrados.map(m=>m.usuario).filter(Boolean))).map(nombre=><option key={nombre}>{nombre}</option>)}</select></div>
                <div><label style={labelStyle}>Fecha Desde</label><input type="date" value={movFechaDesde} onChange={e=>setMovFechaDesde(e.target.value)} style={inputStyle}/></div>
                <div><label style={labelStyle}>Fecha Hasta</label><input type="date" value={movFechaHasta} onChange={e=>setMovFechaHasta(e.target.value)} style={inputStyle}/></div>
                <div><label style={labelStyle}>Condición</label><select value={movCondicionFiltro} onChange={e=>setMovCondicionFiltro(e.target.value)} style={inputStyle}><option value="Todos">Todos</option><option>Contado</option><option>Crédito</option></select></div>
              </div>
              <div style={{display:'flex',gap:'10px',flexDirection:'column'}}>
                {movFechaError && <p style={{color:'#ef4444',fontSize:'0.82rem',margin:'0'}}>{movFechaError}</p>}
                <div style={{display:'flex',gap:'10px'}}>
                <button onClick={()=>{
                  if(movFechaDesde && movFechaHasta && movFechaDesde > movFechaHasta){
                    setMovFechaError('La fecha de inicio no puede ser mayor que la fecha final. Ingresa un rango válido.');
                    return;
                  }
                  setMovFechaError('');
                  cargarMovimientos(movFechaDesde||undefined, movFechaHasta||undefined);
                }} className="btn-AuraSpa" style={{padding:'10px 25px'}}>Filtrar</button>
                <button onClick={()=>{setMovFechaDesde('');setMovFechaHasta('');setMovFechaError('');setMovFacturaFiltro('');setMovEmpleadoFiltro('Todos');setMovCondicionFiltro('Todos');cargarMovimientos();}} className="btn-outline-aura" style={{padding:'10px 25px'}}>Limpiar</button>
              </div></div>
            </div>
            <div className="card-aura" style={{padding:'25px'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                <thead>
                  <tr style={{background:'#EDE8F5'}}>
                    {['ID','Concepto','Fecha y Hora','Tipo','Condición','Usuario','Monto','Estado'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'left',fontWeight:'600',color:'var(--aura-navy)',borderBottom:'2px solid #e8e0f5'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movMostrados.length===0?(
                    <tr><td colSpan={8} style={{padding:'30px',textAlign:'center',color:'#bbb',fontSize:'0.88rem'}}>Sin movimientos en el rango seleccionado</td></tr>
                  ):movMostrados.map((m,i)=>(
                    <tr key={m.id} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                      <td style={{padding:'10px 14px'}}>{m.id}</td>
                      <td style={{padding:'10px 14px',fontWeight:'500'}}>{m.concepto}</td>
                      <td style={{padding:'10px 14px',color:'var(--aura-gray)'}}>{formatFechaHora(m.fecha)}</td>
                      <td style={{padding:'10px 14px'}}><span style={{color:m.tipo==='Ingreso'?'#22c55e':'#ef4444',fontWeight:'600'}}>{m.tipo}</span></td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{background:m.condicionPago==='Credito'?'#fffbeb':'#f0fdf4',color:m.condicionPago==='Credito'?'#f59e0b':'#22c55e',padding:'3px 10px',borderRadius:'20px',fontSize:'0.78rem',fontWeight:'600'}}>{m.condicionPago==='Credito'?'Crédito':m.condicionPago}</span>
                      </td>
                      {/* Usuario corregido — el cajero es quien hace la transacción */}
                      <td style={{padding:'10px 14px',color:'var(--aura-gray)'}}>{m.usuario}</td>
                      <td style={{padding:'10px 14px',fontWeight:'600',color:'var(--aura-navy)'}}>RD$ {fmt(m.monto)}</td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{background:m.estado==='Completada'?'#f0fdf4':m.estado==='Cancelada'?'#fef2f2':'#fffbeb',color:m.estado==='Completada'?'#22c55e':m.estado==='Cancelada'?'#ef4444':'#f59e0b',padding:'3px 10px',borderRadius:'20px',fontSize:'0.78rem',fontWeight:'600'}}>{m.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{display:'flex',gap:'25px',marginTop:'15px',paddingTop:'15px',borderTop:'1px solid #f0edf5',fontSize:'0.88rem'}}>
                <span>Total Ingresos: <strong style={{color:'#22c55e'}}>RD$ {fmt(movMostrados.filter(m=>m.tipo==='Ingreso').reduce((a,m)=>a+m.monto,0))}</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* ── COTIZACIONES — solo precios, sin cliente ni especialista ── */}
        {seccion==='cotizaciones'&&(
          <div>
            {cotSuccess&&(
              <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'15px',padding:'16px 20px',marginBottom:'20px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}>
                  <CheckCircle size={18} color="#22c55e"/>
                  <span style={{color:'#16a34a',fontSize:'0.88rem'}}>Cotización <strong>{cotSnapshotRef.current?.numero}</strong> generada.</span>
                </div>
                {!emailEnviado ? (
                  <div>
                    <BuscarCliente key={cotResetKey} clientes={clientes} onSelect={c=>{setCotCliente(c.nombre);setCotClienteId(c.idCliente);setCotClienteEmail(c.email||'');setEmailError('');}}/>
                    {cotClienteId&&<p style={{fontSize:'0.75rem',color:'#888',margin:'6px 0 0'}}>Enviar a: <strong>{cotCliente}</strong>{cotClienteEmail?` — ${cotClienteEmail}`:' (sin correo registrado)'}</p>}
                    {emailError&&<p style={{color:'#ef4444',fontSize:'0.78rem',margin:'6px 0 0'}}>{emailError}</p>}
                    <button onClick={enviarCotizacionPorCorreo} disabled={emailEnviando}
                      className="btn-AuraSpa" style={{marginTop:'12px',padding:'8px 18px',fontSize:'0.8rem',display:'flex',alignItems:'center',gap:'6px'}}>
                      <Send size={13}/> {emailEnviando ? 'Enviando...' : 'Enviar por correo'}
                    </button>
                  </div>
                ):(
                  <p style={{color:'#16a34a',fontSize:'0.85rem',margin:0,fontWeight:'600'}}>✓ Correo enviado{cotClienteEmail?` a ${cotClienteEmail}`:''}</p>
                )}
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 280px',gap:'25px',alignItems:'start'}}>
              <div>
                <div className="card-aura" style={{padding:'20px',marginBottom:'16px',background:'#f8f6ff',border:'1px solid #e8e0f5'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
                    <span style={{background:'#f0ecff',color:'var(--aura-lavender)',padding:'5px 14px',borderRadius:'20px',fontSize:'0.82rem',fontWeight:'600'}}>No. {cotNumero}</span>
                    <span style={{fontSize:'0.82rem',color:'#888'}}>Las cotizaciones muestran precios del sistema — sin datos de cliente ni especialista.</span>
                  </div>
                </div>
                <div className="card-aura" style={{padding:'20px',marginBottom:'20px'}}>
                  <h4 style={{fontWeight:'700',color:'var(--aura-navy)',marginBottom:'16px',fontSize:'0.95rem'}}>Añadir Servicio</h4>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 80px auto',gap:'12px',alignItems:'end'}}>
                    <div>
                      <label style={labelStyle}>Servicio / Producto</label>
                      <select value={cotServicio} onChange={e=>setCotServicio(e.target.value)} style={{...inputStyle,cursor:'pointer'}}>
                        <option value="">Selecciona...</option>
                        {servicios.map(s=><option key={s.id} value={s.id}>{s.nombre} — RD$ {fmt(s.precio)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Cant.</label>
                      <input type="text" value={cotCantidad} onChange={e=>{if(/^\d*$/.test(e.target.value))setCotCantidad(e.target.value);}} style={inputStyle}/>
                    </div>
                    <div><button onClick={()=>agregarItem(cartCot,setCartCot,cotServicio,cotCantidad)} className="btn-AuraSpa" style={{padding:'10px 18px'}}>+ Añadir</button></div>
                  </div>
                </div>
                <div className="card-aura" style={{padding:'20px'}}>
                  <TablaCarrito cart={cartCot} onRemove={id=>setCartCot(cartCot.filter(i=>i.id!==id))}/>
                </div>
              </div>
              {/* Panel cotización */}
              <div className="card-aura" style={{padding:'25px'}}>
                <h4 style={{fontWeight:'700',marginBottom:'20px',color:'var(--aura-navy)'}}>Resumen</h4>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px',fontSize:'0.88rem'}}>
                  <span style={{color:'var(--aura-gray)'}}>Subtotal</span><span>RD$ {fmt(cartCot.reduce((a,i)=>a+i.precioUnitario*i.cantidad,0))}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'15px',fontSize:'0.88rem'}}>
                  <span style={{color:'var(--aura-gray)'}}>ITBIS (18%)</span><span>RD$ {fmt(cartCot.reduce((a,i)=>a+i.itbis,0))}</span>
                </div>
                <div style={{background:'linear-gradient(135deg,var(--aura-navy),#2a2a72)',color:'white',padding:'16px',borderRadius:'15px',textAlign:'center',marginBottom:'16px'}}>
                  <div style={{fontSize:'0.75rem',opacity:0.8,marginBottom:'4px'}}>Total Cotizado</div>
                  <div style={{fontSize:'1.6rem',fontWeight:'800'}}>RD$ {fmt(cartCot.reduce((a,i)=>a+i.subtotal,0))}</div>
                </div>
                <button onClick={async ()=>{
                  if(cartCot.length===0)return;
                  try {
                    const res = await apiClient.post('/api/caja/cotizaciones', {
                      idCliente: cotClienteId || undefined,
                      detalles: cartCot.map(i=>({ idItem:i.id, cantidad:i.cantidad, precioUnitario:i.precioUnitario }))
                    });
                    const numeroReal = res.data.numeroCotizacion;
                    cotSnapshotRef.current = { items:cartCot, numero:numeroReal };
                    const doc = await generarCotizacionPDF(cartCot, numeroReal);
                    doc.save(`${numeroReal}.pdf`);
                    setCotSuccess(true);
                    setEmailEnviado(false); setEmailError(''); setCotError('');
                    setCotCliente(''); setCotClienteId(null); setCotClienteEmail('');
                    setCotResetKey(k=>k+1);
                    setCartCot([]);
                    setCotNumero(numeroReal);
                    await cargarCotizaciones();
                  } catch (err:any) {
                    const msg = err.response?.data;
                    setCotError(typeof msg === 'string' ? msg : 'No se pudo generar la cotización.');
                  }
                }}
                  className="btn-AuraSpa" style={{width:'100%',padding:'12px'}} disabled={cartCot.length===0}>
                  Generar Cotización
                </button>
                {cotError && <p style={{color:'#ef4444',fontSize:'0.82rem',marginTop:'8px'}}>{cotError}</p>}
              </div>
            </div>

            {/* ── Cotizaciones registradas — convertir en orden/venta ── */}
            <div className="card-aura" style={{padding:'25px',marginTop:'25px'}}>
              <h4 style={{fontWeight:'700',color:'var(--aura-navy)',marginBottom:'16px'}}>Cotizaciones registradas</h4>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                <thead>
                  <tr style={{background:'#EDE8F5'}}>
                    {['No.','Cliente','Fecha','Vigencia','Total','Estado','Acciones'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'left',fontWeight:'600',color:'var(--aura-navy)',borderBottom:'2px solid #e8e0f5'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cotizacionesRegistradas.length===0?(
                    <tr><td colSpan={7} style={{padding:'25px',textAlign:'center',color:'#bbb'}}>No hay cotizaciones registradas todavía.</td></tr>
                  ):cotizacionesRegistradas.map((c:any,i:number)=>(
                    <tr key={c.idCotizacion} style={{borderBottom:'1px solid #f0edf5',background:i%2===0?'white':'#faf9ff'}}>
                      <td style={{padding:'10px 14px'}}>{c.numeroCotizacion}</td>
                      <td style={{padding:'10px 14px'}}>{c.cliente}</td>
                      <td style={{padding:'10px 14px'}}>{formatFechaHora(c.fecha)}</td>
                      <td style={{padding:'10px 14px'}}>{c.fechaVigencia?formatFechaHora(c.fechaVigencia):'—'}</td>
                      <td style={{padding:'10px 14px',fontWeight:'600'}}>RD$ {fmt(c.total)}</td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{padding:'3px 10px',borderRadius:'20px',fontSize:'0.78rem',fontWeight:'600',
                          background:c.estado==='Pendiente'?'#fef9c3':c.estado==='Facturada'?'#dcfce7':'#fee2e2',
                          color:c.estado==='Pendiente'?'#a16207':c.estado==='Facturada'?'#16a34a':'#dc2626'}}>{c.estado}</span>
                      </td>
                      <td style={{padding:'10px 14px'}}>
                        {c.estado==='Pendiente' && (
                          <button onClick={async ()=>{
                            setCotError('');
                            if(!idSesionCaja){ setCotError('Debes abrir la caja antes de generar una orden.'); return; }
                            try {
                              await apiClient.put(`/api/caja/cotizaciones/${c.idCotizacion}/convertir`, {
                                idSesionCaja, idMetodoPago: METODO_PAGO_ID.Efectivo, condicionPago:'Contado'
                              });
                              await cargarCotizaciones();
                            } catch (err:any) {
                              const msg = err.response?.data;
                              setCotError(typeof msg === 'string' ? msg : 'No se pudo generar la orden.');
                            }
                          }} className="btn-AuraSpa" style={{padding:'6px 14px',fontSize:'0.78rem',display:'flex',alignItems:'center',gap:'6px'}}>
                            <ShoppingCart size={13}/> Generar Orden
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cotError && <p style={{color:'#ef4444',fontSize:'0.82rem',marginTop:'10px'}}>{cotError}</p>}
            </div>
          </div>
        )}

        {/* ── CIERRE ── */}
        {seccion==='cierre'&&(
          <div style={{display:'flex',justifyContent:'center',padding:'40px 0'}}>
            {cierreSuccess?(
              <div className="card-aura animate-fade-in" style={{width:'100%',maxWidth:'480px',padding:'50px',textAlign:'center'}}>
                <CheckCircle size={52} color="#22c55e" style={{marginBottom:'20px'}}/>
                <h3 style={{fontWeight:'700',marginBottom:'8px',color:'var(--aura-navy)'}}>Caja cerrada correctamente</h3>
                <p style={{color:'var(--aura-gray)',fontSize:'0.88rem',marginBottom:'25px'}}>Puedes descargar el reporte del turno antes de continuar.</p>
                <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                  <button onClick={generarReporteCierrePDF} className="btn-AuraSpa" style={{padding:'13px'}}>
                    Descargar reporte del día
                  </button>
                  <button onClick={()=>navigate(-1)} className="btn-outline-aura" style={{padding:'13px'}}>
                    Volver
                  </button>
                </div>
              </div>
            ):(
              <div className="card-aura animate-fade-in" style={{width:'100%',maxWidth:'560px',padding:'45px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'25px'}}>
                  <div style={{background:'#fef2f2',padding:'12px',borderRadius:'50%',color:'#ef4444'}}><LogOut size={24}/></div>
                  <div>
                    <h3 style={{fontWeight:'700',color:'var(--aura-navy)',margin:0}}>Cierre de Turno</h3>
                    <p style={{color:'#888',margin:0,fontSize:'0.82rem'}}>Turno: <strong>{turno}</strong></p>
                  </div>
                </div>

                {/* Resumen completo del turno */}
                <div style={{background:'#f8f6ff',borderRadius:'15px',padding:'20px',marginBottom:'20px'}}>
                  <h4 style={{fontWeight:'600',marginBottom:'14px',color:'var(--aura-navy)',fontSize:'0.9rem'}}>Resumen del Turno</h4>
                  {(() => {
                    const filas = [
                      {label:'Fondo inicial:',            valor:`RD$ ${fmt(fondoCaja)}`,            color:'inherit'},
                      {label:'Total ventas:',              valor:`RD$ ${fmt(totalVentasTurno)}`,      color:'#22c55e'},
                      {label:'Ventas en efectivo:',        valor:`RD$ ${fmt(ventasEfectivo)}`,        color:'inherit'},
                      {label:'Ventas con tarjeta:',        valor:`RD$ ${fmt(ventasTarjeta)}`,         color:'inherit'},
                      {label:'Ventas por transferencia:',  valor:`RD$ ${fmt(ventasTransferencia)}`,   color:'inherit'},
                      {label:'CxC pendientes (total):',    valor:`RD$ ${fmt(cxcPendienteTotal)}`, color:'#f59e0b'},
                      {label:'El sistema reporta:',        valor:`RD$ ${fmt(fondoCaja+totalVentasTurno)}`, color:'var(--aura-navy)'},
                    ];
                    return filas.map((r,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',marginBottom:i<filas.length-2?'8px':'0',fontSize:'0.88rem',paddingTop:i===filas.length-1?'10px':0,borderTop:i===filas.length-1?'1px solid #e8e0f5':'none'}}>
                        <span style={{color:'var(--aura-gray)'}}>{r.label}</span>
                        <strong style={{color:r.color}}>{r.valor}</strong>
                      </div>
                    ));
                  })()}
                </div>

                <div style={{marginBottom:'16px'}}>
                  <label style={labelStyle}>Efectivo contado en gaveta (RD$) <span style={{color:'#ef4444'}}>*</span></label>
                  <input type="text" value={montoCierre} onChange={e=>validarNumero(e.target.value,setMontoCierre,setMontoCierreError)}
                    placeholder="0.00" style={{...inputStyle,border:montoCierreError?'1px solid #ef4444':'1px solid #e8e0f5'}}/>
                  {montoCierreError&&<p style={{color:'#ef4444',fontSize:'0.78rem',marginTop:'4px'}}>{montoCierreError}</p>}
                </div>

                {montoCierre&&!isNaN(Number(montoCierre))&&(
                  <div style={{background:diferenciaCierre>=0?'#f0fdf4':'#fef2f2',border:`1px solid ${diferenciaCierre>=0?'#86efac':'#fecaca'}`,borderRadius:'12px',padding:'14px 16px',marginBottom:'16px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.9rem'}}>
                      <span style={{fontWeight:'600'}}>Diferencia:</span>
                      <strong style={{color:diferenciaCierre>=0?'#22c55e':'#ef4444',fontSize:'1.1rem'}}>
                        {diferenciaCierre>=0?'+':''}RD$ {fmt(diferenciaCierre)} {diferenciaCierre>0?'(Sobrante)':diferenciaCierre<0?'(Faltante)':'(Cuadre exacto ✓)'}
                      </strong>
                    </div>
                    {Math.abs(diferenciaCierre)>100&&(
                      <p style={{color:'#888',fontSize:'0.78rem',margin:'8px 0 0'}}>
                        {diferenciaCierre<0?'⚠️ Hay faltante — revisa las transacciones antes de cerrar.':'ℹ️ Hay sobrante — verifica las transacciones.'}
                      </p>
                    )}
                  </div>
                )}

                {(() => {
                  const hayDiferencia = montoCierre && !isNaN(Number(montoCierre)) && diferenciaCierre !== 0;
                  const faltaJustificacion = hayDiferencia && !observacionCierre.trim();
                  return (
                <div style={{marginBottom:'25px'}}>
                  <label style={labelStyle}>Observación {hayDiferencia && <span style={{color:'#ef4444'}}>*</span>}</label>
                  <input type="text" value={observacionCierre} onChange={e=>setObservacionCierre(e.target.value)} placeholder="Ej: Cierre sin novedades"
                    style={{...inputStyle, border: faltaJustificacion ? '1px solid #ef4444' : inputStyle.border}}/>
                  {faltaJustificacion && (
                    <p style={{color:'#ef4444',fontSize:'0.78rem',marginTop:'4px'}}>
                      Hay una diferencia de RD$ {fmt(Math.abs(diferenciaCierre))}. Debes ingresar una justificación para continuar.
                    </p>
                  )}
                </div>
                  );
                })()}

                <div style={{display:'flex',gap:'12px'}}>
                  <button disabled={!!(montoCierre && !isNaN(Number(montoCierre)) && diferenciaCierre !== 0 && !observacionCierre.trim())} onClick={async ()=>{
                    if(!montoCierre||isNaN(Number(montoCierre))||Number(montoCierre)<0){ setMontoCierreError('Ingresa el efectivo contado.'); return; }
                    if(!idSesionCaja){ setMontoCierreError('No hay una sesión de caja activa.'); return; }
                    if(diferenciaCierre!==0 && !observacionCierre.trim()){ setMontoCierreError(`Hay una diferencia de RD$ ${fmt(Math.abs(diferenciaCierre))}. Debes ingresar una justificación para continuar.`); return; }
                    try {
                      const res = await apiClient.post(`/api/caja/cierre/${idSesionCaja}`, {
                        montoFinal: Number(montoCierre),
                        justificacion: observacionCierre || undefined
                      });
                      setHoraCierre(res.data.fechaCierre);
                      setMontoCierreError('');
                      setCierreSuccess(true);
                      setCajaAbierta(false);
                      setIdSesionCaja(null);
                    } catch (err:any) {
                      const msg = err.response?.data;
                      setMontoCierreError(typeof msg === 'string' ? msg : 'No se pudo cerrar la caja.');
                    }
                  }} style={{flex:1,padding:'13px',background:'#ef4444',color:'white',border:'none',borderRadius:'30px',cursor: (montoCierre && !isNaN(Number(montoCierre)) && diferenciaCierre !== 0 && !observacionCierre.trim()) ? 'not-allowed' : 'pointer',fontWeight:'700',fontSize:'0.95rem',opacity: (montoCierre && !isNaN(Number(montoCierre)) && diferenciaCierre !== 0 && !observacionCierre.trim()) ? 0.6 : 1}}>
                    Confirmar Cierre
                  </button>
                  <button onClick={()=>setSeccion('ventas')} className="btn-outline-aura" style={{flex:1,padding:'13px'}}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Caja;
