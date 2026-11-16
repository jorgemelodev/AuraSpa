// Horario del spa: 9:00 AM a 7:00 PM en intervalos de 30 minutos, excluyendo la hora de almuerzo (12:30-13:30).
export const HORAS_SPA = [
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00',
  '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00',
];

export const formatHora12 = (h: string) => {
  const [hh, mm] = h.split(':').map(Number);
  const periodo = hh < 12 ? 'AM' : 'PM';
  const hora12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hora12}:${String(mm).padStart(2, '0')} ${periodo}`;
};

// Domingos: horario reducido de 10:00 AM a 4:00 PM (resto de la semana: 9:00 AM a 7:00 PM).
export const horaFueraDeHorarioDomingo = (fechaISO: string, hora: string): boolean => {
  if (!fechaISO) return false;
  const esDomingo = new Date(`${fechaISO}T00:00`).getDay() === 0;
  if (!esDomingo) return false;
  const [hh, mm] = hora.split(':').map(Number);
  const minutos = hh * 60 + mm;
  const horaMin = 10, horaMax = 16;
  return minutos < horaMin * 60 || minutos > horaMax * 60;
};
