import { EstadoAlerta, EstadoUnidad, Rol } from './models';

/**
 * Textos y colores de los enums del dominio. Las clases se escriben completas (Tailwind no detecta
 * clases concatenadas). `css` es la variable CSS del color, para el mapa (marcadores HTML).
 */

export interface InfoEstado {
  etiqueta: string;
  clases: string;
  css: string;
}

export const ESTADOS_ALERTA: Record<EstadoAlerta, InfoEstado> = {
  CREADA: { etiqueta: 'Buscando unidad', clases: 'bg-nuevo-bg text-nuevo-fg', css: '--app-nuevo-fg' },
  BUSCANDO_UNIDAD: { etiqueta: 'Buscando unidad', clases: 'bg-nuevo-bg text-nuevo-fg', css: '--app-nuevo-fg' },
  ASIGNADA: { etiqueta: 'Esperando respuesta', clases: 'bg-espera-bg text-espera-fg', css: '--app-espera-fg' },
  ACEPTADA: { etiqueta: 'Aceptada', clases: 'bg-curso-bg text-curso-fg', css: '--app-curso-fg' },
  EN_CAMINO: { etiqueta: 'En camino', clases: 'bg-curso-bg text-curso-fg', css: '--app-curso-fg' },
  LLEGO: { etiqueta: 'En el lugar', clases: 'bg-atencion-bg text-atencion-fg', css: '--app-atencion-fg' },
  EN_ATENCION: { etiqueta: 'En atención', clases: 'bg-atencion-bg text-atencion-fg', css: '--app-atencion-fg' },
  FINALIZADA: { etiqueta: 'Finalizada', clases: 'bg-exito-bg text-exito-fg', css: '--app-exito-fg' },
  SIN_UNIDAD: { etiqueta: 'Sin unidad', clases: 'bg-peligro-bg text-peligro-fg', css: '--app-critico' },
  CANCELADA: { etiqueta: 'Cancelada', clases: 'bg-neutro-bg text-neutro-fg', css: '--app-neutro-fg' },
};

export const ESTADOS_UNIDAD: Record<EstadoUnidad, InfoEstado & { punto: string }> = {
  DISPONIBLE: { etiqueta: 'Disponible', clases: 'bg-exito-bg text-exito-fg', css: '--app-u-disp', punto: 'bg-u-disp' },
  EN_DESPLAZAMIENTO: {
    etiqueta: 'En desplazamiento',
    clases: 'bg-curso-bg text-curso-fg',
    css: '--app-u-ruta',
    punto: 'bg-u-ruta',
  },
  EN_ATENCION: { etiqueta: 'En atención', clases: 'bg-atencion-bg text-atencion-fg', css: '--app-u-aten', punto: 'bg-u-aten' },
  FUERA_DE_SERVICIO: {
    etiqueta: 'Fuera de servicio',
    clases: 'bg-neutro-bg text-neutro-fg',
    css: '--app-u-fuera',
    punto: 'bg-u-fuera',
  },
};

/** Parámetros del motor: etiqueta, unidad y rango permitido (los mismos que valida el backend). */
export const PARAMETROS: Record<string, { etiqueta: string; unidad: string; min: number; max: number }> = {
  tiempo_respuesta_segundos: { etiqueta: 'Tiempo para responder una alerta', unidad: 's', min: 5, max: 120 },
  max_reasignaciones: { etiqueta: 'Reasignaciones antes de escalar a la central', unidad: '', min: 0, max: 20 },
  espera_maxima_segundos: { etiqueta: 'Espera máxima buscando unidad', unidad: 's', min: 10, max: 3600 },
  radio_busqueda_metros: { etiqueta: 'Radio de búsqueda de unidades', unidad: 'm', min: 100, max: 20000 },
  ubicacion_obsoleta_segundos: { etiqueta: 'Antigüedad máxima de la posición de una unidad', unidad: 's', min: 10, max: 3600 },
  distancia_llegada_metros: { etiqueta: 'Distancia para marcar la llegada por GPS', unidad: 'm', min: 5, max: 500 },
  velocidad_promedio_kmh: { etiqueta: 'Velocidad promedio para estimar la llegada', unidad: 'km/h', min: 5, max: 120 },
  tolerancia_borde_metros: { etiqueta: 'Tolerancia en el borde del distrito (error de GPS)', unidad: 'm', min: 0, max: 500 },
};

/** Estados en los que la central puede asignar una unidad a mano (aún no hay una en camino). */
export const ESTADOS_ASIGNABLES: readonly EstadoAlerta[] = ['CREADA', 'BUSCANDO_UNIDAD', 'SIN_UNIDAD', 'ASIGNADA'];

/** Motivos con los que la central puede cancelar una alerta (los mismos códigos que el backend). */
export const MOTIVOS_CANCELACION: readonly { codigo: string; etiqueta: string }[] = [
  { codigo: 'FALSA_ALARMA', etiqueta: 'Falsa alarma confirmada' },
  { codigo: 'DUPLICADA', etiqueta: 'Alerta duplicada' },
  { codigo: 'RESUELTA_POR_LLAMADA', etiqueta: 'Resuelta por llamada' },
  { codigo: 'SOLICITUD_CIUDADANO', etiqueta: 'A solicitud del ciudadano' },
  { codigo: 'OTRO', etiqueta: 'Otro motivo' },
];

