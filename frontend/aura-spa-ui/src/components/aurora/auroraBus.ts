import type { Idioma } from './useAuroraVoz';

/**
 * Bus de eventos de Aurora: permite que cualquier botón de la app
 * abra la asistente (opcionalmente lanzando una consulta directa),
 * sin importar dónde esté montado el overlay global.
 */
export interface AuroraAbrirDetalle {
  idioma: Idioma;
  consulta?: string;
}

export const abrirAurora = (idioma: Idioma = 'es', consulta?: string) => {
  window.dispatchEvent(new CustomEvent<AuroraAbrirDetalle>('aurora:abrir', {
    detail: { idioma, consulta },
  }));
};
