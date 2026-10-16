import { formatoDuracion } from '../../core/etiquetas';
import { Reporte } from '../../core/models';

export type Preset = 'hoy' | '7' | '30' | 'mes';

export interface Rango {
  desde: string;
  hasta: string;
}

/** Fecha local como AAAA-MM-DD (el navegador de la central está en hora de Lima). */
export function aIso(fecha: Date): string {
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${m}-${d}`;
}

/** Rango de un preset, hasta `hoy` inclusive. */
export function rangoPreset(preset: Preset, hoy: Date = new Date()): Rango {
  const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const inicio = new Date(fin);
  if (preset === '7') {
    inicio.setDate(fin.getDate() - 6);
  } else if (preset === '30') {
    inicio.setDate(fin.getDate() - 29);
  } else if (preset === 'mes') {
    inicio.setDate(1);
  }
  return { desde: aIso(inicio), hasta: aIso(fin) };
}

/** Qué preset coincide con el rango (o null si es personalizado). */
export function presetDe(rango: Rango, hoy: Date = new Date()): Preset | null {
  const presets: Preset[] = ['hoy', '7', '30', 'mes'];
  return presets.find((p) => {
    const r = rangoPreset(p, hoy);
    return r.desde === rango.desde && r.hasta === rango.hasta;
  }) ?? null;
}

/** "9 oct" a partir de AAAA-MM-DD (sin pasar por zonas horarias). */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(a, m - 1, d)).replace('.', '');
}

export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(a, m - 1, d));
}

const SEPARADOR = ';'; // el Excel en español abre bien los CSV separados por punto y coma

function celda(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function fila(...valores: (string | number | null | undefined)[]): string {
  return valores.map(celda).join(SEPARADOR);
}

/** CSV con todas las secciones del reporte, listo para abrir en Excel. */
export function reporteACsv(r: Reporte): string {
  const i = r.indicadores;
  const t = (s: number | null) => formatoDuracion(s);
  const lineas: string[] = [
    fila('La Victoria Protege - Reporte'),
    fila('Desde', r.desde, 'Hasta', r.hasta),
    '',
    fila('Indicadores'),
    fila('Alertas', i.total),
    fila('Atendidas', i.atendidas),
    fila('Canceladas', i.canceladas),
    fila('Activas', i.activas),
    fila('Escaladas a la central', i.escaladas),
    fila('Con reasignación', i.reasignadas),
    fila('Tiempo promedio de asignación (m:ss)', t(i.tiempoAsignacionSeg)),
    fila('Tiempo promedio de aceptación (m:ss)', t(i.tiempoAceptacionSeg)),
    fila('Tiempo promedio de llegada (m:ss)', t(i.tiempoLlegadaSeg)),
    fila('Tiempo promedio de atención (m:ss)', t(i.tiempoAtencionSeg)),
    '',
    fila('Alertas por día'),
    fila('Fecha', 'Alertas', 'Tiempo de llegada (m:ss)'),
    ...r.porDia.map((d) => fila(d.fecha, d.total, t(d.tiempoLlegadaSeg))),
    '',
    fila('Alertas por hora'),
    fila('Hora', 'Alertas'),
    ...r.porHora.map((h) => fila(`${String(h.hora).padStart(2, '0')}:00`, h.total)),
    '',
    fila('Alertas por tipo'),
    ...r.porTipo.map((c) => fila(c.nombre, c.total)),
    '',
    fila('Alertas por sector'),
    ...r.porZona.map((c) => fila(c.nombre, c.total)),
    '',
    fila('Motivos de reasignación'),
    ...r.motivosReasignacion.map((c) => fila(c.nombre, c.total)),
    '',
    fila('Actividad de unidades'),
    fila('Unidad', 'Sereno', 'Asignaciones', 'Atendidas', 'Rechazadas', 'Sin respuesta', 'Traslado promedio (m:ss)'),
    ...r.unidades.map((u) => fila(u.codigo, u.sereno, u.asignaciones, u.atendidas, u.rechazadas, u.sinRespuesta, t(u.tiempoTrasladoSeg))),
  ];
  // BOM para que Excel reconozca UTF-8 (tildes y ñ)
  return '﻿' + lineas.join('\r\n') + '\r\n';
}
