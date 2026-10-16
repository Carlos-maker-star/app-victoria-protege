/*
 * Prueba de contrato: ejecuta el flujo real de las dos apps contra el backend en marcha y valida CADA respuesta
 * contra el esquema que publica el OpenAPI. Si la API cambia sin actualizar el contrato (o al revés), falla.
 *
 *   cd docs/api && npm install && npm run contrato
 *
 * Requisitos: backend corriendo y el simulador ejecutado al menos una vez (usa el sereno 91000001 / unidad SIM-01).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claveDePrueba } from './clave-prueba.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const PW = claveDePrueba();
const B = 'http://localhost:8080';
const doc = await (await fetch(B + '/v3/api-docs/movil')).json();

/** Los $ref del contrato son locales (#/components/…); se apuntan al documento registrado como 'oas'. */
const reescribir = (x) => Array.isArray(x) ? x.map(reescribir) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === '$ref' ? 'oas' + v : reescribir(v)])) : x;
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'oas', components: doc.components, ...{} });

let fallos = 0, validadas = 0;
const cubiertas = new Set();
const check = (n, c, x = '') => { if (!c) fallos++; console.log((c ? '  OK   ' : '  FALLA') + ' ' + n + (x ? '  -> ' + x : '')); };

/** Hace la llamada y valida el cuerpo contra el esquema que el contrato declara para ese estado HTTP. */
async function llamar(metodo, ruta, plantilla, token, cuerpo, etiqueta) {
  const r = await fetch(B + '/api' + ruta, {
    method: metodo,
    headers: { ...(cuerpo instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? (cuerpo instanceof FormData ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
  let datos = null; if ((r.headers.get('content-type') ?? '').includes('json')) { try { datos = await r.json(); } catch {} }
  const op = doc.paths['/api' + plantilla]?.[metodo.toLowerCase()];
  if (!op) { check(`${etiqueta}: la operación ${metodo} ${plantilla} existe en el contrato`, false); return { s: r.status, d: datos }; }
  cubiertas.add(metodo + ' ' + plantilla);
  const declarada = op.responses[String(r.status)];
  if (!declarada) { check(`${etiqueta}: HTTP ${r.status} está documentado`, false, 'documentados: ' + Object.keys(op.responses).join(',')); return { s: r.status, d: datos }; }
  const contenido = declarada.content ? Object.values(declarada.content)[0] : null;
  const esquema = contenido?.schema;
  if (esquema && datos !== null) {
    const validar = ajv.compile(reescribir(esquema)); validadas++;
    const ok = validar(datos);
    check(`${etiqueta}: ${metodo} ${plantilla} → ${r.status} cumple el esquema`, ok, ok ? '' : JSON.stringify(validar.errors.slice(0, 3)));
  } else {
    check(`${etiqueta}: ${metodo} ${plantilla} → ${r.status}`, true, '(sin cuerpo que validar)');
  }
  return { s: r.status, d: datos };
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(32, 3)]);
const form = (campos, bytes, mime, nombre) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  if (bytes) f.append('archivo', new Blob([bytes], { type: mime }), nombre);
  return f;
};

const dni = String(93000000 + Math.floor(Math.random() * 999999));
console.log('=== App del ciudadano ===');
let r = await llamar('POST', '/auth/registro', '/auth/registro', null, { dni, nombres: 'Contrato', apellidos: 'Prueba', telefono: '987654321', password: PW }, 'registro');
const tc = r.d.token;
r = await llamar('POST', '/auth/registro', '/auth/registro', null, { dni, nombres: 'Contrato', apellidos: 'Prueba', password: PW }, 'registro repetido');
r = await llamar('POST', '/auth/registro', '/auth/registro', null, { dni: '1', nombres: '', apellidos: '', password: 'x' }, 'registro inválido');
check('el 400 trae campos', r.s === 400 && r.d.campos && Object.keys(r.d.campos).length >= 3);
r = await llamar('POST', '/auth/login', '/auth/login', null, { usuario: dni, password: PW }, 'login');
r = await llamar('POST', '/auth/login', '/auth/login', null, { usuario: dni, password: 'mala' }, 'login erróneo');
r = await llamar('GET', '/auth/me', '/auth/me', tc, null, 'me');
r = await llamar('GET', '/auth/me', '/auth/me', null, null, 'me sin token');

r = await llamar('POST', '/ciudadano/alertas', '/ciudadano/alertas', tc, { tipo: 'ROBO', latitud: -12.05, longitud: -77.03 }, 'alerta fuera del distrito');
check('FUERA_DE_COBERTURA', r.s === 422 && r.d.codigo === 'FUERA_DE_COBERTURA');
r = await llamar('POST', '/ciudadano/alertas', '/ciudadano/alertas', tc, { tipo: 'ROBO', descripcion: 'Contrato', latitud: -6.8262, longitud: -79.86934, latitudCiudadano: -6.8263, longitudCiudadano: -79.8694, referencia: 'Frente a la losa' }, 'alerta');
const alertaId = r.d.id;
r = await llamar('POST', '/ciudadano/alertas', '/ciudadano/alertas', tc, { tipo: 'ROBO', latitud: -6.8262, longitud: -79.86934 }, 'segunda alerta');
check('ALERTA_ACTIVA_EXISTENTE', r.s === 409 && r.d.codigo === 'ALERTA_ACTIVA_EXISTENTE');
r = await llamar('GET', `/ciudadano/alertas/${alertaId}/seguimiento`, '/ciudadano/alertas/{id}/seguimiento', tc, null, 'seguimiento');
r = await llamar('GET', `/ciudadano/alertas/${alertaId}`, '/ciudadano/alertas/{id}', tc, null, 'detalle');
r = await llamar('GET', '/ciudadano/alertas', '/ciudadano/alertas', tc, null, 'historial');
r = await llamar('GET', '/ciudadano/alertas/999999', '/ciudadano/alertas/{id}', tc, null, 'detalle inexistente');

console.log('\n=== Evidencias y clave (ciudadano) ===');
r = await llamar('POST', `/ciudadano/alertas/${alertaId}/evidencias`, '/ciudadano/alertas/{id}/evidencias', tc, form({ observacion: 'Contrato' }, PNG, 'image/png', 'f.png'), 'subir foto');
check('foto reconocida', r.s === 201 && r.d.tipo === 'FOTO' && r.d.conArchivo === true);
const evidenciaId = r.d.id;
r = await llamar('POST', `/ciudadano/alertas/${alertaId}/evidencias`, '/ciudadano/alertas/{id}/evidencias', tc, form({}), 'evidencia vacía');
check('EVIDENCIA_VACIA', r.s === 422 && r.d.codigo === 'EVIDENCIA_VACIA');
r = await llamar('POST', '/ciudadano/alertas/999999/evidencias', '/ciudadano/alertas/{id}/evidencias', tc, form({ observacion: 'x' }), 'evidencia en alerta ajena');
check('404', r.s === 404);
r = await llamar('GET', `/ciudadano/alertas/${alertaId}/evidencias`, '/ciudadano/alertas/{id}/evidencias', tc, null, 'listar evidencias');
check('lista la foto', r.d.length === 1);
r = await llamar('GET', `/evidencias/${evidenciaId}/archivo`, '/evidencias/{id}/archivo', tc, null, 'descargar foto');
check('devuelve el archivo', r.s === 200);
r = await llamar('POST', '/auth/clave', '/auth/clave', tc, { actual: 'no-es', nueva: 'OtraClave#2026' }, 'cambiar clave con la actual mal');
check('CLAVE_ACTUAL_INCORRECTA', r.s === 422 && r.d.codigo === 'CLAVE_ACTUAL_INCORRECTA');
r = await llamar('POST', '/auth/clave', '/auth/clave', tc, { actual: PW, nueva: 'OtraClave#2026' }, 'cambiar clave');
check('clave cambiada', r.s === 204);

console.log('\n=== App del sereno (SIM-01) ===');
const login = async (u) => (await (await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: u, password: PW }) })).json()).token;
const admin = await login('00000001'), central = await login('00000003');
// Deja a SIM-01 libre y cerca; si el motor ya le asignó la alerta, perfecto
const ts = await login('91000001');
if (!ts) { console.log('  (falta el sereno de simulación 91000001: ejecuta antes el simulador)'); process.exit(1); }
const sg = async (m, p, b) => (await fetch(B + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + central }, body: b ? JSON.stringify(b) : undefined })).json();
// Aislar: solo SIM-01 disponible
for (const u of (await (await fetch(B + '/api/admin/unidades', { headers: { Authorization: 'Bearer ' + admin } })).json()).filter((x) => x.activo && x.codigo !== 'SIM-01'))
  await fetch(B + `/api/admin/unidades/${u.id}/activo`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin }, body: JSON.stringify({ activo: false }) });
