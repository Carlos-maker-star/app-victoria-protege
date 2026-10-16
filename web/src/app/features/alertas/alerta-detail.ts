import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { MonitoreoService } from '../../core/api/monitoreo.service';
import { infoEvento, partirDuracion, TIPOS } from '../../core/etiquetas';
import { IntervencionService } from '../../core/intervencion.service';
import { Alerta, AlertaDetalle, EventoAlerta } from '../../core/models';
import { MonitoreoStore } from '../../core/monitoreo.store';
import { EstadoAlertaBadge, PrioridadBadge } from '../../shared/badges';
import { MapaOperativo } from '../monitoreo/mapa-operativo';
import { EvidenciasAlerta } from './evidencias-alerta';

/** Segundos entre dos eventos de la línea de tiempo, o null si alguno no ocurrió. */
function entre(historial: EventoAlerta[], desde: string, hasta: string): number | null {
  const a = historial.find((e) => e.tipo === desde);
  const b = [...historial].reverse().find((e) => e.tipo === hasta);
  return a && b ? Math.max(0, Math.round((new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime()) / 1000)) : null;
}

@Component({
  selector: 'app-alerta-detail',
  imports: [DatePipe, RouterLink, MatButton, MatIcon, MapaOperativo, EstadoAlertaBadge, PrioridadBadge, EvidenciasAlerta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alerta-detail.html',
})
export class AlertaDetail {
  private readonly api = inject(MonitoreoService);
  protected readonly store = inject(MonitoreoStore);
  protected readonly intervencion = inject(IntervencionService);

  /** :id de la ruta. */
  readonly id = input.required<string>();

  protected readonly detalle = signal<AlertaDetalle | null>(null);
  protected readonly noEncontrado = signal(false);

  protected readonly alerta = computed(() => this.detalle()?.alerta ?? null);
  protected readonly historial = computed(() => this.detalle()?.historial ?? []);

  /** Unidad que atiende la alerta, con su posición en vivo (viene del almacén de la central). */
  protected readonly unidades = computed(() => {
    const codigo = this.alerta()?.unidadCodigo;
    return codigo ? this.store.unidades().filter((u) => u.codigo === codigo) : [];
  });

  protected readonly centro = computed(() => {
    const a = this.alerta();
    return a ? { latitud: a.latitud, longitud: a.longitud, zoom: 16 } : null;
  });

  protected readonly tiempos = computed(() => {
    const h = this.historial();
    return [
      { titulo: 'Asignación', ...partirDuracion(entre(h, 'ALERTA_CREADA', 'UNIDAD_ASIGNADA')), detalle: 'Alerta → primera unidad' },
      { titulo: 'Aceptación', ...partirDuracion(entre(h, 'UNIDAD_ASIGNADA', 'ALERTA_ACEPTADA')), detalle: 'Hasta que un sereno acepta' },
      { titulo: 'Llegada', ...partirDuracion(entre(h, 'ALERTA_CREADA', 'UNIDAD_LLEGO')), detalle: 'Desde que se creó la alerta' },
      { titulo: 'Atención', ...partirDuracion(entre(h, 'UNIDAD_LLEGO', 'ATENCION_FINALIZADA')), detalle: 'En el lugar' },
    ];
  });

  protected readonly reasignaciones = computed(
    () => this.historial().filter((e) => e.tipo === 'ALERTA_RECHAZADA' || e.tipo === 'SIN_RESPUESTA').length,
  );

  constructor() {
    effect(() => this.cargar(Number(this.id())));
    // Si esta alerta cambia en vivo, se vuelve a pedir su detalle
    this.store.cambios$
      .pipe(
        filter((n) => n.alerta.id === Number(this.id())),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.cargar(Number(this.id())));
  }

  protected asignar(a: Alerta): void {
    this.intervencion.asignar(a).subscribe((ok) => ok && this.cargar(a.id));
  }

  protected cancelarAlerta(a: Alerta): void {
    this.intervencion.cancelar(a).subscribe((ok) => ok && this.cargar(a.id));
  }

  protected codigo(id: number): string {
    return `ALR-${String(id).padStart(6, '0')}`;
  }

  protected nombreTipo(codigo: string, respaldo: string): string {
    return TIPOS[codigo]?.nombre ?? respaldo;
  }

  protected evento(tipo: string) {
    return infoEvento(tipo);
  }

  private cargar(id: number): void {
    this.api.detalle(id).subscribe({
      next: (d) => {
        this.detalle.set(d);
        this.noEncontrado.set(false);
      },
      error: () => this.noEncontrado.set(this.detalle() === null),
    });
  }
}
