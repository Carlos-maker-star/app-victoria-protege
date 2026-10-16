#!/usr/bin/env node
/*
 * Experimento completo: corre el simulador en modo automático y manual con varias semillas (mismo escenario en
 * ambos modos) y resume la comparación en simulador/resultados/experimento-resumen.{csv,md}.
 *
 *   node simulador/experimento.mjs --semillas 5 --unidades 6 --duracion 240 --alertas-por-minuto 3 --prefijo exp
 *   node simulador/experimento.mjs --solo-resumen --semillas 5 --prefijo exp     (re-genera el resumen sin correr nada)
 *
 * Requiere el backend en marcha. Tarda aprox. (duracion + hasta drenaje) x semillas x 2.
 * Las demás opciones (--p-rechazo, --factor-velocidad, --operador-demora…) se pasan tal cual al simulador.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RES = join(AQUI, 'resultados');

let semillas = 5, prefijo = 'exp', soloResumen = false;
const paso = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--semillas') semillas = Number(args[++i]);
  else if (args[i] === '--prefijo') prefijo = args[++i];
  else if (args[i] === '--solo-resumen') soloResumen = true;
  else paso.push(args[i]);
}
if (!Number.isInteger(semillas) || semillas < 1) { console.error('--semillas debe ser un entero >= 1'); process.exit(1); }
const archivo = (modo, s) => join(RES, `${prefijo}-${modo === 'automatico' ? 'auto' : 'manual'}-${s}.json`);

if (!soloResumen) {
  const inicio = Date.now();
  for (let s = 1; s <= semillas; s++) {
    // Se alterna cuál modo va primero para que el desgaste del sistema no favorezca siempre al mismo
    const orden = s % 2 ? ['automatico', 'manual'] : ['manual', 'automatico'];
    for (const modo of orden) {
      const nombre = `${prefijo}-${modo === 'automatico' ? 'auto' : 'manual'}-${s}`;
      console.log(`\n=== Semilla ${s}/${semillas} · ${modo} (${nombre}) · transcurrido ${Math.round((Date.now() - inicio) / 60000)} min ===`);
      const r = spawnSync(process.execPath, [join(AQUI, 'simulador.mjs'), '--modo', modo, '--semilla', String(s), '--nombre', nombre, '--silencioso', ...paso], { stdio: 'inherit' });
      if (r.status !== 0) { console.error(`El simulador falló en ${nombre}; se detiene el experimento.`); process.exit(r.status ?? 1); }
    }
  }
}

// ------------------------------------------------------------ resumen
const leer = (modo, s) => (existsSync(archivo(modo, s)) ? JSON.parse(readFileSync(archivo(modo, s), 'utf8')).resumen : null);
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const desv = (xs) => { if (xs.length < 2) return null; const m = media(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const f1 = (x) => (x === null || x === undefined ? '—' : x.toFixed(1));

const pares = [];
for (let s = 1; s <= semillas; s++) {
  const a = leer('automatico', s), m = leer('manual', s);
  if (a && m) pares.push({ s, a, m });
}
if (!pares.length) { console.error('No hay corridas completas para resumir.'); process.exit(1); }

const METRICAS = [
  ['asignacion', 'Tiempo de asignación (s)'],
  ['aceptacion', 'Tiempo de aceptación (s)'],
  ['llegada', 'Tiempo de llegada (s)'],
  ['atencion', 'Tiempo de atención (s)'],
];
const filas = [];
for (const [clave, titulo] of METRICAS) {
  for (const est of ['media', 'mediana', 'p90']) {
    const va = pares.map((p) => p.a.tiempos[clave]?.[est]).filter((x) => typeof x === 'number');
    const vm = pares.map((p) => p.m.tiempos[clave]?.[est]).filter((x) => typeof x === 'number');
    const dif = pares.map((p) => [p.a.tiempos[clave]?.[est], p.m.tiempos[clave]?.[est]]).filter(([x, y]) => typeof x === 'number' && typeof y === 'number').map(([x, y]) => y - x);
    filas.push({ titulo, est, auto: media(va), autoSd: desv(va), manual: media(vm), manualSd: desv(vm), mejora: media(dif), ganaAuto: dif.filter((d) => d > 0).length, n: dif.length });
  }
}
const suma = (modo, f) => pares.reduce((t, p) => t + f(modo === 'a' ? p.a : p.m), 0);
const conteos = [
  ['Alertas creadas', (r) => r.alertas.creadas],
  ['Alertas finalizadas', (r) => r.alertas.finalizadas],
  ['Alertas canceladas por el simulador (no terminaron)', (r) => r.alertas.canceladas],
  ['Alertas reasignadas', (r) => r.reasignadas],
  ['Alertas escaladas a la central', (r) => r.escaladas],
].map(([t, f]) => ({ titulo: t, auto: suma('a', f), manual: suma('m', f) }));

const huellas = pares.map((p) => `${p.s}:${p.a.plan?.huella === p.m.plan?.huella ? 'igual' : 'DISTINTA'}`).join(', ');
const params = pares[0].a.parametros;

writeFileSync(join(RES, `${prefijo}-resumen.csv`), '﻿' + [
  'metrica;estadistico;automatico_media;automatico_desv;manual_media;manual_desv;diferencia_manual_menos_auto;semillas_donde_gana_auto;semillas',
  ...filas.map((f) => [f.titulo, f.est, f1(f.auto), f1(f.autoSd), f1(f.manual), f1(f.manualSd), f1(f.mejora), f.ganaAuto, f.n].join(';')),
].join('\r\n') + '\r\n');

const md = [
  `# Experimento ${prefijo}: asignación automática vs. manual`,
  '',
  `- Semillas completas: ${pares.length} de ${semillas} · unidades: ${params.unidades} · duración de generación: ${params.duracion} s · ${params['alertas-por-minuto']} alertas/min`,
  `- Operador manual simulado: demora ${params['operador-demora']} ± ${params['operador-desviacion']} s, error ${params['operador-error']}`,
  `- Mismo plan de alertas en ambos modos por semilla: ${huellas}`,
  '',
  'Cada celda es el promedio entre semillas de la estadística indicada (± desviación entre semillas). «Diferencia» = manual − automático: positivo significa que el sistema automático fue más rápido.',
  '',
  '| Métrica | Estadístico | Automático | Manual | Diferencia | Semillas donde gana el automático |',
  '|---|---|---|---|---|---|',
  ...filas.map((f) => `| ${f.titulo} | ${f.est} | ${f1(f.auto)} ± ${f1(f.autoSd)} | ${f1(f.manual)} ± ${f1(f.manualSd)} | ${f1(f.mejora)} | ${f.ganaAuto}/${f.n} |`),
  '',
  '| Conteo (suma de semillas) | Automático | Manual |',
  '|---|---|---|',
  ...conteos.map((c) => `| ${c.titulo} | ${c.auto} | ${c.manual} |`),
  '',
  'Limitaciones: el operador manual es un modelo simple; los desplazamientos son en línea recta y acelerados por `--factor-velocidad`; no hay dos corridas idénticas al segundo. Con pocas semillas las diferencias pequeñas no son concluyentes.',
  '',
].join('\n');
writeFileSync(join(RES, `${prefijo}-resumen.md`), md);
console.log('\n' + md);
console.log(`Resumen guardado en simulador/resultados/${prefijo}-resumen.{md,csv}`);