const otras = (await (await fetch(B + '/api/admin/unidades', { headers: { Authorization: 'Bearer ' + admin } })).json()).filter((x) => !x.activo).map((x) => x.id);

r = await llamar('POST', '/sereno/estado', '/sereno/estado', ts, { estado: 'LOQUESEA' }, 'estado inválido');
check('ESTADO_INVALIDO', r.s === 422 && r.d.codigo === 'ESTADO_INVALIDO');
r = await llamar('POST', '/sereno/posicion', '/sereno/posicion', ts, { latitud: -6.8272, longitud: -79.86934, velocidadKmh: 0 }, 'posición');
r = await llamar('POST', '/sereno/estado', '/sereno/estado', ts, { estado: 'DISPONIBLE' }, 'estado DISPONIBLE');
r = await llamar('GET', '/sereno/estado', '/sereno/estado', ts, null, 'estado');
let tries = 0;
while (!r.d.asignacion && tries++ < 12) { await new Promise((x) => setTimeout(x, 1000)); r = await llamar('POST', '/sereno/posicion', '/sereno/posicion', ts, { latitud: -6.8272, longitud: -79.86934 }, 'posición (esperando asignación)'); }
check('el sereno recibió la asignación', !!r.d.asignacion);
const asig = r.d.asignacion;
r = await llamar('POST', `/sereno/asignaciones/${asig.id}/rechazar`, '/sereno/asignaciones/{id}/rechazar', ts, { motivo: 'OTRO' }, 'rechazo sin detalle');
check('DETALLE_REQUERIDO', r.s === 422 && r.d.codigo === 'DETALLE_REQUERIDO');
r = await llamar('POST', `/sereno/alertas/${alertaId}/evidencias`, '/sereno/alertas/{id}/evidencias', ts, form({ observacion: 'antes de aceptar' }), 'sereno adjunta sin haber aceptado');
check('404 hasta aceptar', r.s === 404);
r = await llamar('POST', `/sereno/asignaciones/${asig.id}/aceptar`, '/sereno/asignaciones/{id}/aceptar', ts, null, 'aceptar');
check('quedó en camino', r.d.asignacion?.alertaEstado === 'EN_CAMINO' && r.d.estado === 'EN_DESPLAZAMIENTO');
r = await llamar('POST', `/sereno/asignaciones/${asig.id}/aceptar`, '/sereno/asignaciones/{id}/aceptar', ts, null, 'aceptar dos veces');
check('ASIGNACION_NO_VIGENTE', r.s === 409 && r.d.codigo === 'ASIGNACION_NO_VIGENTE');
r = await llamar('POST', `/sereno/alertas/${alertaId}/evidencias`, '/sereno/alertas/{id}/evidencias', ts, form({ observacion: 'Contrato' }, MP4, 'video/mp4', 'v.mp4'), 'sereno sube un video');
check('video reconocido', r.s === 201 && r.d.tipo === 'VIDEO' && r.d.origen === 'SERENO');
r = await llamar('GET', `/ciudadano/alertas/${alertaId}/seguimiento`, '/ciudadano/alertas/{id}/seguimiento', tc, null, 'seguimiento con unidad en camino');
check('el ciudadano ve UNIDAD_EN_CAMINO con unidad y ETA', r.d.estado === 'UNIDAD_EN_CAMINO' && r.d.unidadCodigo === 'SIM-01' && r.d.etaSegundos > 0);
r = await llamar('POST', '/sereno/posicion', '/sereno/posicion', ts, { latitud: -6.82621, longitud: -79.86934, velocidadKmh: 4 }, 'llega (GPS)');
check('llegada detectada por GPS', r.d.asignacion?.alertaEstado === 'LLEGO');
r = await llamar('POST', `/sereno/asignaciones/${asig.id}/iniciar-atencion`, '/sereno/asignaciones/{id}/iniciar-atencion', ts, null, 'iniciar atención');
r = await llamar('POST', `/sereno/asignaciones/${asig.id}/finalizar`, '/sereno/asignaciones/{id}/finalizar', ts, { resultado: 'XXX' }, 'finalizar con resultado inválido');
check('RESULTADO_INVALIDO', r.s === 422 && r.d.codigo === 'RESULTADO_INVALIDO');
r = await llamar('POST', `/sereno/asignaciones/${asig.id}/finalizar`, '/sereno/asignaciones/{id}/finalizar', ts, { resultado: 'ATENDIDA', observacion: 'Contrato' }, 'finalizar');
check('asignación terminada', r.d.asignacion === null);
r = await llamar('POST', '/sereno/estado', '/sereno/estado', ts, { estado: 'DISPONIBLE' }, 'continuar operando');
r = await llamar('GET', `/ciudadano/alertas/${alertaId}/seguimiento`, '/ciudadano/alertas/{id}/seguimiento', tc, null, 'seguimiento final');
check('ALERTA_ATENDIDA', r.d.estado === 'ALERTA_ATENDIDA');