/** Alertas que ya no requieren acción. */
export const ESTADOS_FINALES: readonly EstadoAlerta[] = ['FINALIZADA', 'CANCELADA'];

/** Tipos de alerta del backend (código → nombre e ícono de Material Symbols). */
export const TIPOS: Record<string, { nombre: string; icono: string }> = {
  ROBO: { nombre: 'Robo', icono: 'person_alert' },
  INCENDIO: { nombre: 'Incendio', icono: 'local_fire_department' },
  ACCIDENTE: { nombre: 'Accidente', icono: 'car_crash' },
  DISTURBIOS: { nombre: 'Disturbios', icono: 'groups' },
  SOSPECHOSA: { nombre: 'Situación sospechosa', icono: 'visibility' },
  EMERGENCIA: { nombre: 'Emergencia', icono: 'emergency' },
  DESASTRE: { nombre: 'Desastre', icono: 'storm' },
  OTRO: { nombre: 'Otro', icono: 'more_horiz' },
};

export function iconoDeTipo(codigo: string): string {
  return TIPOS[codigo]?.icono ?? 'notifications_active';
}

/** Prioridad 1 (crítica) … 4 (baja): etiqueta y clase del punto de color. */
export const PRIORIDADES: Record<number, { etiqueta: string; punto: string }> = {
  1: { etiqueta: 'Crítica', punto: 'bg-critico' },
  2: { etiqueta: 'Alta', punto: 'bg-alto' },
  3: { etiqueta: 'Media', punto: 'bg-medio' },
  4: { etiqueta: 'Baja', punto: 'bg-bajo' },
};

export const ROLES: Record<Rol, string> = {
  CIUDADANO: 'Ciudadano',
  SERENO: 'Sereno',
  OPERADOR: 'Operador de central',
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Administrador',
};

/** Color de la insignia de cada rol. */
export const ROLES_CLASES: Record<Rol, string> = {
  ADMIN: 'bg-espera-bg text-espera-fg',
  SUPERVISOR: 'bg-atencion-bg text-atencion-fg',
  OPERADOR: 'bg-nuevo-bg text-nuevo-fg',
  SERENO: 'bg-curso-bg text-curso-fg',
  CIUDADANO: 'bg-neutro-bg text-neutro-fg',
};

/** Eventos de la línea de tiempo de una alerta. */
export const EVENTOS: Record<string, { texto: string; punto: string }> = {
  ALERTA_CREADA: { texto: 'Alerta creada', punto: 'bg-primary' },
  BUSCANDO_UNIDAD: { texto: 'Buscando unidad disponible', punto: 'bg-nuevo-fg' },
  UNIDAD_ASIGNADA: { texto: 'Unidad asignada', punto: 'bg-primary' },
  ASIGNACION_MANUAL: { texto: 'Asignación manual de la central', punto: 'bg-espera-fg' },
  ALERTA_RECHAZADA: { texto: 'La unidad no puede atender', punto: 'bg-critico' },
  SIN_RESPUESTA: { texto: 'La unidad no respondió a tiempo', punto: 'bg-critico' },
  ESCALADA_A_CENTRAL: { texto: 'Escalada a la central', punto: 'bg-critico' },
  ALERTA_ACEPTADA: { texto: 'Alerta aceptada', punto: 'bg-curso-fg' },
  RUTA_INICIADA: { texto: 'Ruta iniciada', punto: 'bg-curso-fg' },
  UNIDAD_LLEGO: { texto: 'La unidad llegó', punto: 'bg-atencion-fg' },
  ATENCION_INICIADA: { texto: 'Atención iniciada', punto: 'bg-atencion-fg' },
  ATENCION_FINALIZADA: { texto: 'Atención finalizada', punto: 'bg-exito-fg' },
  ALERTA_CANCELADA: { texto: 'Alerta cancelada', punto: 'bg-neutro-fg' },
  EVIDENCIA_AGREGADA: { texto: 'Evidencia agregada', punto: 'bg-nuevo-fg' },
};

export function infoEvento(tipo: string) {
  return EVENTOS[tipo] ?? { texto: tipo, punto: 'bg-primary' };
}

/** Para indicadores: menos de un minuto se muestra en segundos ("9 s"); desde un minuto, "m:ss min". */
export function partirDuracion(segundos: number | null | undefined): { valor: string; unidad: string } {
  if (segundos === null || segundos === undefined) {
    return { valor: '—', unidad: '' };
  }
  if (segundos < 60) {
    return { valor: String(Math.round(segundos)), unidad: 's' };
  }
  return { valor: formatoDuracion(segundos), unidad: 'min' };
}

/** Segundos → "m:ss" (o "—" si no hay dato). */
export function formatoDuracion(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) {
    return '—';
  }
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
