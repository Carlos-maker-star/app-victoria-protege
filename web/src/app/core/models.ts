// Tipos = DTOs del backend (Spring Boot). Los nombres de campo coinciden con el JSON.

export type Rol = 'CIUDADANO' | 'SERENO' | 'OPERADOR' | 'SUPERVISOR' | 'ADMIN';

/** Roles que pueden usar esta plataforma web. Ciudadanos y serenos usan la app móvil. */
export const ROLES_CENTRAL: readonly Rol[] = ['OPERADOR', 'SUPERVISOR', 'ADMIN'];

export interface Usuario {
  id: number;
  dni: string;
  nombres: string;
  apellidos: string;
  email: string | null;
  telefono: string | null;
  rol: Rol;
}

export interface AuthResponse {
  token: string;
  tipo: string;
  expiraEnSegundos: number;
  usuario: Usuario;
}

export type EstadoAlerta =
  | 'CREADA'
  | 'BUSCANDO_UNIDAD'
  | 'ASIGNADA'
  | 'ACEPTADA'
  | 'EN_CAMINO'
  | 'LLEGO'
  | 'EN_ATENCION'
  | 'FINALIZADA'
  | 'SIN_UNIDAD'
  | 'CANCELADA';

export type EstadoUnidad = 'DISPONIBLE' | 'EN_DESPLAZAMIENTO' | 'EN_ATENCION' | 'FUERA_DE_SERVICIO';

/** Alerta con la información que ve la central. */
export interface Alerta {
  id: number;
  tipo: string;
  tipoNombre: string;
  /** 1 = crítica … 4 = baja. */
  prioridad: number;
  descripcion: string | null;
  latitud: number;
  longitud: number;
  referencia: string | null;
  estado: EstadoAlerta;
  resultado: string | null;
  ciudadano: string;
  ciudadanoTelefono: string | null;
  unidadCodigo: string | null;
  creadaEn: string;
  finalizadaEn: string | null;
}

export interface EventoAlerta {
  tipo: string;
  detalle: string | null;
  unidadCodigo: string | null;
  /** Personal que originó el evento (operador, sereno…); null si fue el sistema o el ciudadano. */
  usuario: string | null;
  creadoEn: string;
}

export interface AlertaDetalle {
  alerta: Alerta;
  historial: EventoAlerta[];
}

export interface Unidad {
  id: number;
  codigo: string;
  placa: string | null;
  tipo: string;
  estado: EstadoUnidad;
  sereno: string | null;
  latitud: number | null;
  longitud: number | null;
  ubicacionEn: string | null;
  velocidadKmh: number | null;
  alertaActualId: number | null;
  /** false = desactivada por el administrador: sale del mapa y de las listas en vivo. */
  activo: boolean;
}

/** Mensaje de /topic/monitoreo/alertas: el evento ocurrido y el estado actual de la alerta. */
export interface NotificacionCentral {
  tipo: string;
  detalle: string | null;
  unidadCodigo: string | null;
  alerta: Alerta;
}

export interface Resumen {
  alertasActivas: number;
  alertasSinUnidad: number;
  unidadesDisponibles: number;
  unidadesEnRuta: number;
  unidadesEnAtencion: number;
  unidadesFueraDeServicio: number;
  unidadesTotal: number;
  atendidasHoy: number;
  reasignadasHoy: number;
  /** Segundos promedio desde que se asigna hasta que el sereno acepta (hoy). */
  tiempoRespuestaSeg: number | null;
  /** Segundos promedio desde que se crea la alerta hasta que la unidad llega (hoy). */
  tiempoLlegadaSeg: number | null;
}

/** Reporte de un rango de fechas (día calendario en hora de Lima). Los tiempos son promedios en segundos. */
export interface Reporte {
  desde: string;
  hasta: string;
  indicadores: {
    total: number;
    atendidas: number;
    canceladas: number;
    activas: number;
    /** Alertas que alguna vez se escalaron a la central por falta de unidades. */
    escaladas: number;
    reasignadas: number;
    tiempoAsignacionSeg: number | null;
    tiempoAceptacionSeg: number | null;
    tiempoLlegadaSeg: number | null;
    tiempoAtencionSeg: number | null;
  };
  porDia: { fecha: string; total: number; tiempoLlegadaSeg: number | null }[];
  porHora: { hora: number; total: number }[];
  porTipo: Conteo[];
  porZona: Conteo[];
  motivosReasignacion: Conteo[];
  unidades: {
    codigo: string;
    sereno: string | null;
    asignaciones: number;
    atendidas: number;
    rechazadas: number;
    sinRespuesta: number;
    tiempoTrasladoSeg: number | null;
  }[];
}

