import axios from 'axios';

const apiClient = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:5036',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('aura_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const habiaSesion = !!localStorage.getItem('aura_token');
      localStorage.removeItem('aura_token');
      localStorage.removeItem('aura_user');
      // Solo forzar redirección si había una sesión activa que expiró/se invalidó.
      // Un 401 de login o registro con credenciales incorrectas no debe recargar la página.
      if (habiaSesion && window.location.pathname !== '/login') {
        window.alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente. Si estabas llenando un formulario, es posible que el progreso no se haya guardado.');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