// llegada manual y cancelación con otra alerta
r = await llamar('POST', '/ciudadano/alertas', '/ciudadano/alertas', tc, { tipo: 'ACCIDENTE', latitud: -6.8262, longitud: -79.86934 }, 'otra alerta');
const a2 = r.d.id; await new Promise((x) => setTimeout(x, 800));
r = await llamar('POST', '/sereno/posicion', '/sereno/posicion', ts, { latitud: -6.8272, longitud: -79.86934 }, 'posición');
const as2 = r.d.asignacion;
if (as2) {
  await llamar('POST', `/sereno/asignaciones/${as2.id}/aceptar`, '/sereno/asignaciones/{id}/aceptar', ts, null, 'aceptar 2');
  r = await llamar('POST', `/sereno/asignaciones/${as2.id}/llegada`, '/sereno/asignaciones/{id}/llegada', ts, null, 'llegada manual');
  check('llegada manual', r.d.asignacion?.alertaEstado === 'LLEGO');
}
r = await llamar('POST', `/ciudadano/alertas/${a2}/cancelar`, '/ciudadano/alertas/{id}/cancelar', tc, null, 'cancelar con la unidad ya en el lugar');
check('CONFLICTO (ya llegó)', r.s === 409);
await fetch(B + `/api/monitoreo/alertas/${a2}/cancelar`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + central }, body: JSON.stringify({ motivo: 'DUPLICADA' }) });
r = await llamar('POST', '/ciudadano/alertas', '/ciudadano/alertas', tc, { tipo: 'OTRO', latitud: -6.8262, longitud: -79.86934 }, 'alerta para cancelar');
const a3 = r.d.id;
r = await llamar('POST', `/ciudadano/alertas/${a3}/cancelar`, '/ciudadano/alertas/{id}/cancelar', tc, null, 'cancelar');
check('cancelada', r.d.estado === 'CANCELADA');

