import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/*
 * Gráficos simples con CSS y SVG, sin librerías. Los colores salen de las utilidades de tailwind.css
 * (bg-primary, text-primary…), así que siguen el modo claro y oscuro. Cada barra lleva `title`.
 */

export interface PuntoBarra {
  etiqueta: string;
  valor: number;
  /** Texto del tooltip (por defecto, "etiqueta: valor"). */
  titulo?: string;
  /** Resalta la barra (p. ej. el día de hoy). */
  destacado?: boolean;
}

/** Barras verticales: días, horas. */
@Component({
  selector: 'app-barras-verticales',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-end gap-1.5" [style.height.px]="alto()" role="img" [attr.aria-label]="descripcion()">
      @for (p of puntos(); track $index) {
        <div class="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" [attr.title]="p.titulo ?? p.etiqueta + ': ' + p.valor">
          @if (mostrarValores() && p.valor > 0) {
            <span class="text-[11px] font-semibold text-ink">{{ p.valor }}</span>
          }
          <div
            class="w-full rounded-t-md bg-primary"
            [class.opacity-55]="!p.destacado && hayDestacado()"
            [style.height.%]="altura(p.valor)"
            [style.min-height.px]="p.valor > 0 ? 3 : 0"
          ></div>
        </div>
      }
    </div>
    <div class="mt-1.5 flex gap-1.5" aria-hidden="true">
      @for (p of puntos(); track $index) {
        <span class="min-w-0 flex-1 truncate text-center text-[11px] text-subtle">{{ $index % cadaEtiqueta() === 0 ? p.etiqueta : '' }}</span>
      }
    </div>
  `,
})
export class BarrasVerticales {
  readonly puntos = input.required<PuntoBarra[]>();
  readonly alto = input(150);
  readonly mostrarValores = input(true);
  /** Muestra la etiqueta cada N barras (para las 24 horas). */
  readonly cadaEtiqueta = input(1);
  readonly descripcion = input('Gráfico de barras');

  private readonly maximo = computed(() => Math.max(1, ...this.puntos().map((p) => p.valor)));
  protected readonly hayDestacado = computed(() => this.puntos().some((p) => p.destacado));

  protected altura(valor: number): number {
    // Deja sitio arriba para el número
    return (valor / this.maximo()) * (this.mostrarValores() ? 82 : 100);
  }
}

export interface FilaBarra {
  nombre: string;
  total: number;
}

/** Barras horizontales con su total: tipos, zonas, motivos. */
@Component({
  selector: 'app-barras-horizontales',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3.5">
      @for (f of filas(); track f.nombre) {
        <div class="grid items-center gap-3" [style.grid-template-columns]="'minmax(0,' + anchoEtiqueta() + 'px) minmax(0,1fr) 36px'" [attr.title]="f.nombre + ': ' + f.total">
          <span class="truncate text-[13px]">{{ f.nombre }}</span>
          <div class="h-2.5 overflow-hidden rounded-full bg-track">
            <span class="block h-full rounded-full" [class]="color()" [style.width.%]="(f.total / maximo()) * 100"></span>
          </div>
          <b class="text-right text-sm">{{ f.total }}</b>
        </div>
      } @empty {
        <p class="m-0 py-6 text-center text-sm text-muted">{{ vacio() }}</p>
      }
    </div>
  `,
})
export class BarrasHorizontales {
  readonly filas = input.required<FilaBarra[]>();
  /** Clase de color de la barra (completa, para que Tailwind la detecte). */
  readonly color = input('bg-primary');
  readonly vacio = input('Sin datos en este rango.');
  /** Ancho máximo (px) de la columna de nombres; ampliarlo si los nombres son largos. */
  readonly anchoEtiqueta = input(150);

  protected readonly maximo = computed(() => Math.max(1, ...this.filas().map((f) => f.total)));
}

export interface PuntoLinea {
  etiqueta: string;
  valor: number | null;
}

/** Línea de valores por día; los días sin dato dejan un hueco. El formateador da el texto de los ejes. */
@Component({
  selector: 'app-linea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + ancho + ' ' + alto" class="block w-full" role="img" [attr.aria-label]="descripcion()">
      @for (g of guias(); track g.y) {
        <line [attr.x1]="margen" [attr.x2]="ancho - 8" [attr.y1]="g.y" [attr.y2]="g.y" class="stroke-line" stroke-width="1" />
        <text [attr.x]="margen - 8" [attr.y]="g.y + 4" text-anchor="end" class="fill-subtle" font-size="11">{{ g.texto }}</text>
      }
      @for (t of tramos(); track $index) {
        <polyline [attr.points]="t" fill="none" class="stroke-primary" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      }
      @for (p of marcas(); track $index) {
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4" class="fill-primary stroke-surface" stroke-width="2">
          <title>{{ p.titulo }}</title>
        </circle>
      }
      @for (e of etiquetasX(); track $index) {
        <text [attr.x]="e.x" [attr.y]="alto - 4" text-anchor="middle" class="fill-subtle" font-size="11">{{ e.texto }}</text>
      }
    </svg>
  `,
})
export class Linea {
  readonly puntos = input.required<PuntoLinea[]>();
  readonly formato = input<(v: number) => string>((v) => String(v));
  readonly descripcion = input('Gráfico de línea');

  protected readonly ancho = 900;
  protected readonly alto = 170;
  protected readonly margen = 46;
  private readonly arriba = 12;
  private readonly abajo = 26;

  private readonly maximo = computed(() => Math.max(1, ...this.puntos().map((p) => p.valor ?? 0)));

  private x(i: number): number {
    const n = this.puntos().length;
    const util = this.ancho - this.margen - 16;
    return n <= 1 ? this.margen + util / 2 : this.margen + 8 + (i / (n - 1)) * (util - 8);
  }

  private y(valor: number): number {
    const util = this.alto - this.arriba - this.abajo;
    return this.arriba + util - (valor / this.maximo()) * util;
  }

  protected readonly guias = computed(() =>
    [0, 0.5, 1].map((f) => ({ y: this.y(this.maximo() * f), texto: this.formato()(Math.round(this.maximo() * f)) })),
  );

  /** Tramos continuos (se corta donde no hay dato). */
  protected readonly tramos = computed(() => {
    const tramos: string[] = [];
    let actual: string[] = [];
    this.puntos().forEach((p, i) => {
      if (p.valor === null) {
        if (actual.length > 1) {
          tramos.push(actual.join(' '));
        }
        actual = [];
      } else {
        actual.push(`${this.x(i).toFixed(1)},${this.y(p.valor).toFixed(1)}`);
      }
    });
    if (actual.length > 1) {
      tramos.push(actual.join(' '));
    }
    return tramos;
  });

  protected readonly marcas = computed(() =>
    this.puntos()
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.valor !== null)
      .map(({ p, i }) => ({ x: this.x(i), y: this.y(p.valor as number), titulo: `${p.etiqueta}: ${this.formato()(p.valor as number)}` })),
  );

  protected readonly etiquetasX = computed(() => {
    const n = this.puntos().length;
    const cada = Math.max(1, Math.ceil(n / 8));
    return this.puntos()
      .map((p, i) => ({ texto: p.etiqueta, x: this.x(i), i }))
      .filter((e) => e.i % cada === 0);
  });
}
