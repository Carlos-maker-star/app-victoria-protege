import { Reporte } from '../../core/models';
import { aIso, fechaCorta, presetDe, rangoPreset, reporteACsv } from './reportes.util';

// Jueves 15 de octubre de 2026
const HOY = new Date(2026, 9, 15, 17, 30);

describe('rangos de fecha', () => {
  it('aIso usa la fecha local con ceros a la izquierda', () => {
    expect(aIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(aIso(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('presets terminan hoy', () => {
    expect(rangoPreset('hoy', HOY)).toEqual({ desde: '2026-10-15', hasta: '2026-10-15' });
    expect(rangoPreset('7', HOY)).toEqual({ desde: '2026-10-09', hasta: '2026-10-15' });
    expect(rangoPreset('30', HOY)).toEqual({ desde: '2026-09-16', hasta: '2026-10-15' });
    expect(rangoPreset('mes', HOY)).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' });
  });

  it('cruza el cambio de mes y de año sin errores', () => {
    expect(rangoPreset('7', new Date(2027, 0, 3))).toEqual({ desde: '2026-12-28', hasta: '2027-01-03' });
  });

  it('presetDe reconoce el rango o devuelve null si es personalizado', () => {
    expect(presetDe({ desde: '2026-10-09', hasta: '2026-10-15' }, HOY)).toBe('7');
    expect(presetDe({ desde: '2026-10-10', hasta: '2026-10-15' }, HOY)).toBeNull();
  });

  it('fechaCorta no se corre un día por la zona horaria', () => {
    expect(fechaCorta('2026-10-01')).toBe('1 oct');
    expect(fechaCorta('2026-12-31')).toBe('31 dic');
  });
});

describe('reporteACsv', () => {
  const reporte: Reporte = {
    desde: '2026-10-09',
    hasta: '2026-10-10',
    indicadores: { total: 4, atendidas: 2, canceladas: 1, activas: 1, escaladas: 1, reasignadas: 1, tiempoAsignacionSeg: 9, tiempoAceptacionSeg: 12, tiempoLlegadaSeg: 277, tiempoAtencionSeg: null },
    porDia: [{ fecha: '2026-10-09', total: 1, tiempoLlegadaSeg: null }, { fecha: '2026-10-10', total: 3, tiempoLlegadaSeg: 277 }],
    porHora: [{ hora: 9, total: 4 }],
    porTipo: [{ codigo: 'ROBO', nombre: 'Robo', total: 4 }],
    porZona: [{ codigo: 'SIN_SECTOR', nombre: 'Sin sector asignado', total: 4 }],
    motivosReasignacion: [{ codigo: 'OTRO', nombre: 'Otro; "raro"', total: 1 }],
    unidades: [{ codigo: 'SV-001', sereno: 'José Ramos', asignaciones: 3, atendidas: 2, rechazadas: 1, sinRespuesta: 0, tiempoTrasladoSeg: 61 }],
  };

  it('empieza con BOM (Excel reconoce las tildes) y usa punto y coma', () => {
    const csv = reporteACsv(reporte);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Alertas;4');
    expect(csv).toContain('Tiempo promedio de llegada (m:ss);4:37');
  });

  it('formatea tiempos como m:ss y deja vacío o guion lo que no hay', () => {
    const csv = reporteACsv(reporte);
    expect(csv).toContain('Tiempo promedio de atención (m:ss);—');
    expect(csv).toContain('2026-10-10;3;4:37');
    expect(csv).toContain('SV-001;José Ramos;3;2;1;0;1:01');
  });

  it('escapa comillas y separadores dentro de un texto', () => {
    expect(reporteACsv(reporte)).toContain('"Otro; ""raro""";1');
  });

  it('incluye las 24 horas con formato HH:00 y todas las secciones', () => {
    const csv = reporteACsv(reporte);
    expect(csv).toContain('09:00;4');
    for (const seccion of ['Alertas por día', 'Alertas por hora', 'Alertas por tipo', 'Alertas por sector', 'Motivos de reasignación', 'Actividad de unidades']) {
      expect(csv).toContain(seccion);
    }
  });
});