// permisos entre apps
r = await llamar('GET', '/sereno/estado', '/sereno/estado', tc, null, 'el ciudadano no usa la API del sereno');
check('403', r.s === 403);
r = await llamar('POST', '/ciudadano/alertas', '/ciudadano/alertas', ts, { tipo: 'ROBO', latitud: -6.8262, longitud: -79.86934 }, 'el sereno no reporta alertas');
check('403', r.s === 403);

// restaurar
await llamar('POST', '/sereno/estado', '/sereno/estado', ts, { estado: 'FUERA_DE_SERVICIO' }, 'fin de sesión');
for (const id of otras) await fetch(B + `/api/admin/unidades/${id}/activo`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin }, body: JSON.stringify({ activo: true }) });

console.log('\n=== Cobertura del contrato ===');
const todas = []; for (const [ruta, item] of Object.entries(doc.paths)) for (const m of Object.keys(item)) todas.push(m.toUpperCase() + ' ' + ruta.replace('/api', ''));
const faltan = todas.filter((o) => !cubiertas.has(o));
check(`se ejercitaron las ${todas.length} operaciones del contrato móvil`, faltan.length === 0, faltan.join(', '));
console.log(`\nResultado: ${fallos === 0 ? 'TODO OK' : fallos + ' fallo(s)'}  (${validadas} respuestas validadas contra el esquema)`);
process.exit(fallos ? 1 : 0);
