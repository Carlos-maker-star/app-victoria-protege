import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Colores con contraste AA sobre texto blanco. */
const COLORES = ['#0e7490', '#7c3aed', '#be185d', '#4338ca', '#047857', '#b45309'];

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
      [class]="tamanio() === 'md' ? 'size-9 text-xs' : 'size-6 text-[10px]'"
      [style.background]="color()"
      [attr.title]="nombre()"
      aria-hidden="true"
    >
      {{ iniciales() }}
    </span>
  `,
})
export class Avatar {
  readonly nombre = input.required<string>();
  readonly tamanio = input<'sm' | 'md'>('sm');

  protected readonly iniciales = computed(() =>
    this.nombre()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0].toUpperCase())
      .join(''),
  );

  protected readonly color = computed(() => {
    let hash = 0;
    for (const letra of this.nombre()) {
      hash = (hash * 31 + letra.charCodeAt(0)) >>> 0;
    }
    return COLORES[hash % COLORES.length];
  });
}
