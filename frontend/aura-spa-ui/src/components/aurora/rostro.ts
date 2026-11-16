import * as faceapi from '@vladmandic/face-api';

/**
 * Reconocimiento facial 100% local con face-api.js (TensorFlow.js).
 * Los modelos se sirven desde /public/models y corren EN EL NAVEGADOR.
 * Del rostro solo se extrae un descriptor matemático de 128 dimensiones;
 * ninguna imagen sale del dispositivo ni se almacena (Ley 172-13).
 */

let modelosCargados = false;
let cargando: Promise<void> | null = null;

export const cargarModelos = async (): Promise<void> => {
  if (modelosCargados) return;
  if (cargando) return cargando;
  cargando = (async () => {
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
    modelosCargados = true;
  })();
  return cargando;
};

/**
 * Detecta el rostro más prominente en el frame actual del video y
 * devuelve su descriptor de 128 dimensiones, o null si no hay rostro.
 */
export const obtenerDescriptor = async (video: HTMLVideoElement): Promise<number[] | null> => {
  await cargarModelos();
  const deteccion = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!deteccion) return null;
  return Array.from(deteccion.descriptor);
};

/**
 * Toma varias muestras del rostro (para enrolamiento) y devuelve el
 * descriptor promedio — más robusto ante variaciones de luz/ángulo.
 */
export const obtenerDescriptorPromedio = async (
  video: HTMLVideoElement,
  muestras = 3,
  onProgreso?: (n: number) => void,
): Promise<number[] | null> => {
  const capturas: number[][] = [];
  for (let i = 0; i < muestras; i++) {
    const d = await obtenerDescriptor(video);
    if (d) { capturas.push(d); onProgreso?.(capturas.length); }
    await new Promise(r => setTimeout(r, 450));
  }
  if (capturas.length === 0) return null;
  return Array.from({ length: 128 }, (_, i) =>
    capturas.reduce((s, c) => s + c[i], 0) / capturas.length,
  );
};
