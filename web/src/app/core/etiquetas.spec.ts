import { ESTADOS_ALERTA, ESTADOS_UNIDAD, formatoDuracion, iconoDeTipo, infoEvento, partirDuracion, PRIORIDADES } from './etiquetas';
import { EstadoAlerta, EstadoUnidad } from './models';

describe('etiquetas', () => {
  it('formatoDuracion muestra m:ss y guion si no hay dato', () => {
    expect(formatoDuracion(0)).toBe('0:00');
    expect(formatoDuracion(9)).toBe('0:09');
    expect(formatoDuracion(277)).toBe('4:37');
    expect(formatoDuracion(null)).toBe('—');
    expect(formatoDuracion(undefined)).toBe('—');
  });

  it('partirDuracion usa segundos bajo un minuto y m:ss desde un minuto', () => {
    expect(partirDuracion(0.8)).toEqual({ valor: '1', unidad: 's' });
    expect(partirDuracion(9)).toEqual({ valor: '9', unidad: 's' });
    expect(partirDuracion(312)).toEqual({ valor: '5:12', unidad: 'min' });
    expect(partirDuracion(null)).toEqual({ valor: '—', unidad: '' });
  });

  it('todos los estados de alerta del backend tienen etiqueta y color', () => {
    const estados: EstadoAlerta[] = ['CREADA', 'BUSCANDO_UNIDAD', 'ASIGNADA', 'ACEPTADA', 'EN_CAMINO', 'LLEGO', 'EN_ATENCION', 'FINALIZADA', 'SIN_UNIDAD', 'CANCELADA'];
    for (const e of estados) {
      expect(ESTADOS_ALERTA[e].etiqueta).toBeTruthy();
      expect(ESTADOS_ALERTA[e].clases).toContain('text-');
      expect(ESTADOS_ALERTA[e].css).toMatch(/^--app-/);
    }
  });

  it('todos los estados de unidad tienen etiqueta, color y punto', () => {
    const estados: EstadoUnidad[] = ['DISPONIBLE', 'EN_DESPLAZAMIENTO', 'EN_ATENCION', 'FUERA_DE_SERVICIO'];
    for (const e of estados) {
      expect(ESTADOS_UNIDAD[e].etiqueta).toBeTruthy();
      expect(ESTADOS_UNIDAD[e].punto).toMatch(/^bg-u-/);
    }
  });

  it('las cuatro prioridades están definidas', () => {
    expect([1, 2, 3, 4].map((p) => PRIORIDADES[p].etiqueta)).toEqual(['Crítica', 'Alta', 'Media', 'Baja']);
  });

  it('un evento o tipo desconocido no rompe la pantalla', () => {
    expect(infoEvento('EVENTO_NUEVO').texto).toBe('EVENTO_NUEVO');
    expect(iconoDeTipo('TIPO_NUEVO')).toBe('notifications_active');
  });
});
