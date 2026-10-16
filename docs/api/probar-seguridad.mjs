/*
 * Prueba de integración de seguridad y evidencias: bloqueo de login, cambio de clave, auditoría y subida/descarga
 * de evidencias con control de acceso. Requiere el backend corriendo y el sereno del simulador (91000001 / SIM-01).
 *
 *   node probar-seguridad.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claveDePrueba } from './clave-prueba.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PW = claveDePrueba();
const B = 'http://localhost:8080/api';
let fallos = 0;
const check = (n, c, x = '') => { if (!c) fallos++; console.log((c ? '  OK   ' : '  FALLA') + ' ' + n + (x ? '  -> ' + x : '')); };

async function http(metodo, ruta, token, cuerpo) {
  const esForm = cuerpo instanceof FormData;
  const r = await fetch(B + ruta, {
    method: metodo,
    headers: { ...(esForm || !cuerpo ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? (esForm ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
  const tipo = r.headers.get('content-type') ?? '';
  let d = null;
  if (tipo.includes('json')) { try { d = await r.json(); } catch {} } else { d = Buffer.from(await r.arrayBuffer()); }
  return { s: r.status, d, tipo };
}
const login = async (u, p = PW) => (await http('POST', '/auth/login', null, { usuario: u, password: p }));
const form = (campos, archivo) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  if (archivo) f.append('archivo', new Blob([archivo.bytes], { type: archivo.mime }), archivo.nombre);
  return f;
};

// Archivos mínimos pero con la cabecera real de cada formato
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(64, 3)]);
const TEXTO = Buffer.from('<script>alert(1)</script>');

const admin = (await login('00000001')).d.token;
const operador = (await login('00000003')).d.token;
const sereno = (await login('91000001')).d?.token;
check('login admin, operador y sereno del simulador', !!admin && !!operador && !!sereno);

console.log('\n=== Bloqueo de login ===');
const dni = String(95000000 + Math.floor(Math.random() * 999999));
let r = await http('POST', '/auth/registro', null, { dni, nombres: 'Seguridad', apellidos: 'Prueba', telefono: '987654321', password: PW });
check('registro de usuario de prueba', r.s === 201, r.s);
let tc = r.d.token;
for (let i = 1; i <= 4; i++) r = await login(dni, 'incorrecta' + i);
check('4 fallos: sigue siendo 401', r.s === 401, r.s);
r = await login(dni, 'incorrecta5');
check('el 5.º fallo responde 401 y bloquea', r.s === 401, r.s);
r = await login(dni);
check('con la clave correcta pero bloqueado → 429 DEMASIADOS_INTENTOS', r.s === 429 && r.d?.codigo === 'DEMASIADOS_INTENTOS', r.s + ' ' + r.d?.mensaje);
check('el mensaje dice cuánto esperar', /minuto/.test(r.d?.mensaje ?? ''));
r = await login('00000003');
check('otro usuario no se ve afectado', r.s === 200);

console.log('\n=== Cambio de contraseña ===');
const dni2 = String(95000000 + Math.floor(Math.random() * 999999));
r = await http('POST', '/auth/registro', null, { dni: dni2, nombres: 'Clave', apellidos: 'Prueba', telefono: '987654321', password: PW });
const t2 = r.d.token;
check('sin token no se puede (401)', (await http('POST', '/auth/clave', null, { actual: PW, nueva: 'NuevaClave#1' })).s === 401);
r = await http('POST', '/auth/clave', t2, { actual: 'no-es-la-clave', nueva: 'NuevaClave#1' });
check('clave actual incorrecta (422)', r.s === 422 && r.d?.codigo === 'CLAVE_ACTUAL_INCORRECTA', r.s + ' ' + r.d?.codigo);
r = await http('POST', '/auth/clave', t2, { actual: PW, nueva: PW });
check('clave repetida (422)', r.s === 422 && r.d?.codigo === 'CLAVE_REPETIDA', r.s + ' ' + r.d?.codigo);
r = await http('POST', '/auth/clave', t2, { actual: PW, nueva: 'corta' });
check('clave nueva demasiado corta (400)', r.s === 400, r.s);
r = await http('POST', '/auth/clave', t2, { actual: PW, nueva: 'NuevaClave#1' });
check('cambio correcto (204)', r.s === 204, r.s);
check('la clave vieja ya no entra', (await login(dni2, PW)).s === 401);
check('la clave nueva entra', (await login(dni2, 'NuevaClave#1')).s === 200);

console.log('\n=== Evidencias ===');
// El sereno del simulador necesita una alerta asignada y aceptada: el ciudadano la crea y el sereno la acepta.
const LAT = -6.7714, LON = -79.8409;
let est = (await http('GET', '/sereno/estado', sereno)).d;
if (est?.asignacion?.estado === 'PENDIENTE_RESPUESTA') {
  await http('POST', `/sereno/asignaciones/${est.asignacion.id}/rechazar`, sereno, { motivo: 'OTRO' });
}
await http('POST', '/sereno/posicion', sereno, { latitud: est?.latitud ?? LAT, longitud: est?.longitud ?? LON, velocidadKmh: 0 });
r = await http('POST', '/sereno/estado', sereno, { estado: 'DISPONIBLE' });
check('la unidad del sereno queda DISPONIBLE', r.s === 200 && r.d?.estado === 'DISPONIBLE', r.s + ' ' + r.d?.codigo + ' ' + r.d?.estado);
est = (await http('GET', '/sereno/estado', sereno)).d;
const lat = est?.latitud ?? LAT, lon = est?.longitud ?? LON;
const ciu = (await http('POST', '/auth/registro', null, { dni: String(96000000 + Math.floor(Math.random() * 999999)), nombres: 'Evid', apellidos: 'Prueba', telefono: '987654321', password: PW })).d.token;
const otro = (await http('POST', '/auth/registro', null, { dni: String(97000000 + Math.floor(Math.random() * 999999)), nombres: 'Otro', apellidos: 'Vecino', telefono: '987654321', password: PW })).d.token;
const alerta = await http('POST', '/ciudadano/alertas', ciu, { tipo: 'SOSPECHOSA', latitud: lat, longitud: lon, descripcion: 'prueba de evidencias' });
check('alerta creada', alerta.s === 201, alerta.s + ' ' + alerta.d?.codigo);
const alertaId = alerta.d?.id;
const asig = (await http('GET', '/sereno/estado', sereno)).d?.asignacion;
check('el motor asignó la alerta al sereno', asig?.alertaId === alertaId, JSON.stringify(asig)?.slice(0, 80));

// Antes de que el sereno acepte no puede adjuntar
r = await http('POST', `/sereno/alertas/${alertaId}/evidencias`, sereno, form({ observacion: 'todavía no' }));
check('sereno sin aceptar no puede adjuntar (404)', r.s === 404, r.s);
r = await http('POST', `/sereno/asignaciones/${asig.id}/aceptar`, sereno);
check('sereno acepta', r.s === 200, r.s);

r = await http('POST', `/ciudadano/alertas/${alertaId}/evidencias`, ciu, form({ observacion: 'Se ve a dos personas' }, { bytes: JPG, mime: 'image/jpeg', nombre: 'foto.jpg' }));
check('ciudadano sube una foto JPG (201)', r.s === 201 && r.d?.tipo === 'FOTO' && r.d?.conArchivo === true && r.d?.origen === 'CIUDADANO', r.s + ' ' + JSON.stringify(r.d)?.slice(0, 100));
const fotoId = r.d?.id;
r = await http('POST', `/ciudadano/alertas/${alertaId}/evidencias`, ciu, form({}, { bytes: PNG, mime: 'image/png', nombre: 'otra.png' }));
check('ciudadano sube una foto PNG (201)', r.s === 201 && r.d?.tipo === 'FOTO', r.s);
r = await http('POST', `/ciudadano/alertas/${alertaId}/evidencias`, ciu, form({ observacion: 'Solo una nota' }));
check('ciudadano sube solo una nota (201)', r.s === 201 && r.d?.tipo === 'NOTA' && r.d?.conArchivo === false, r.s);
const notaId = r.d?.id;
r = await http('POST', `/ciudadano/alertas/${alertaId}/evidencias`, ciu, form({}));
check('sin archivo ni nota (422 EVIDENCIA_VACIA)', r.s === 422 && r.d?.codigo === 'EVIDENCIA_VACIA', r.s + ' ' + r.d?.codigo);
r = await http('POST', `/ciudadano/alertas/${alertaId}/evidencias`, ciu, form({}, { bytes: TEXTO, mime: 'image/jpeg', nombre: 'virus.jpg' }));
check('texto disfrazado de .jpg (422 ARCHIVO_NO_PERMITIDO)', r.s === 422 && r.d?.codigo === 'ARCHIVO_NO_PERMITIDO', r.s + ' ' + r.d?.codigo);
r = await http('POST', `/ciudadano/alertas/${alertaId}/evidencias`, ciu, form({ observacion: 'x'.repeat(501) }));
check('nota de más de 500 caracteres (422)', r.s === 422 && r.d?.codigo === 'NOTA_MUY_LARGA', r.s + ' ' + r.d?.codigo);
r = await http('POST', `/ciudadano/alertas/${alertaId}/evidencias`, ciu, form({}, { bytes: Buffer.concat([JPG, Buffer.alloc(9 * 1024 * 1024)]), mime: 'image/jpeg', nombre: 'grande.jpg' }));
check('foto de más de 8 MB (422 ARCHIVO_MUY_GRANDE)', r.s === 422 && r.d?.codigo === 'ARCHIVO_MUY_GRANDE', r.s + ' ' + r.d?.codigo);
r = await http('POST', `/ciudadano/alertas/${alertaId}/evidencias`, otro, form({ observacion: 'intruso' }));
check('otro ciudadano no puede adjuntar (404)', r.s === 404, r.s);
r = await http('POST', `/ciudadano/alertas/${alertaId}/evidencias`, sereno, form({ observacion: 'x' }));
check('el sereno no usa la ruta del ciudadano (403)', r.s === 403, r.s);

r = await http('POST', `/sereno/alertas/${alertaId}/evidencias`, sereno, form({ observacion: 'Llegué y verifiqué' }, { bytes: MP4, mime: 'video/mp4', nombre: 'v.mp4' }));
check('sereno sube un video MP4 (201)', r.s === 201 && r.d?.tipo === 'VIDEO' && r.d?.origen === 'SERENO', r.s + ' ' + JSON.stringify(r.d)?.slice(0, 100));
const videoId = r.d?.id;

console.log('\n=== Ver y descargar ===');
r = await http('GET', `/monitoreo/alertas/${alertaId}/evidencias`, operador);
check('la central lista las 4 evidencias', r.s === 200 && r.d.length === 4, r.s + ' n=' + r.d?.length);
check('autor y origen visibles', r.d?.every((e) => e.autor && e.origen));
check('el ciudadano lista las suyas', (await http('GET', `/ciudadano/alertas/${alertaId}/evidencias`, ciu)).d?.length === 4);
check('otro ciudadano no ve la lista (404)', (await http('GET', `/ciudadano/alertas/${alertaId}/evidencias`, otro)).s === 404);

r = await http('GET', `/evidencias/${fotoId}/archivo`, operador);
check('la central descarga la foto con su tipo correcto', r.s === 200 && r.tipo.startsWith('image/jpeg') && r.d.equals(JPG), r.s + ' ' + r.tipo);
r = await http('GET', `/evidencias/${videoId}/archivo`, ciu);
check('el ciudadano dueño descarga el video', r.s === 200 && r.tipo.startsWith('video/mp4') && r.d.equals(MP4), r.s + ' ' + r.tipo);
r = await http('GET', `/evidencias/${fotoId}/archivo`, sereno);
check('el sereno que atendió descarga la foto', r.s === 200, r.s);
check('otro ciudadano NO descarga (404)', (await http('GET', `/evidencias/${fotoId}/archivo`, otro)).s === 404);
check('sin token NO descarga (401)', (await http('GET', `/evidencias/${fotoId}/archivo`)).s === 401);
check('una nota no tiene archivo (404)', (await http('GET', `/evidencias/${notaId}/archivo`, operador)).s === 404);
check('evidencia inexistente (404)', (await http('GET', '/evidencias/99999999/archivo', operador)).s === 404);

console.log('\n=== Auditoría ===');
check('el operador no ve la auditoría (403)', (await http('GET', '/admin/auditoria', operador)).s === 403);
r = await http('GET', '/admin/auditoria?tamano=100', admin);
check('el admin la lista', r.s === 200 && r.d.items.length > 0 && typeof r.d.total === 'number', r.s);
const acciones = new Set(r.d.items.map((x) => x.accion));
for (const a of ['LOGIN', 'LOGIN_FALLIDO', 'LOGIN_BLOQUEADO', 'CLAVE_CAMBIADA', 'EVIDENCIA_AGREGADA']) {
  check(`quedó registrada la acción ${a}`, acciones.has(a));
}
check('no se guardan contraseñas en el detalle', !r.d.items.some((x) => (x.detalle ?? '').includes(PW) || (x.detalle ?? '').includes('incorrecta')));
r = await http('GET', '/admin/auditoria?accion=LOGIN_BLOQUEADO&tamano=5', admin);
check('filtro por acción', r.s === 200 && r.d.items.length > 0 && r.d.items.every((x) => x.accion === 'LOGIN_BLOQUEADO'));
r = await http('GET', `/admin/auditoria?q=${dni}`, admin);
check('buscar por DNI en el detalle', r.s === 200 && r.d.items.length >= 1, 'n=' + r.d?.items?.length);
check('paginación inválida (422)', (await http('GET', '/admin/auditoria?tamano=500', admin)).s === 422);
check('lista de acciones para el filtro', (await http('GET', '/admin/auditoria/acciones', admin)).d?.includes('LOGIN'));

// asignación manual / cancelación quedan auditadas
r = await http('POST', `/monitoreo/alertas/${alertaId}/cancelar`, operador, { motivo: 'FALSA_ALARMA', observacion: null });
check('la central cancela la alerta de prueba', r.s === 200, r.s);
r = await http('GET', '/admin/auditoria?accion=ALERTA_CANCELADA&tamano=5', admin);
check('la cancelación de la central quedó auditada con su autor', r.d?.items?.some((x) => x.entidadId === alertaId && x.usuario), JSON.stringify(r.d?.items?.[0])?.slice(0, 120));
r = await http('POST', `/ciudadano/alertas/${alertaId}/evidencias`, ciu, form({ observacion: 'tarde' }));
check('con la alerta terminada ya no se adjunta (409)', r.s === 409, r.s);

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTODO OK');
process.exit(fallos ? 1 : 0);
