// ── Modo "Acceso Demo" ─────────────────────────────────────────────
// Permite probar el agendamiento y la compra de productos sin backend
// (p. ej. en la demo pública de Vercel). La sesión demo vive solo en el
// navegador: su token nunca se envía a la API y las citas/pedidos se
// guardan en localStorage. Con una sesión real, nada de esto se usa.

export const DEMO_TOKEN = 'demo-session';

export const esTokenDemo = (token: string | null | undefined): boolean => token === DEMO_TOKEN;

export const DEMO_USER = {
  id: -1,
  nombre: 'Cliente',
  apellido: 'Demo',
  email: 'demo@auraspa.com',
  telefono: '809-000-0000',
  perfil: 'Cliente',
  rol: 'Cliente',
  genero: null,
};

// Datos de respaldo tomados de AuraSpa_SSMS_v3.sql / AuraSpa_SeedData.sql
export const SUCURSALES_DEMO = [{ idSucursal: 1, nombre: 'AuraSpa Principal' }];

// Especialistas del seed y sus categorías (tabla EmpleadoCategoria)
export const ESPECIALISTAS_DEMO = [
  { idEmpleado: 1, nombreCompleto: 'Nicole Martínez',  categorias: ['Masaje', 'Facial'] },
  { idEmpleado: 2, nombreCompleto: 'Valentina Reyes',  categorias: ['Uñas', 'Cejas y Pestañas'] },
  { idEmpleado: 3, nombreCompleto: 'Camila Santos',    categorias: ['Pelo', 'Depilación'] },
];

// ── Citas demo ─────────────────────────────────────────────────────
export interface CitaDemo {
  id: number;      // identificador local (negativo para no chocar con id_cita reales)
  estado?: 'Pendiente' | 'Cancelada';
  referencia: string;
  idItem: number;
  servicio: string;
  idSucursal: number;
  idEmpleado: number | null;
  especialista: string;
  fecha: string;   // yyyy-mm-dd
  hora: string;    // HH:mm
  creada: string;  // ISO
}

const CLAVE_CITAS = 'aura_demo_citas';
const CLAVE_PEDIDOS = 'aura_demo_pedidos';

const leer = <T,>(clave: string): T[] => {
  try { return JSON.parse(localStorage.getItem(clave) || '[]'); } catch { return []; }
};
const escribir = (clave: string, datos: unknown) => {
  try { localStorage.setItem(clave, JSON.stringify(datos)); } catch { /* almacenamiento no disponible */ }
};

export const leerCitasDemo = () => leer<CitaDemo>(CLAVE_CITAS);
export const guardarCitaDemo = (cita: Omit<CitaDemo, 'id'>) =>
  escribir(CLAVE_CITAS, [...leerCitasDemo(), { ...cita, id: -Date.now(), estado: 'Pendiente' }]);

export const actualizarCitaDemo = (id: number, cambios: Partial<Pick<CitaDemo, 'estado' | 'fecha' | 'hora'>>) =>
  escribir(CLAVE_CITAS, leerCitasDemo().map(c => c.id === id ? { ...c, ...cambios } : c));

/** Horas ya reservadas (no canceladas) en modo demo para un especialista y fecha. */
export const horasOcupadasDemo = (idEmpleado: number, fecha: string) =>
  leerCitasDemo().filter(c => c.idEmpleado === idEmpleado && c.fecha === fecha && c.estado !== 'Cancelada').map(c => c.hora);

// ── Pedidos demo ───────────────────────────────────────────────────
export interface PedidoDemo {
  referencia: string;
  estado?: 'Pendiente' | 'Cancelado';
  idSucursal: number;
  notas: string;
  productos: { idItem: number; nombre: string; cantidad: number; precioUnitario: number }[];
  total: number;
  creado: string;
}

export const leerPedidosDemo = () => leer<PedidoDemo>(CLAVE_PEDIDOS);

export const guardarPedidoDemo = (pedido: PedidoDemo) =>
  escribir(CLAVE_PEDIDOS, [...leerPedidosDemo(), { ...pedido, estado: 'Pendiente' }]);

export const actualizarPedidoDemo = (referencia: string, cambios: Partial<Pick<PedidoDemo, 'estado'>>) =>
  escribir(CLAVE_PEDIDOS, leerPedidosDemo().map(p => p.referencia === referencia ? { ...p, ...cambios } : p));

export const limpiarDatosDemo = () => {
  try { localStorage.removeItem(CLAVE_CITAS); localStorage.removeItem(CLAVE_PEDIDOS); } catch { /* sin acceso */ }
};
