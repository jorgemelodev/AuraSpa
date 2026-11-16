import { useEffect, useState } from 'react';
import apiClient from './apiClient';

// Detecta si el backend C# responde. Se consulta una sola vez por carga de página
// y el resultado se comparte entre todos los componentes que lo usan.
// Cualquier respuesta HTTP (incluso un error 4xx/5xx) cuenta como "disponible":
// solo un fallo de red o un timeout (p. ej. en Vercel, sin backend) activa el Modo Demo.

const TIMEOUT_MS = 4000;
let verificacion: Promise<boolean> | null = null;

export const verificarApi = (): Promise<boolean> => {
  if (!verificacion) {
    verificacion = apiClient
      .get('/api/catalog/sucursales', { timeout: TIMEOUT_MS })
      .then(() => true)
      .catch(err => !!err?.response);
  }
  return verificacion;
};

/** null mientras se verifica; true si el backend responde; false si no está disponible. */
export const useApiDisponible = (): boolean | null => {
  const [disponible, setDisponible] = useState<boolean | null>(null);
  useEffect(() => {
    let activo = true;
    verificarApi().then(ok => { if (activo) setDisponible(ok); });
    return () => { activo = false; };
  }, []);
  return disponible;
};
