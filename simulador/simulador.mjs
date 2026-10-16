#!/usr/bin/env node
/*
 * Simulador de La Victoria Protege.
 *
 * Hace el trabajo de las apps móviles que aún no existen: crea unidades con sus serenos y ciudadanos de prueba,
 * genera alertas con una frecuencia configurable y hace que los serenos respondan y se desplacen. Sirve para
 * ver la central en movimiento y para medir el motor de asignación con experimentos repetibles.
 *
 * Modos:
 *   automatico  el motor asigna la unidad más cercana (el sistema propuesto)
 *   manual      el motor se apaga y un operador simulado asigna "por radio" (el método base para comparar)
 *
 * Uso:   node simulador/simulador.mjs --modo automatico --unidades 8 --duracion 180 --semilla 42
 * Ayuda: node simulador/simulador.mjs --ayuda
 *
 * Solo usa Node (>= 20): sin instalar nada. Los resultados quedan en simulador/resultados/.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- opciones
const DEFECTOS = {
  api: 'http://localhost:8080/api',
  modo: 'automatico',
  unidades: 8,
  ciudadanos: 0, // 0 = automático (3 por unidad, mínimo 20)
  duracion: 120, // segundos generando alertas
  drenaje: 240, // segundos máximos para que terminen las alertas abiertas
  'alertas-por-minuto': 3,
  semilla: 1,
  'velocidad-kmh': 40,
  'factor-velocidad': 3, // acelera el desplazamiento (los tiempos del servidor siguen siendo reales)
  'p-rechazo': 0.1,
  'p-sin-respuesta': 0.05,
  'reaccion-min': 1,
  'reaccion-max': 8,
  'atencion-min': 15,
  'atencion-max': 45,
  'operador-demora': 25, // modo manual: segundos medios que tarda el operador en asignar
  'operador-desviacion': 10,
  'operador-error': 0.2, // modo manual: probabilidad de elegir la 2.ª más cercana en vez de la 1.ª
  nombre: '',
  'sin-aislar': false,
  silencioso: false,
  ayuda: false,
};

function leerOpciones(argv) {
  const o = { ...DEFECTOS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Argumento no reconocido: ${a}`);
    const clave = a.slice(2);
    if (!(clave in DEFECTOS)) throw new Error(`Opción desconocida: --${clave} (usa --ayuda)`);
    if (typeof DEFECTOS[clave] === 'boolean') { o[clave] = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Error(`Falta el valor de --${clave}`);
    o[clave] = typeof DEFECTOS[clave] === 'number' ? Number(v) : v;
    if (typeof DEFECTOS[clave] === 'number' && Number.isNaN(o[clave])) throw new Error(`--${clave} debe ser un número`);
  }
  if (!['automatico', 'manual'].includes(o.modo)) throw new Error('--modo debe ser automatico o manual');
  return o;
}

const AYUDA = `
Simulador de La Victoria Protege

  --modo automatico|manual      Quién asigna la unidad (por defecto automatico)
  --unidades N                  Unidades simuladas (8)
  --duracion S                  Segundos generando alertas (120)
  --alertas-por-minuto N        Frecuencia media de alertas, proceso de Poisson (3)
  --semilla N                   Semilla del azar: misma semilla, mismo escenario (1)
  --velocidad-kmh N             Velocidad de las unidades (40)
  --factor-velocidad N          Acelera el desplazamiento (3). Úsalo igual en los dos modos
  --p-rechazo P                 Probabilidad de que un sereno rechace la alerta (0.10)
  --p-sin-respuesta P           Probabilidad de que no responda en el tiempo límite (0.05)
  --reaccion-min/--reaccion-max Segundos que tarda un sereno en responder (1 a 8)
  --atencion-min/--atencion-max Segundos de atención en el lugar (15 a 45)
  --operador-demora S           Modo manual: segundos medios que tarda el operador en asignar (25)
  --operador-desviacion S       Modo manual: desviación de esa demora (10)
  --operador-error P            Modo manual: prob. de elegir la 2.ª más cercana (0.20)
  --drenaje S                   Segundos máximos para terminar las alertas abiertas (240)
  --ciudadanos N                Ciudadanos de prueba (0 = automático)
  --nombre TEXTO                Nombre del experimento (nombre de los archivos de resultados)
  --sin-aislar                  No desactivar las unidades que no son de la simulación
  --silencioso                  Menos mensajes
  --api URL                     URL de la API (http://localhost:8080/api)

La clave de los usuarios de prueba se lee de backend/src/main/resources/application-local.properties
(app.seed.password) o de las variables de entorno SIM_CLAVE o SEED_PASSWORD.
`;

// ---------------------------------------------------------------- azar con semilla
function crearAzar(semilla) {
  let s = semilla >>> 0;
  const unif = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    unif,
    entre: (a, b) => a + unif() * (b - a),
    normal: (media, desv) => media + desv * Math.sqrt(-2 * Math.log(1 - unif())) * Math.cos(2 * Math.PI * unif()),
    elegir: (lista) => lista[Math.floor(unif() * lista.length)],
    poisson: (lambda) => {
      const limite = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do { k++; p *= unif(); } while (p > limite);
      return k - 1;
    },
    ponderado: (pares) => {
      const total = pares.reduce((s, [, w]) => s + w, 0);
      let r = unif() * total;
      for (const [valor, w] of pares) { r -= w; if (r <= 0) return valor; }
      return pares.at(-1)[0];
    },
  };
}

// ---------------------------------------------------------------- utilidades
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const MOTIVOS_RECHAZO = ['OTRA_INCIDENCIA', 'EMERGENCIA', 'UNIDAD_OCUPADA', 'FUERA_DE_SERVICIO', 'SIN_DESPLAZAMIENTO', 'SIN_DISPONIBILIDAD'];
const TIPOS_ALERTA = [['ROBO', 42], ['SOSPECHOSA', 22], ['DISTURBIOS', 14], ['ACCIDENTE', 10], ['EMERGENCIA', 5], ['INCENDIO', 3], ['OTRO', 4]];
const RESULTADOS = [['ATENDIDA', 70], ['SIN_NOVEDAD', 15], ['FALSA_ALARMA', 8], ['DERIVADA', 4], ['REQUIERE_APOYO', 3]];
const hh = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function leerClave() {
  if (process.env.SIM_CLAVE) return process.env.SIM_CLAVE;
  try {
    if (process.env.SEED_PASSWORD) return process.env.SEED_PASSWORD;
    const txt = readFileSync(join(AQUI, '..', 'backend', 'src', 'main', 'resources', 'application-local.properties'), 'utf8');
    return txt.match(/^app\.seed\.password=(.*)$/m)[1].trim();
  } catch {
    throw new Error('No encuentro la clave de prueba. Define SIM_CLAVE (o SEED_PASSWORD) o ejecuta el simulador dentro del proyecto.');
  }
}

/** Cliente HTTP de la API con un token. */
function cliente(base) {
  return async function api(metodo, ruta, token, cuerpo) {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    let datos = null;
    try { datos = await r.json(); } catch { /* sin cuerpo */ }
    return { s: r.status, d: datos };
  };
}

