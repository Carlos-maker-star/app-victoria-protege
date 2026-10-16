import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MonitoreoService } from '../../core/api/monitoreo.service';
import { formatoDuracion, partirDuracion, TIPOS } from '../../core/etiquetas';
import { Reporte } from '../../core/models';
import { BarrasHorizontales, BarrasVerticales, Linea, PuntoBarra, PuntoLinea } from '../../shared/graficos';
import {
  aIso,
  fechaCorta,
  fechaLarga,
  Preset,
  presetDe,
  Rango,
  rangoPreset,
  reporteACsv,
} from './reportes.util';

interface Indicador {
  titulo: string;
  valor: string;
  unidad: string;
  detalle: string;
  icono: string;
  tono: string;
}

@Component({
  selector: 'app-reportes',
  imports: [MatButton, MatIcon, MatProgressBar, BarrasVerticales, BarrasHorizontales, Linea],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reportes.html',
})
export class Reportes {
  private readonly api = inject(MonitoreoService);

  protected readonly presets: { clave: Preset; etiqueta: string }[] = [
    { clave: 'hoy', etiqueta: 'Hoy' },
    { clave: '7', etiqueta: '7 días' },
    { clave: '30', etiqueta: '30 días' },
    { clave: 'mes', etiqueta: 'Este mes' },
  ];

  protected readonly rango = signal<Rango>(rangoPreset('7'));
  protected readonly presetActivo = computed(() => presetDe(this.rango()));
  protected readonly reporte = signal<Reporte | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal(false);
  protected readonly maxFecha = aIso(new Date());

  protected readonly titulo = computed(() => {
    const { desde, hasta } = this.rango();
    return desde === hasta ? fechaLarga(desde) : `${fechaCorta(desde)} – ${fechaLarga(hasta)}`;
  });

  protected readonly vacio = computed(() => this.reporte()?.indicadores.total === 0);

  protected readonly indicadores = computed<Indicador[]>(() => {
    const i = this.reporte()?.indicadores;
    const n = (v: number | undefined) => (v === undefined ? '—' : String(v));
    const pct = i && i.total > 0 ? Math.round((i.reasignadas / i.total) * 100) : 0;
    return [
      { titulo: 'Alertas', valor: n(i?.total), unidad: '', detalle: i ? `${i.atendidas} atendidas · ${i.canceladas} canceladas` : '', icono: 'notifications_active', tono: 'bg-primary-soft text-primary' },
      { titulo: 'T. de asignación', ...partirDuracion(i?.tiempoAsignacionSeg), detalle: 'de la alerta a la primera unidad', icono: 'timer', tono: 'bg-nuevo-bg text-nuevo-fg' },
      { titulo: 'T. de aceptación', ...partirDuracion(i?.tiempoAceptacionSeg), detalle: 'hasta que un sereno acepta', icono: 'how_to_reg', tono: 'bg-nuevo-bg text-nuevo-fg' },
      { titulo: 'T. de llegada', ...partirDuracion(i?.tiempoLlegadaSeg), detalle: 'desde que se crea la alerta', icono: 'directions_car', tono: 'bg-curso-bg text-curso-fg' },
      { titulo: 'T. de atención', ...partirDuracion(i?.tiempoAtencionSeg), detalle: 'en el lugar', icono: 'shield', tono: 'bg-atencion-bg text-atencion-fg' },
      { titulo: 'Reasignadas', valor: n(i?.reasignadas), unidad: i ? `(${pct} %)` : '', detalle: 'con más de una unidad', icono: 'swap_horiz', tono: 'bg-espera-bg text-espera-fg' },
      { titulo: 'Escaladas', valor: n(i?.escaladas), unidad: '', detalle: 'sin unidad: pasaron a la central', icono: 'priority_high', tono: 'bg-peligro-bg text-peligro-fg' },
      { titulo: 'Atendidas', valor: n(i?.atendidas), unidad: i && i.total > 0 ? `(${Math.round((i.atendidas / i.total) * 100)} %)` : '', detalle: 'finalizadas con resultado', icono: 'task_alt', tono: 'bg-exito-bg text-exito-fg' },
    ];
  });

  protected readonly porDia = computed<PuntoBarra[]>(() => {
    const hoy = aIso(new Date());
    return (this.reporte()?.porDia ?? []).map((d) => ({
      etiqueta: fechaCorta(d.fecha),
      valor: d.total,
      titulo: `${fechaLarga(d.fecha)}: ${d.total} alertas`,
      destacado: d.fecha === hoy,
    }));
  });

  protected readonly porHora = computed<PuntoBarra[]>(() =>
    (this.reporte()?.porHora ?? []).map((h) => ({
      etiqueta: String(h.hora),
      valor: h.total,
      titulo: `${String(h.hora).padStart(2, '0')}:00 – ${String(h.hora).padStart(2, '0')}:59: ${h.total} alertas`,
    })),
  );

  /** Nombres de tipo con tilde correcta (los de la base de datos no las llevan). */
  protected readonly filasTipo = computed(() =>
    (this.reporte()?.porTipo ?? []).map((c) => ({ nombre: TIPOS[c.codigo]?.nombre ?? c.nombre, total: c.total })),
  );

  protected readonly llegadaPorDia = computed<PuntoLinea[]>(() =>
    (this.reporte()?.porDia ?? []).map((d) => ({ etiqueta: fechaCorta(d.fecha), valor: d.tiempoLlegadaSeg })),
  );
  protected readonly hayLlegadas = computed(() => this.llegadaPorDia().some((p) => p.valor !== null));

  protected readonly formatoTiempo = (segundos: number) => formatoDuracion(segundos);

  /** Si 24 barras son demasiadas para el ancho, se etiqueta cada 3 horas. */
  protected readonly etiquetaCada = 3;

  constructor() {
    effect((alCerrar) => {
      const { desde, hasta } = this.rango();
      this.cargando.set(true);
      this.error.set(false);
      const sub = this.api.reporte(desde, hasta).subscribe({
        next: (r) => {
          this.reporte.set(r);
          this.cargando.set(false);
        },
        error: () => {
          this.error.set(true);
          this.cargando.set(false);
        },
      });
      alCerrar(() => sub.unsubscribe());
    });
  }

  protected elegir(preset: Preset): void {
    this.rango.set(rangoPreset(preset));
  }

  /** Fecha personalizada. Si el usuario deja la inicial después de la final, la final se ajusta. */
  protected cambiarFecha(campo: 'desde' | 'hasta', valor: string): void {
    if (!valor) {
      return;
    }
    const actual = this.rango();
    const nuevo = { ...actual, [campo]: valor };
    if (nuevo.desde > nuevo.hasta) {
      nuevo[campo === 'desde' ? 'hasta' : 'desde'] = valor;
    }
    this.rango.set(nuevo);
  }

  protected exportar(): void {
    const r = this.reporte();
    if (!r) {
      return;
    }
    const url = URL.createObjectURL(new Blob([reporteACsv(r)], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `reporte-victoria-protege_${r.desde}_${r.hasta}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  protected tiempo(segundos: number | null): string {
    return segundos === null ? '—' : formatoDuracion(segundos);
  }
}
