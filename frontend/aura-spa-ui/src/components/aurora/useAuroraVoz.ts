import { useCallback, useEffect, useRef, useState } from 'react';

export type Idioma = 'es' | 'en';

// ── Tipos mínimos de Web Speech API (no incluidos en TS estándar) ──
interface ISpeechRecognitionEvent { resultIndex: number; results: { [i: number]: { 0: { transcript: string }; isFinal: boolean }; length: number }; }
interface ISpeechRecognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: ISpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  start: () => void; stop: () => void; abort: () => void;
}
declare global { interface Window { SpeechRecognition?: new () => ISpeechRecognition; webkitSpeechRecognition?: new () => ISpeechRecognition; } }

const crearReconocedor = (): ISpeechRecognition | null => {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
};

/** BIP relajante de activación con Web Audio (sin archivos externos). */
export const sonidoActivacion = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.55);
  } catch { /* audio no disponible */ }
};

// ── Anti-feedback: Aurora no debe escucharse a sí misma ─────────
// Mientras el TTS habla, el reconocimiento se SUSPENDE por completo
// (abort) y se retoma 1 segundo después de terminar, descartando
// cualquier audio capturado en el proceso.
let auroraHablando = false;
let finHablaTs = 0;
const ignorarMicrofono = () =>
  auroraHablando || speechSynthesis.speaking || (Date.now() - finHablaTs < 1000);
const emitirTts = (hablando: boolean) =>
  window.dispatchEvent(new CustomEvent('aurora:tts', { detail: { hablando } }));

/** Prepara el texto para el TTS: sin markdown/emoji y con números corridos. */
const prepararTexto = (texto: string, idioma: Idioma) => {
  let t = texto.replace(/\*\*/g, '').replace(/[•🔔✨👋💰📅🕐📍🌿💆🤔🔓🔒✅]/gu, '');
  // "RD$ 6,000" → "6000 pesos" (evita "seis, cero, cero, cero")
  t = t.replace(/RD\$\s*([\d.,]+)/g, (_m, n: string) =>
    `${n.replace(/[,.]/g, '')} ${idioma === 'es' ? 'pesos' : 'pesos'}`);
  // Separadores de miles restantes: 6,000 → 6000
  t = t.replace(/(\d)[,.](?=\d{3}\b)/g, '$1');
  return t;
};

// Nombres de voces femeninas conocidas (cualquier idioma) — última red de
// seguridad para cuando el sistema no tiene NINGUNA voz del idioma pedido
// instalada (ej. sin paquete de español): sin esto, el navegador cae en su
// voz por defecto, que en muchos Windows es una voz masculina (David/Mark).
const NOMBRES_VOZ_FEMENINA = /female|mujer|zira|sabina|aria|jenny|samantha|paulina|m[oó]nica|helena|dalia|ava|sonia|libby|karen|moira/i;

/** Voz femenina natural preferida por idioma (según disponibilidad del sistema). */
const elegirVoz = (idioma: Idioma): SpeechSynthesisVoice | undefined => {
  const voces = speechSynthesis.getVoices();
  const esDelIdioma = (v2: SpeechSynthesisVoice) =>
    v2.lang.toLowerCase().startsWith(idioma === 'es' ? 'es' : 'en');

  // "Dalia"/"Elvira Online (Natural)" son las voces neuronales reales que Edge
  // expone para español (confirmado en vivo) — "Sabina Online (Natural)" no
  // existe como voz en la nube, solo como voz de escritorio clásica/robótica.
  const pref = idioma === 'es'
    ? ['Microsoft Dalia Online (Natural)', 'Microsoft Elvira Online (Natural)', 'Google español', 'Paulina', 'Mónica', 'Monica', 'Sabina', 'Helena', 'Dalia', 'es-US', 'es-MX', 'es-DO']
    : ['Microsoft Aria Online (Natural)', 'Microsoft Jenny Online (Natural)', 'Google US English', 'Samantha', 'Aria', 'Jenny', 'Ava', 'Sonia', 'Libby', 'Zira', 'Karen', 'Moira'];
  for (const nombre of pref) {
    const v = voces.find(v2 => esDelIdioma(v2) && (v2.name.includes(nombre) || v2.lang === nombre));
    if (v) return v;
  }

  // Cualquier voz del idioma marcada como femenina explícitamente.
  const femeninaDelIdioma = voces.find(v2 => esDelIdioma(v2) && NOMBRES_VOZ_FEMENINA.test(v2.name));
  if (femeninaDelIdioma) return femeninaDelIdioma;

  // El sistema no tiene NINGUNA voz de este idioma instalada: preferimos
  // una voz femenina en otro idioma antes que dejar la voz por defecto
  // sin definir (que podría resultar masculina).
  if (!voces.some(esDelIdioma)) {
    const femeninaCualquiera = voces.find(v2 => NOMBRES_VOZ_FEMENINA.test(v2.name));
    if (femeninaCualquiera) return femeninaCualquiera;
  }

  return voces.find(esDelIdioma);
};