// ---------------------------------------------------------------- geometría
const M_POR_GRADO = 111320;
const distanciaM = (a, b) => {
  const dy = (b.lat - a.lat) * M_POR_GRADO;
  const dx = (b.lon - a.lon) * M_POR_GRADO * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
};

function crearMuestreador(geojson) {
  const g = JSON.parse(geojson);
  const poligonos = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  const anillos = poligonos.map((p) => p[0]);
  const todos = anillos.flat();
  const lons = todos.map((p) => p[0]);
  const lats = todos.map((p) => p[1]);
  const caja = { minLon: Math.min(...lons), maxLon: Math.max(...lons), minLat: Math.min(...lats), maxLat: Math.max(...lats) };
  const dentro = (lat, lon) =>
    anillos.some((anillo) => {
      let c = false;
      for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
        const [xi, yi] = anillo[i];
        const [xj, yj] = anillo[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    });
  return {
    dentro,
    /** Punto al azar dentro del distrito (se descarta lo que cae fuera), con el generador que se indique. */
    punto(azar) {
      for (let i = 0; i < 1000; i++) {
        const lat = azar.entre(caja.minLat, caja.maxLat);
        const lon = azar.entre(caja.minLon, caja.maxLon);
        if (dentro(lat, lon)) return { lat, lon };
      }
      throw new Error('No se pudo muestrear un punto dentro del distrito');
    },
  };
}

// ---------------------------------------------------------------- estadísticas
function estadisticas(valores) {
  const v = valores.filter((x) => x !== null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (v.length === 0) return { n: 0, media: null, mediana: null, p90: null, max: null };
  const pct = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { n: v.length, media: v.reduce((s, x) => s + x, 0) / v.length, mediana: pct(0.5), p90: pct(0.9), max: v.at(-1) };
}
const f1 = (x) => (x === null ? '—' : x.toFixed(1));

// ---------------------------------------------------------------- programa
async function main() {
  const o = leerOpciones(process.argv.slice(2));
  if (o.ayuda) { console.log(AYUDA); return; }

  // Un generador de azar INDEPENDIENTE por cada parte, todos derivados de la semilla. Así el plan de alertas
  // (cuándo, de qué tipo y dónde) es idéntico en el modo automático y en el manual aunque los serenos
  // reaccionen distinto: es lo que hace comparable un experimento con otro.
  const azarPlan = crearAzar(o.semilla * 7 + 1);
  const azarPosiciones = crearAzar(o.semilla * 7 + 2);
  const azarOperador = crearAzar(o.semilla * 7 + 3);
  const api = cliente(o.api);
  const clave = leerClave();
  const nombre = o.nombre || `${o.modo}-s${o.semilla}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`;
  const log = (...a) => { if (!o.silencioso) console.log(...a); };
  const t0 = Date.now();
  const seg = () => (Date.now() - t0) / 1000;
  const marca = (...a) => log(`[${hh(seg())}]`, ...a);

  const login = async (usuario) => {
    const r = await api('POST', '/auth/login', null, { usuario, password: clave });
    return r.s === 200 ? r.d.token : null;
  };

  // ---- sesiones de la central
  const admin = await login('00000001');
  const operador = await login('00000003');
  if (!admin || !operador) throw new Error('No pude iniciar sesión como administrador/operador. ¿Está el backend en marcha y con los usuarios de prueba?');

  // ---- distrito
  const zonas = (await api('GET', '/monitoreo/zonas', operador)).d;
  const distrito = zonas.find((z) => z.tipo === 'DISTRITO');
  const mapa = crearMuestreador(distrito.geojson);

  // ---- parámetros originales (se restauran al final)
  const parametros = (await api('GET', '/admin/parametros', admin)).d;
  const modoOriginal = parametros.find((p) => p.clave === 'asignacion_automatica').valor;
  const restaurar = { unidadesDesactivadas: [], unidadesSim: [] };

  // ---- usuarios y unidades de la simulación
  async function asegurarUsuario(dni, nombres, apellidos, rol) {
    const lista = (await api('GET', `/admin/usuarios?q=${dni}`, admin)).d || [];
    let u = lista.find((x) => x.dni === dni);
    if (!u) {
      const r = await api('POST', '/admin/usuarios', admin, { dni, nombres, apellidos, rol, password: clave });
      if (r.s !== 201) throw new Error(`No pude crear el usuario ${dni}: ${JSON.stringify(r.d)}`);
      return r.d;
    }
    if (!u.activo) await api('PATCH', `/admin/usuarios/${u.id}/activo`, admin, { activo: true });
    if (!(await login(dni))) await api('POST', `/admin/usuarios/${u.id}/clave`, admin, { password: clave });
    return u;
  }

  marca(`Preparando ${o.unidades} unidades y sus serenos…`);
  const unidadesExistentes = (await api('GET', '/admin/unidades', admin)).d;
  const agentes = [];
  for (let i = 1; i <= o.unidades; i++) {
    const n = String(i).padStart(2, '0');
    const codigo = `SIM-${n}`;
    const sereno = await asegurarUsuario(String(91000000 + i), 'Sereno', `Simulado ${n}`, 'SERENO');
    let unidad = unidadesExistentes.find((x) => x.codigo === codigo);
    if (!unidad) {
      const r = await api('POST', '/admin/unidades', admin, { codigo, placa: `SIM-${n}`, tipo: i % 3 === 0 ? 'MOTO' : 'CAMIONETA', serenoId: sereno.id });
      if (r.s !== 201) throw new Error(`No pude crear la unidad ${codigo}: ${JSON.stringify(r.d)}`);
      unidad = r.d;
    } else {
      if (!unidad.activo) await api('PATCH', `/admin/unidades/${unidad.id}/activo`, admin, { activo: true });
      if (unidad.serenoId !== sereno.id) await api('PUT', `/admin/unidades/${unidad.id}`, admin, { placa: unidad.placa, tipo: unidad.tipo, serenoId: sereno.id });
    }
    const token = await login(sereno.dni);
    agentes.push({
      codigo, token, pos: mapa.punto(azarPosiciones), estado: 'INICIO',
      velocidadMs: (o['velocidad-kmh'] / 3.6) * o['factor-velocidad'],
      azar: crearAzar(o.semilla * 1000 + i), // las decisiones de cada sereno son su propia secuencia
    });
    restaurar.unidadesSim.push(unidad.id);
  }

  // ---- ciudadanos
  const nCiu = o.ciudadanos > 0 ? o.ciudadanos : Math.max(20, o.unidades * 3);
  marca(`Preparando ${nCiu} ciudadanos…`);
  const ciudadanos = [];
  for (let i = 1; i <= nCiu; i++) {
    const u = await asegurarUsuario(String(92000000 + i), 'Vecino', `Simulado ${String(i).padStart(2, '0')}`, 'CIUDADANO');
    const token = await login(u.dni);
    ciudadanos.push({ dni: u.dni, token, ocupado: false });
    // Cualquier alerta activa que haya quedado de una corrida anterior se cancela
    const prev = await api('GET', '/ciudadano/alertas', token);
    for (const a of (prev.d || []).filter((x) => !['FINALIZADA', 'CANCELADA'].includes(x.estado))) {
      await api('POST', `/monitoreo/alertas/${a.id}/cancelar`, operador, { motivo: 'OTRO', observacion: 'Limpieza del simulador' });
    }
  }

  // ---- aislar: las unidades que no son de la simulación no deben recibir alertas
  if (!o['sin-aislar']) {
    for (const u of (await api('GET', '/admin/unidades', admin)).d.filter((x) => x.activo && !x.codigo.startsWith('SIM-'))) {
      const r = await api('PATCH', `/admin/unidades/${u.id}/activo`, admin, { activo: false });
      if (r.s === 200) restaurar.unidadesDesactivadas.push(u.id);
      else marca(`Aviso: no pude apartar la unidad ${u.codigo} (${r.d?.mensaje ?? r.s}); podría recibir alertas`);
    }
  }
  // Alertas abiertas de otras pruebas: se cancelan para partir de cero
  for (const a of (await api('GET', '/monitoreo/alertas', operador)).d) {
    await api('POST', `/monitoreo/alertas/${a.id}/cancelar`, operador, { motivo: 'OTRO', observacion: 'Limpieza del simulador' });
  }

  await api('PUT', '/admin/parametros/asignacion_automatica', admin, { valor: String(o.modo === 'automatico') });
  marca(`Modo de asignación: ${o.modo === 'automatico' ? 'AUTOMÁTICO (motor)' : 'MANUAL (operador simulado, método base)'}`);

  // ---- estado de la simulación
  const alertas = new Map(); // id -> { id, ciudadano, creadaT, ... }
  const stats = { creadas: 0, descartadas: 0, errores: 0, aceptadas: 0, rechazos: 0, silencios: 0, asignacionesManuales: 0 };
  let generando = true;
  let detener = false;
  process.on('SIGINT', () => { if (detener) process.exit(1); detener = true; generando = false; marca('Interrumpido: terminando y limpiando…'); });

  // ---- agente sereno
  async function pasoSereno(a) {
    const dt = 1;
    try {
      if (a.estado === 'INICIO') {
        a.estado = 'LIBRE';
        await api('POST', '/sereno/posicion', a.token, { latitud: a.pos.lat, longitud: a.pos.lon, velocidadKmh: 0 });
        await api('POST', '/sereno/estado', a.token, { estado: 'DISPONIBLE' });
        a.proximoPing = seg() + 1;
        return;
      }
      if (a.estado === 'LIBRE' || a.estado === 'ESPERANDO') {
        if (seg() < (a.proximoPing ?? 0)) return;
        a.proximoPing = seg() + 1;
        const r = await api('POST', '/sereno/posicion', a.token, { latitud: a.pos.lat, longitud: a.pos.lon, velocidadKmh: 0 });
        if (r.s !== 200) return;
        const e = r.d;
        if (a.estado === 'LIBRE' && e.asignacion && e.asignacion.estado === 'PENDIENTE_RESPUESTA') {
          // Decide cómo reaccionará a esta alerta
          const x = a.azar.unif();
          const maxEspera = Math.max(1, Math.min(o['reaccion-max'], e.asignacion.segundosRestantes - 2));
          const demora = a.azar.entre(Math.min(o['reaccion-min'], maxEspera), maxEspera);
          a.asignacion = e.asignacion;
          if (x < o['p-sin-respuesta']) { a.plan = 'IGNORAR'; stats.silencios++; a.cuando = Infinity; }
          else if (x < o['p-sin-respuesta'] + o['p-rechazo']) { a.plan = 'RECHAZAR'; a.cuando = seg() + demora; }
          else { a.plan = 'ACEPTAR'; a.cuando = seg() + demora; }
          a.estado = 'DECIDIENDO';
          return;
        }
        if (a.estado === 'LIBRE' && !e.asignacion && e.estado !== 'DISPONIBLE') {
          // El servidor la dejó fuera de servicio u ocupada (rechazo, sin respuesta): el sereno la reactiva tras un rato
          a.estado = 'RECUPERANDO';
          a.cuando = seg() + a.azar.entre(5, 15);
        }
        return;
      }
      if (a.estado === 'DECIDIENDO') {
        // ¿Sigue vigente? (el motor o la central pudieron reasignarla/cancelarla)
        if (a.plan === 'IGNORAR') {
          const r = await api('POST', '/sereno/posicion', a.token, { latitud: a.pos.lat, longitud: a.pos.lon, velocidadKmh: 0 });
          if (r.s === 200 && !r.d.asignacion) { a.estado = 'LIBRE'; a.plan = null; }
          return;
        }
        if (seg() < a.cuando) return;
        if (a.plan === 'ACEPTAR') {
          const r = await api('POST', `/sereno/asignaciones/${a.asignacion.id}/aceptar`, a.token);
          if (r.s === 200) { stats.aceptadas++; a.estado = 'EN_RUTA'; a.destino = { lat: a.asignacion.latitud, lon: a.asignacion.longitud }; a.alertaId = a.asignacion.alertaId; }
          else { a.estado = 'LIBRE'; } // venció o la reasignaron
        } else {
          const r = await api('POST', `/sereno/asignaciones/${a.asignacion.id}/rechazar`, a.token, { motivo: a.azar.elegir(MOTIVOS_RECHAZO) });
          if (r.s === 200) { stats.rechazos++; a.estado = 'RECUPERANDO'; a.cuando = seg() + a.azar.entre(5, 15); }
          else { a.estado = 'LIBRE'; }
        }
        a.plan = null;
        return;
      }
      if (a.estado === 'RECUPERANDO') {
        if (seg() < a.cuando) return;
        const r = await api('POST', '/sereno/estado', a.token, { estado: 'DISPONIBLE' });
        a.estado = 'LIBRE';
        a.proximoPing = seg() + 1;
        if (r.s !== 200) a.proximoPing = seg() + 4; // todavía tiene una asignación en curso
        return;
      }
      if (a.estado === 'EN_RUTA') {
        // Se mueve en línea recta hacia la alerta; el servidor detecta la llegada por GPS
        const resto = distanciaM(a.pos, a.destino);
        const paso = Math.min(resto, a.velocidadMs * dt);
        const f = resto === 0 ? 1 : paso / resto;
        a.pos = { lat: a.pos.lat + (a.destino.lat - a.pos.lat) * f, lon: a.pos.lon + (a.destino.lon - a.pos.lon) * f };
        const r = await api('POST', '/sereno/posicion', a.token, { latitud: a.pos.lat, longitud: a.pos.lon, velocidadKmh: Math.round((paso / dt) * 3.6) });
        if (r.s !== 200) return;
        const e = r.d;
        if (!e.asignacion) { a.estado = 'LIBRE'; return; } // cancelada por el ciudadano o la central
        if (e.asignacion.alertaEstado === 'LLEGO') {
          a.estado = 'ATENDIENDO';
          a.cuando = seg() + a.azar.entre(o['atencion-min'], o['atencion-max']);
          await api('POST', `/sereno/asignaciones/${e.asignacion.id}/iniciar-atencion`, a.token);
        } else if (resto <= 5 && seg() > (a.llegadaIntento ?? 0)) {
          // Ya está encima y el GPS no lo registró: lo marca a mano
          a.llegadaIntento = seg() + 5;
          await api('POST', `/sereno/asignaciones/${e.asignacion.id}/llegada`, a.token);
        }
        return;
      }
      if (a.estado === 'ATENDIENDO') {
        if (seg() < a.cuando) return;
        const r = await api('POST', '/sereno/posicion', a.token, { latitud: a.pos.lat, longitud: a.pos.lon, velocidadKmh: 0 });
        const asig = r.d?.asignacion;
        if (!asig) { a.estado = 'LIBRE'; return; }
        const f = await api('POST', `/sereno/asignaciones/${asig.id}/finalizar`, a.token, { resultado: a.azar.ponderado(RESULTADOS), observacion: 'Atención simulada' });
        if (f.s === 200) { a.estado = 'RECUPERANDO'; a.cuando = seg() + a.azar.entre(2, 6); } // "continuar operando"
        return;
      }
    } catch (e) {
      stats.errores++;
      if (!o.silencioso) console.error(`Error en ${a.codigo}:`, e.message);
    }
  }

  // ---- plan de alertas: se calcula ANTES de empezar con su propio azar, así es idéntico en cualquier modo
  const plan = [];
  {
    const tasa = o['alertas-por-minuto'] / 60;
    let instante = 0;
    for (;;) {
      instante += -Math.log(1 - azarPlan.unif()) / tasa; // tiempos entre llegadas exponenciales (proceso de Poisson)
      if (instante >= o.duracion) break;
      plan.push({ t: instante, tipo: azarPlan.ponderado(TIPOS_ALERTA), punto: mapa.punto(azarPlan) });
    }
  }
  let siguientePlan = 0;
  // Huella del plan (FNV-1a): dos corridas con la misma semilla y parámetros dan la misma huella
  const huellaPlan = (() => {
    let h = 2166136261;
    for (const c of JSON.stringify(plan.map((p) => [p.t.toFixed(3), p.tipo, p.punto.lat.toFixed(6), p.punto.lon.toFixed(6)]))) {
      h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  })();

  // ---- los ciudadanos reportan lo que dice el plan
  async function generarAlertas() {
    while (siguientePlan < plan.length && plan[siguientePlan].t <= seg()) {
      const item = plan[siguientePlan];
      const indice = siguientePlan++;
      // Ciudadano por turnos; si está ocupado con otra alerta, el siguiente libre
      let c = null;
      for (let k = 0; k < ciudadanos.length && !c; k++) {
        const candidato = ciudadanos[(indice + k) % ciudadanos.length];
        if (!candidato.ocupado) c = candidato;
      }
      if (!c) { stats.descartadas++; continue; }
      c.ocupado = true;
      const r = await api('POST', '/ciudadano/alertas', c.token, { tipo: item.tipo, latitud: item.punto.lat, longitud: item.punto.lon, descripcion: 'Alerta simulada', referencia: `Simulación ${nombre}` });
      if (r.s === 201) {
        stats.creadas++;
        alertas.set(r.d.id, { id: r.d.id, ciudadano: c, tipo: item.tipo, creadaT: seg(), final: false });
        marca(`Alerta #${r.d.id} (${item.tipo})`);
      } else {
        c.ocupado = false;
        stats.errores++;
        if (!o.silencioso) console.error('No se pudo crear la alerta:', r.s, r.d?.mensaje ?? '');
      }
    }
  }

  // ---- operador simulado (modo manual): atiende una alerta a la vez, con demora humana
  const operadorEstado = { ocupadoHasta: 0, enCurso: null, reintentos: new Map() };
  async function pasoOperador() {
    if (o.modo !== 'manual' || seg() < operadorEstado.ocupadoHasta) return;
    const abiertas = (await api('GET', '/monitoreo/alertas', operador)).d || [];
    const sinUnidad = abiertas
      .filter((a) => alertas.has(a.id) && ['CREADA', 'BUSCANDO_UNIDAD', 'SIN_UNIDAD'].includes(a.estado) && seg() >= (operadorEstado.reintentos.get(a.id) ?? 0))
      .sort((x, y) => x.prioridad - y.prioridad || x.creadaEn.localeCompare(y.creadaEn));
    const alerta = sinUnidad[0];
    if (!alerta) return;
    // El operador "toma la radio": tarda en decidir y asignar
    const demora = Math.max(3, azarOperador.normal(o['operador-demora'], o['operador-desviacion']));
    operadorEstado.ocupadoHasta = seg() + demora;
    await dormir(0); // deja correr el resto de la simulación mientras "habla por radio"
    operadorEstado.enCurso = { id: alerta.id, listoEn: operadorEstado.ocupadoHasta };
  }
  async function cerrarAsignacionOperador() {
    const e = operadorEstado.enCurso;
    if (!e || seg() < e.listoEn) return;
    operadorEstado.enCurso = null;
    const cands = ((await api('GET', `/monitoreo/alertas/${e.id}/candidatas`, operador)).d || []).filter((c) => c.asignable && c.distanciaM !== null);
    if (cands.length === 0) { operadorEstado.reintentos.set(e.id, seg() + 10); operadorEstado.ocupadoHasta = seg() + 2; return; }
    // Casi siempre la más cercana; a veces la segunda (error humano al estimar distancias)
    const elegida = cands.length > 1 && azarOperador.unif() < o['operador-error'] ? cands[1] : cands[0];
    const r = await api('POST', `/monitoreo/alertas/${e.id}/asignar`, operador, { unidadId: elegida.id, motivo: 'Asignación por radio (simulada)' });
    if (r.s === 200) { stats.asignacionesManuales++; marca(`Operador asigna #${e.id} a ${elegida.codigo}`); }
    else { operadorEstado.reintentos.set(e.id, seg() + 8); }
  }

  // ---- seguimiento de alertas abiertas
  async function revisarAlertas() {
    for (const a of alertas.values()) {
      if (a.final) continue;
      const r = await api('GET', `/monitoreo/alertas/${a.id}`, operador);
      if (r.s !== 200) continue;
      if (['FINALIZADA', 'CANCELADA'].includes(r.d.alerta.estado)) {
        a.final = true;
        a.ciudadano.ocupado = false;
        marca(`Alerta #${a.id} ${r.d.alerta.estado === 'FINALIZADA' ? 'atendida' : 'cancelada'}`);
      }
    }
  }

  // ---- bucle principal
  marca(`Comienza la simulación: ${plan.length} alertas planificadas en ${o.duracion} s (${o['alertas-por-minuto']}/min), semilla ${o.semilla}`);
  let ultimaRevision = 0;
  let ultimoResumen = 0;
  let finGeneracion = null;
  while (!detener) {
    const inicioTick = Date.now();
    if (generando && seg() >= o.duracion && siguientePlan >= plan.length) { generando = false; finGeneracion = seg(); marca('Se detiene la generación de alertas; esperando que terminen las abiertas…'); }
    if (generando) await generarAlertas();
    await Promise.all(agentes.map(pasoSereno));
    if (o.modo === 'manual') { await cerrarAsignacionOperador(); await pasoOperador(); }
    if (seg() - ultimaRevision >= 2) { ultimaRevision = seg(); await revisarAlertas(); }
    const abiertas = [...alertas.values()].filter((x) => !x.final).length;
    if (!generando && abiertas === 0) break;
    if (!generando && finGeneracion !== null && seg() - finGeneracion > o.drenaje) { marca(`Se agotó el tiempo de espera con ${abiertas} alertas abiertas; se cancelan`); break; }
    if (!o.silencioso && seg() - ultimoResumen >= 15) {
      ultimoResumen = seg();
      const est = {};
      agentes.forEach((x) => (est[x.estado] = (est[x.estado] ?? 0) + 1));
      marca(`creadas ${stats.creadas} · abiertas ${abiertas} · unidades ${JSON.stringify(est)}`);
    }
    await dormir(Math.max(0, 1000 - (Date.now() - inicioTick)));
  }

  // ---- cierre: cancelar lo pendiente, medir y restaurar
  for (const a of alertas.values()) {
    if (!a.final) {
      await api('POST', `/monitoreo/alertas/${a.id}/cancelar`, operador, { motivo: 'OTRO', observacion: 'Fin de la simulación' });
      a.final = true;
      a.ciudadano.ocupado = false;
      a.truncada = true;
    }
  }

  const tiempo = (iso) => new Date(iso).getTime() / 1000;
  const filas = [];
  for (const a of alertas.values()) {
    const d = (await api('GET', `/monitoreo/alertas/${a.id}`, operador)).d;
    const ev = d.historial;
    const primero = (...tipos) => ev.find((e) => tipos.includes(e.tipo));
    const ultimo = (tipo) => [...ev].reverse().find((e) => e.tipo === tipo);
    const creada = primero('ALERTA_CREADA');
    const asignada = primero('UNIDAD_ASIGNADA', 'ASIGNACION_MANUAL');
    const aceptada = ultimo('ALERTA_ACEPTADA');
    const llego = primero('UNIDAD_LLEGO');
    const fin = primero('ATENCION_FINALIZADA');
    const dif = (x, y) => (x && y ? tiempo(x.creadoEn) - tiempo(y.creadoEn) : null);
    filas.push({
      id: a.id,
      tipo: a.tipo,
      estado: d.alerta.estado,
      truncada: !!a.truncada,
      tAsignacion: dif(asignada, creada),
      tAceptacion: dif(aceptada, asignada),
      tLlegada: dif(llego, creada),
      tAtencion: dif(fin, llego),
      reasignaciones: ev.filter((e) => ['ALERTA_RECHAZADA', 'SIN_RESPUESTA'].includes(e.tipo)).length,
      escalada: ev.some((e) => e.tipo === 'ESCALADA_A_CENTRAL'),
      manual: ev.some((e) => e.tipo === 'ASIGNACION_MANUAL'),
    });
  }

  const validas = filas.filter((f) => f.estado === 'FINALIZADA');
  const resumen = {
    experimento: nombre,
    modo: o.modo,
    parametros: { ...o },
    plan: { alertasPlanificadas: plan.length, huella: huellaPlan },
    alertas: { creadas: stats.creadas, finalizadas: validas.length, canceladas: filas.length - validas.length, descartadasPorFaltaDeCiudadanos: stats.descartadas },
    reasignadas: filas.filter((f) => f.reasignaciones > 0).length,
    escaladas: filas.filter((f) => f.escalada).length,
    tiempos: {
      asignacion: estadisticas(validas.map((f) => f.tAsignacion)),
      aceptacion: estadisticas(validas.map((f) => f.tAceptacion)),
      llegada: estadisticas(validas.map((f) => f.tLlegada)),
      atencion: estadisticas(validas.map((f) => f.tAtencion)),
    },
    unidades: { aceptaciones: stats.aceptadas, rechazos: stats.rechazos, sinRespuesta: stats.silencios },
    errores: stats.errores,
    duracionRealSegundos: Math.round(seg()),
  };

  const carpeta = join(AQUI, 'resultados');
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre}.json`), JSON.stringify({ resumen, alertas: filas }, null, 2));
  const cab = 'id;tipo;estado;truncada;t_asignacion_s;t_aceptacion_s;t_llegada_s;t_atencion_s;reasignaciones;escalada;manual';
  const num = (x) => (x === null ? '' : x.toFixed(1).replace('.', ','));
  writeFileSync(join(carpeta, `${nombre}.csv`), '﻿' + [cab, ...filas.map((f) => [f.id, f.tipo, f.estado, f.truncada, num(f.tAsignacion), num(f.tAceptacion), num(f.tLlegada), num(f.tAtencion), f.reasignaciones, f.escalada, f.manual].join(';'))].join('\r\n') + '\r\n');

  // restaurar el sistema como estaba
  await api('PUT', '/admin/parametros/asignacion_automatica', admin, { valor: modoOriginal });
  for (const id of restaurar.unidadesDesactivadas) await api('PATCH', `/admin/unidades/${id}/activo`, admin, { activo: true });
  for (const a of agentes) await api('POST', '/sereno/estado', a.token, { estado: 'FUERA_DE_SERVICIO' });

  // ---- informe en pantalla
  const t = resumen.tiempos;
  const linea = (n, e) => `  ${n.padEnd(11)} n=${String(e.n).padStart(3)}  media ${f1(e.media).padStart(6)}  mediana ${f1(e.mediana).padStart(6)}  p90 ${f1(e.p90).padStart(6)}  máx ${f1(e.max).padStart(6)}`;
  console.log(`\n=== Resultado: ${nombre} (${o.modo}) ===`);
  console.log(`Plan: ${plan.length} alertas planificadas (huella ${huellaPlan}: misma huella = mismo escenario)`);
  console.log(`Alertas: ${resumen.alertas.creadas} creadas · ${resumen.alertas.finalizadas} atendidas · ${resumen.alertas.canceladas} canceladas · ${resumen.reasignadas} reasignadas · ${resumen.escaladas} escaladas a la central`);
  console.log('Tiempos en segundos (solo alertas atendidas):');
  console.log(linea('asignación', t.asignacion));
  console.log(linea('aceptación', t.aceptacion));
  console.log(linea('llegada', t.llegada));
  console.log(linea('atención', t.atencion));
  console.log(`Serenos: ${resumen.unidades.aceptaciones} aceptaciones · ${resumen.unidades.rechazos} rechazos · ${resumen.unidades.sinRespuesta} sin respuesta`);
  if (resumen.errores) console.log(`Errores de comunicación: ${resumen.errores}`);
  console.log(`Archivos: simulador/resultados/${nombre}.json y .csv\n`);
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