export interface Conteo {
  codigo: string;
  nombre: string;
  total: number;
}

/** Unidad que la central puede elegir para una alerta (con el motivo si no se puede). */
export interface Candidata {
  id: number;
  codigo: string;
  sereno: string | null;
  estado: EstadoUnidad;
  distanciaM: number | null;
  etaSegundos: number | null;
  ubicacionEn: string | null;
  asignable: boolean;
  motivoNoDisponible: string | null;
}

export interface AsignacionManual {
  unidadId: number;
  motivo: string;
}

export interface Cancelacion {
  motivo: string;
  observacion: string | null;
}

export interface Zona {
  id: number;
  nombre: string;
  tipo: 'DISTRITO' | 'SECTOR';
  /** GeoJSON (texto) del polígono. */
  geojson: string;
}

// ---------- Administración (solo ADMIN) ----------

export interface UsuarioAdmin {
  id: number;
  dni: string;
  nombres: string;
  apellidos: string;
  email: string | null;
  telefono: string | null;
  rol: Rol;
  activo: boolean;
  /** Código de la unidad que opera (solo serenos). */
  unidadCodigo: string | null;
  creadoEn: string;
}

export interface CrearUsuario {
  dni: string;
  nombres: string;
  apellidos: string;
  email: string | null;
  telefono: string | null;
  rol: Rol;
  password: string;
}

export type ActualizarUsuario = Omit<CrearUsuario, 'dni' | 'password'>;

export type TipoUnidad = 'CAMIONETA' | 'MOTO' | 'PATRULLERO' | 'OTRO';

export interface UnidadAdmin {
  id: number;
  codigo: string;
  placa: string | null;
  tipo: TipoUnidad;
  activo: boolean;
  estado: EstadoUnidad;
  serenoId: number | null;
  sereno: string | null;
  latitud: number | null;
  longitud: number | null;
  /** Sector base de patrullaje (informativo); null = sin sector. */
  zonaId: number | null;
  zona: string | null;
}

export interface CrearUnidad {
  codigo: string;
  placa: string | null;
  tipo: TipoUnidad;
  serenoId: number | null;
  zonaId: number | null;
}

export type ActualizarUnidad = Omit<CrearUnidad, 'codigo'>;

/** Distrito o sector tal como lo ve el administrador (incluye los inactivos y sus conteos). */
export interface ZonaAdmin extends Zona {
  activo: boolean;
  areaKm2: number;
  /** Alertas históricas ubicadas en la zona. */
  alertas: number;
  /** Unidades que la tienen como sector base. */
  unidades: number;
}

export interface CrearSector {
  nombre: string;
  geojson: string;
}

export interface GenerarCuadricula {
  filas: number;
  columnas: number;
  reemplazar: boolean;
}

export interface Parametro {
  clave: string;
  valor: string;
  descripcion: string;
}

/** Foto, video o nota que el ciudadano o el sereno adjuntó a una alerta. */
export interface Evidencia {
  id: number;
  alertaId: number;
  origen: 'CIUDADANO' | 'SERENO';
  tipo: 'FOTO' | 'VIDEO' | 'NOTA';
  observacion: string | null;
  autor: string;
  /** false = nota sin archivo. */
  conArchivo: boolean;
  creadoEn: string;
}

export interface RegistroAuditoria {
  id: number;
  /** null = el sistema o un intento sin sesión. */
  usuario: string | null;
  dni: string | null;
  accion: string;
  entidad: string | null;
  entidadId: number | null;
  detalle: string | null;
  ip: string | null;
  dispositivo: string | null;
  creadoEn: string;
}

export interface PaginaAuditoria {
  total: number;
  pagina: number;
  tamano: number;
  items: RegistroAuditoria[];
}

export interface FiltroAuditoria {
  accion?: string;
  q?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
  tamano?: number;
}

/** Cuerpo de error del backend. */
export interface ErrorApi {
  codigo: string;
  mensaje: string;
  /** Solo en errores de validación (HTTP 400); en los demás el backend lo omite. */
  campos?: Record<string, string> | null;
}