/** Texto a voz en el idioma activo. */
export const hablar = (texto: string, idioma: Idioma, onFin?: () => void) => {
  const terminar = () => {
    if (!auroraHablando) return;
    auroraHablando = false;
    finHablaTs = Date.now();
    emitirTts(false);
    onFin?.();
  };
  try {
    const u = new SpeechSynthesisUtterance(prepararTexto(texto, idioma));
    u.lang = idioma === 'es' ? 'es-DO' : 'en-US';
    u.rate = 0.92;      // más pausada y natural
    u.pitch = 1.05;     // tono suave/femenino
    u.volume = 1.0;
    const voz = elegirVoz(idioma);
    if (voz) u.voice = voz;
    auroraHablando = true;
    emitirTts(true);
    u.onend = terminar;
    u.onerror = terminar;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    // Red de seguridad: algunos navegadores no disparan onend
    const vigilante = setInterval(() => {
      if (!auroraHablando) { clearInterval(vigilante); return; }
      if (!speechSynthesis.speaking && !speechSynthesis.pending) { clearInterval(vigilante); terminar(); }
    }, 500);
  } catch { terminar(); }
};

interface Opciones {
  /** Se dispara al detectar "Hola Aurora" (es) o "Hey Aurora" (en). */
  onWake: (idioma: Idioma) => void;
  /** Se dispara con la frase final del usuario tras la activación. */
  onFrase: (texto: string) => void;
  activo: boolean;          // escucha pasiva encendida
  modoDictado: boolean;     // tras el wake: captura la consulta completa
  idioma: Idioma;
}

/**
 * Hook de escucha pasiva + dictado.
 * Implementación local con Web Speech API (Chrome/Edge).
 *
 * ► UPGRADE: para wake word offline de alta precisión, reemplazar la
 *   detección pasiva por Picovoice Porcupine Web SDK
 *   (@picovoice/porcupine-web) entrenando "Hola Aurora" y "Hey Aurora"
 *   en la consola de Picovoice; el resto del hook queda igual.
 */
export const useAuroraVoz = ({ onWake, onFrase, activo, modoDictado, idioma }: Opciones) => {
  const [soportado, setSoportado] = useState(true);
  const [transcripcion, setTranscripcion] = useState('');
  const recRef = useRef<ISpeechRecognition | null>(null);
  const cbRef = useRef({ onWake, onFrase });
  cbRef.current = { onWake, onFrase };
  const estadoRef = useRef({ activo, modoDictado, idioma });
  estadoRef.current = { activo, modoDictado, idioma };

  const detener = useCallback(() => {
    try { recRef.current?.abort(); } catch { /* noop */ }
    recRef.current = null;
  }, []);

  useEffect(() => {
    if (!activo) { detener(); return; }

    const rec = crearReconocedor();
    if (!rec) { setSoportado(false); return; }
    recRef.current = rec;

    // En escucha pasiva usamos es-DO: reconoce "hola aurora" y también
    // capta "hey aurora" fonéticamente. En dictado, el idioma ya elegido.
    rec.lang = modoDictado ? (idioma === 'es' ? 'es-DO' : 'en-US') : 'es-DO';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      // Ignora el micrófono mientras Aurora habla (anti-feedback)
      if (ignorarMicrofono()) return;
      let final = '';
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else parcial += r[0].transcript;
      }
      const oido = (final || parcial).toLowerCase().trim();
      setTranscripcion(oido);

      if (!estadoRef.current.modoDictado) {
        // ── Detección de wake word con idioma inteligente ──
        if (/\b(hola|ola)\s+(aurora|lora|dora)\b/.test(oido)) cbRef.current.onWake('es');
        else if (/\b(hey|jei|jey|ei)\s+(aurora|lora|dora)\b/.test(oido)) cbRef.current.onWake('en');
      } else if (final.trim()) {
        cbRef.current.onFrase(final.trim());
      }
    };

    rec.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') setSoportado(false);
    };
    // Chrome corta el stream cada ~60s: reiniciar si seguimos activos
    rec.onend = () => {
      if (ignorarMicrofono()) return; // suspendido por TTS: se retoma con el evento
      if (estadoRef.current.activo && recRef.current === rec) {
        try { rec.start(); } catch { /* ya iniciado */ }
      }
    };

    // Suspende el mic mientras Aurora habla; retoma 1s después
    let timerReinicio: ReturnType<typeof setTimeout> | null = null;
    const onTts = (e: Event) => {
      const hablando = (e as CustomEvent).detail?.hablando;
      if (hablando) {
        if (timerReinicio) { clearTimeout(timerReinicio); timerReinicio = null; }
        try { rec.abort(); } catch { /* noop */ }
      } else {
        timerReinicio = setTimeout(() => {
          if (estadoRef.current.activo && recRef.current === rec) {
            try { rec.start(); } catch { /* ya iniciado */ }
          }
        }, 1000);
      }
    };
    window.addEventListener('aurora:tts', onTts);

    try { rec.start(); } catch { /* doble start */ }
    return () => {
      window.removeEventListener('aurora:tts', onTts);
      if (timerReinicio) clearTimeout(timerReinicio);
      detener();
    };
  }, [activo, modoDictado, idioma, detener]);

  return { soportado, transcripcion };
};
