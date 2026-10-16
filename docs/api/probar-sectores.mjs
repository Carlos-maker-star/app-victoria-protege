/*
 * Prueba de integración de zonas y sectores (/api/admin/zonas). Requiere el backend corriendo.
 * Deja la base como estaba: al final desactiva los sectores que creó y borra nada (los desactiva).
 *
 *   node probar-sectores.mjs
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
  const r = await fetch(B + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let d = null; try { d = await r.json(); } catch {}
  return { s: r.status, d };
}
const login = async (dni) => (await http('POST', '/auth/login', null, { usuario: dni, password: PW })).d?.token;

const cuadrado = (lat, lon, m) => {
  const dLat = m / 111320, dLon = m / (111320 * Math.cos(lat * Math.PI / 180));
  const a = [lon - dLon, lat - dLat], b = [lon + dLon, lat - dLat], c = [lon + dLon, lat + dLat], d = [lon - dLon, lat + dLat];
  return JSON.stringify({ type: 'Polygon', coordinates: [[a, b, c, d, a]] });
};

const admin = await login('00000001');
const operador = await login('00000003');
check('login admin y operador', !!admin && !!operador);

console.log('\n=== Permisos ===');
check('operador no puede listar zonas (403)', (await http('GET', '/admin/zonas', operador)).s === 403);
check('sin token (401)', (await http('GET', '/admin/zonas')).s === 401);

console.log('\n=== Estado inicial ===');
let r = await http('GET', '/admin/zonas', admin);
check('listar zonas (200)', r.s === 200 && Array.isArray(r.d));
check('el distrito va primero', r.d[0]?.tipo === 'DISTRITO', r.d[0]?.nombre);
// limpiar sectores de corridas anteriores
for (const z of r.d.filter((z) => z.tipo === 'SECTOR' && z.activo)) await http('PATCH', `/admin/zonas/${z.id}/activo`, admin, { activo: false });

const unidades = (await http('GET', '/monitoreo/unidades', operador)).d;
const ref = unidades.find((u) => u.latitud != null);
check('hay una unidad con posición para tomar un punto del distrito', !!ref);
const { latitud: lat, longitud: lon } = ref;

console.log('\n=== Crear sectores ===');
r = await http('POST', '/admin/zonas', admin, { nombre: 'Prueba A', geojson: cuadrado(lat, lon, 150) });
check('sector válido (201)', r.s === 201, r.s + ' ' + JSON.stringify(r.d)?.slice(0, 120));
const idA = r.d?.id;
check('devuelve área y tipo SECTOR', r.d?.tipo === 'SECTOR' && r.d?.areaKm2 > 0, 'areaKm2=' + r.d?.areaKm2);

r = await http('POST', '/admin/zonas', admin, { nombre: 'Prueba A', geojson: cuadrado(lat + 0.01, lon, 100) });
check('nombre repetido rechazado (409)', r.s === 409, r.s + ' ' + r.d?.codigo);

r = await http('POST', '/admin/zonas', admin, { nombre: 'Prueba B', geojson: cuadrado(lat, lon, 100) });
check('superposición rechazada (409)', r.s === 409, r.s + ' ' + r.d?.codigo);

r = await http('POST', '/admin/zonas', admin, { nombre: 'Lejos', geojson: cuadrado(-6.0, -79.0, 100) });
check('fuera del distrito (422 FUERA_DEL_DISTRITO)', r.s === 422 && r.d?.codigo === 'FUERA_DEL_DISTRITO', r.s + ' ' + r.d?.codigo);

const corbata = JSON.stringify({ type: 'Polygon', coordinates: [[[lon, lat], [lon + 0.001, lat + 0.001], [lon + 0.001, lat], [lon, lat + 0.001], [lon, lat]]] });
r = await http('POST', '/admin/zonas', admin, { nombre: 'Corbata', geojson: corbata });
check('polígono autointersecado (422 GEOMETRIA_INVALIDA)', r.s === 422 && r.d?.codigo === 'GEOMETRIA_INVALIDA', r.s + ' ' + r.d?.codigo);

r = await http('POST', '/admin/zonas', admin, { nombre: 'Basura', geojson: 'no es json' });
check('GeoJSON ilegible rechazado (4xx)', r.s >= 400 && r.s < 500, r.s + ' ' + r.d?.codigo);

r = await http('POST', '/admin/zonas', admin, { nombre: '', geojson: cuadrado(lat, lon, 50) });
check('nombre vacío (400)', r.s === 400, r.s);

console.log('\n=== Renombrar y activar ===');
r = await http('PUT', `/admin/zonas/${idA}`, admin, { nombre: 'Prueba A2' });
check('renombrar (200)', r.s === 200 && r.d?.nombre === 'Prueba A2', r.s);
const distrito = (await http('GET', '/admin/zonas', admin)).d[0];
r = await http('PUT', `/admin/zonas/${distrito.id}`, admin, { nombre: 'X' });
check('el distrito no se modifica (409)', r.s === 409, r.s + ' ' + r.d?.codigo);
r = await http('PATCH', `/admin/zonas/${idA}/activo`, admin, { activo: false });
check('desactivar (200)', r.s === 200 && r.d?.activo === false, r.s);
r = await http('PATCH', `/admin/zonas/${idA}/activo`, admin, { activo: true });
check('reactivar (200)', r.s === 200 && r.d?.activo === true, r.s);
check('zona inexistente (404)', (await http('PUT', '/admin/zonas/999999', admin, { nombre: 'Z' })).s === 404);

console.log('\n=== Alertas y unidades ===');
// una alerta creada por un ciudadano en el punto debe quedar en el sector tras recalcular
const dni = String(94000000 + Math.floor(Math.random() * 999999));
const reg = await http('POST', '/auth/registro', null, { dni, nombres: 'Sector', apellidos: 'Prueba', telefono: '987654321', password: PW });
const alerta = await http('POST', '/ciudadano/alertas', reg.d.token, { tipo: 'ROBO', latitud: lat, longitud: lon, descripcion: 'prueba de sectores' });
check('alerta creada', alerta.s === 201, alerta.s + ' ' + alerta.d?.codigo);
r = await http('POST', '/admin/zonas/recalcular', admin);
check('recalcular responde con un número', r.s === 200 && typeof r.d === 'number', JSON.stringify(r.d));
const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // hora de Lima
const rep = await http('GET', `/monitoreo/reportes?desde=${hoy}&hasta=${hoy}`, operador);
const sector = rep.d?.porZona?.find((z) => z.nombre === 'Prueba A2');
check('el reporte agrupa la alerta en el sector', !!sector && sector.total >= 1, JSON.stringify(rep.d?.porZona));
const lista = (await http('GET', '/admin/zonas', admin)).d.find((z) => z.id === idA);
check('el sector cuenta sus alertas', lista.alertas >= 1, 'alertas=' + lista.alertas);
if (alerta.d?.id) await http('POST', `/ciudadano/alertas/${alerta.d.id}/cancelar`, reg.d.token);

const adminUnidades = (await http('GET', '/admin/unidades', admin)).d;
const u = adminUnidades[0];
r = await http('PUT', `/admin/unidades/${u.id}`, admin, { placa: u.placa, tipo: u.tipo, serenoId: u.serenoId, zonaId: idA });
check('asignar sector base a una unidad (200)', r.s === 200 && r.d?.zonaId === idA, r.s + ' ' + r.d?.codigo);
r = await http('PUT', `/admin/unidades/${u.id}`, admin, { placa: u.placa, tipo: u.tipo, serenoId: u.serenoId, zonaId: distrito.id });
check('el distrito no sirve como sector base (422 ZONA_INVALIDA)', r.s === 422 && r.d?.codigo === 'ZONA_INVALIDA', r.s + ' ' + r.d?.codigo);
r = await http('PUT', `/admin/unidades/${u.id}`, admin, { placa: u.placa, tipo: u.tipo, serenoId: u.serenoId, zonaId: null });
check('quitar el sector base (200)', r.s === 200 && r.d?.zonaId == null, r.s);

console.log('\n=== Cuadrícula ===');
await http('PATCH', `/admin/zonas/${idA}/activo`, admin, { activo: false });
r = await http('POST', '/admin/zonas/cuadricula', admin, { filas: 2, columnas: 2, reemplazar: false });
check('cuadrícula 2x2 (201)', r.s === 201 && r.d.length >= 1, r.s + ' sectores=' + r.d?.length);
const nombres = r.d?.map((z) => z.nombre) ?? [];
check('nombres "Sector N"', nombres.every((n) => /^Sector \d+$/.test(n)), nombres.join(', '));
r = await http('POST', '/admin/zonas/cuadricula', admin, { filas: 2, columnas: 2, reemplazar: false });
check('sin reemplazar con sectores activos (409)', r.s === 409, r.s + ' ' + r.d?.codigo);
r = await http('POST', '/admin/zonas/cuadricula', admin, { filas: 3, columnas: 3, reemplazar: true });
check('reemplazar=true regenera (201)', r.s === 201, r.s + ' sectores=' + r.d?.length);
const total = r.d?.reduce((s, z) => s + z.areaKm2, 0);
check('la cuadrícula cubre casi todo el distrito', Math.abs(total - distrito.areaKm2) / distrito.areaKm2 < 0.02,
  `suma=${total?.toFixed(3)} km² distrito=${distrito.areaKm2.toFixed(3)} km²`);
r = await http('POST', '/admin/zonas/cuadricula', admin, { filas: 9, columnas: 1, reemplazar: true });
check('filas fuera de rango (400)', r.s === 400, r.s);

console.log('\n=== Límite del distrito ===');
const original = distrito.geojson;
try {
  // El límite no puede dejar fuera sectores activos: se desactivan los que dejó la cuadrícula
  for (const z of (await http('GET', '/admin/zonas', admin)).d.filter((z) => z.tipo === 'SECTOR' && z.activo)) {
    await http('PATCH', `/admin/zonas/${z.id}/activo`, admin, { activo: false });
  }
  r = await http('PUT', '/admin/zonas/distrito', operador, { geojson: cuadrado(lat, lon, 1500) });
  check('el operador no puede cambiar el límite (403)', r.s === 403, r.s);
  r = await http('PUT', '/admin/zonas/distrito', admin, { geojson: cuadrado(lat, lon, 100) });
  check('límite demasiado pequeño (422 AREA_INVALIDA)', r.s === 422 && r.d?.codigo === 'AREA_INVALIDA', r.s + ' ' + r.d?.codigo);
  r = await http('PUT', '/admin/zonas/distrito', admin, { geojson: corbata });
  check('límite autointersecado (422 GEOMETRIA_INVALIDA)', r.s === 422 && r.d?.codigo === 'GEOMETRIA_INVALIDA', r.s + ' ' + r.d?.codigo);

  // un sector activo fuera del nuevo límite lo bloquea
  await http('PATCH', `/admin/zonas/${idA}/activo`, admin, { activo: true });
  r = await http('PUT', '/admin/zonas/distrito', admin, { geojson: cuadrado(lat + 0.05, lon, 1500) });
  check('deja fuera un sector activo (409)', r.s === 409 && /Prueba A2/.test(r.d?.mensaje ?? ''), r.s + ' ' + r.d?.mensaje?.slice(0, 90));
  await http('PATCH', `/admin/zonas/${idA}/activo`, admin, { activo: false });

  // un vértice del límite original que queda lejos del nuevo
  const [vLon, vLat] = JSON.parse(original).coordinates[0][0][0];
  r = await http('PUT', '/admin/zonas/distrito', admin, { geojson: cuadrado(lat, lon, 1500) });
  check('reducir el límite (200)', r.s === 200 && r.d?.tipo === 'DISTRITO' && r.d.areaKm2 < distrito.areaKm2 / 2, r.s + ' ' + r.d?.areaKm2 + ' km² (antes ' + distrito.areaKm2 + ')');
  const nuevoDistrito = (await http('GET', '/admin/zonas', admin)).d[0];
  check('el listado ya muestra el área nueva', Math.abs(nuevoDistrito.areaKm2 - 9) < 0.5, nuevoDistrito.areaKm2 + ' km²');
  r = await http('POST', '/ciudadano/alertas', reg.d.token, { tipo: 'ROBO', latitud: vLat, longitud: vLon, descripcion: 'fuera del nuevo límite' });
  check('una alerta fuera del nuevo límite se rechaza (422 FUERA_DE_COBERTURA)', r.s === 422 && r.d?.codigo === 'FUERA_DE_COBERTURA', r.s + ' ' + r.d?.codigo);
  r = await http('POST', '/admin/zonas', admin, { nombre: 'Fuera nuevo', geojson: cuadrado(vLat, vLon, 100) });
  check('un sector fuera del nuevo límite se rechaza (422)', r.s === 422 && r.d?.codigo === 'FUERA_DEL_DISTRITO', r.s + ' ' + r.d?.codigo);
  const prueba = await http('POST', '/ciudadano/alertas', reg.d.token, { tipo: 'OTRO', latitud: lat, longitud: lon, descripcion: 'dentro del nuevo límite' });
  check('una alerta dentro sigue aceptándose', prueba.s === 201, prueba.s + ' ' + prueba.d?.codigo);
  r = await http('PUT', '/admin/zonas/distrito', admin, { geojson: cuadrado(lat + 0.05, lon, 1500) });
  check('con una alerta en curso fuera del nuevo límite se bloquea (409)', r.s === 409, r.s + ' ' + r.d?.mensaje?.slice(0, 80));
  if (prueba.d?.id) await http('POST', `/ciudadano/alertas/${prueba.d.id}/cancelar`, reg.d.token);
} finally {
  const rr = await http('PUT', '/admin/zonas/distrito', admin, { geojson: original });
  check('se restaura el límite original (200)', rr.s === 200 && Math.abs(rr.d.areaKm2 - distrito.areaKm2) < 0.05, rr.s + ' ' + rr.d?.areaKm2 + ' km²');
}

console.log('\n=== Auditoría y limpieza ===');
for (const z of (await http('GET', '/admin/zonas', admin)).d.filter((z) => z.tipo === 'SECTOR' && z.activo)) {
  await http('PATCH', `/admin/zonas/${z.id}/activo`, admin, { activo: false });
}
const restantes = (await http('GET', '/admin/zonas', admin)).d.filter((z) => z.tipo === 'SECTOR' && z.activo);
check('todos los sectores de prueba desactivados', restantes.length === 0);

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTODO OK');
process.exit(fallos ? 1 : 0);
