import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ESTADOS_ALERTA, ESTADOS_UNIDAD, PRIORIDADES } from '../core/etiquetas';
import { EstadoAlerta, EstadoUnidad } from '../core/models';

/** Estado de una alerta: fondo suave + texto, color según el rol semántico (etiquetas.ts). */
@Component({
  selector: 'app-estado-alerta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
      [class]="info().clases"
    >
      {{ info().etiqueta }}
    </span>
  `,
})
export class EstadoAlertaBadge {
  readonly estado = input.required<EstadoAlerta>();
  protected readonly info = computed(() => ESTADOS_ALERTA[this.estado()]);
}

/** Estado de una unidad: cuadrado de color + texto (igual que en la app del sereno). */
@Component({
  selector: 'app-estado-unidad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
      [class]="info().clases"
    >
      {{ info().etiqueta }}
    </span>
  `,
})
export class EstadoUnidadBadge {
  readonly estado = input.required<EstadoUnidad>();
  protected readonly info = computed(() => ESTADOS_UNIDAD[this.estado()]);
}

/** Prioridad de la alerta: punto de color + texto; la crítica lleva además un ícono de advertencia. */
@Component({
  selector: 'app-prioridad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="inline-flex items-center gap-2 text-[13px] font-medium">
      <span class="size-2 rounded-full" [class]="info().punto" aria-hidden="true"></span>
      {{ info().etiqueta }}
    </span>
  `,
})
export class PrioridadBadge {
  readonly prioridad = input.required<number>();
  protected readonly info = computed(() => PRIORIDADES[this.prioridad()] ?? PRIORIDADES[4]);
}
