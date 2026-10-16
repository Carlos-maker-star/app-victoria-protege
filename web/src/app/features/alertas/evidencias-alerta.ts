import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MonitoreoService } from '../../core/api/monitoreo.service';
import { Evidencia } from '../../core/models';

const ORIGEN: Record<Evidencia['origen'], string> = { CIUDADANO: 'Ciudadano', SERENO: 'Sereno' };

/** Muestra una foto o un video a tamaño completo. El archivo se pide con el token y se muestra desde memoria. */
@Component({
  selector: 'app-evidencia-visor',
  imports: [MatDialogModule, MatButton, MatProgressBar, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="flex! flex-col items-start gap-0.5">
      {{ evidencia.tipo === 'VIDEO' ? 'Video' : 'Foto' }} del {{ origen(evidencia) }}
      <span class="text-[13px] font-normal text-muted">{{ evidencia.autor }} · {{ evidencia.creadoEn | date: 'd MMM y, HH:mm' }}</span>
    </h2>
    <mat-dialog-content class="flex flex-col gap-3">
      @if (cargando()) { <mat-progress-bar mode="indeterminate" /> }
      @if (fallo()) {
        <p class="m-0 rounded-lg bg-peligro-bg px-3 py-2.5 text-sm text-peligro-fg" role="alert">No se pudo cargar el archivo.</p>
      } @else if (url(); as u) {
        @if (evidencia.tipo === 'VIDEO') {
          <video [src]="u" controls class="max-h-[60vh] w-full rounded-lg bg-black"></video>
        } @else {
          <img [src]="u" [alt]="'Foto enviada por ' + evidencia.autor" class="max-h-[60vh] w-full rounded-lg object-contain" />
        }
      }
      @if (evidencia.observacion) { <p class="m-0 text-sm leading-relaxed">{{ evidencia.observacion }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button matButton mat-dialog-close>Cerrar</button></mat-dialog-actions>
  `,
})
export class EvidenciaVisor {
  protected readonly evidencia = inject<Evidencia>(MAT_DIALOG_DATA);
  private readonly api = inject(MonitoreoService);

  protected readonly url = signal<string | null>(null);
  protected readonly cargando = signal(true);
  protected readonly fallo = signal(false);

  constructor() {
    const sub = this.api.archivoEvidencia(this.evidencia.id).subscribe({
      next: (blob) => {
        this.url.set(URL.createObjectURL(blob));
        this.cargando.set(false);
      },
      error: () => {
        this.fallo.set(true);
        this.cargando.set(false);
      },
    });
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      const u = this.url();
      if (u) {
        URL.revokeObjectURL(u);
      }
    });
  }

  protected origen(e: Evidencia): string {
    return ORIGEN[e.origen].toLowerCase();
  }
}

/** Sección «Evidencias» del detalle de una alerta: miniaturas de las fotos, tarjetas de videos y notas. */
@Component({
  selector: 'app-evidencias-alerta',
  imports: [DatePipe, MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-xl border border-line bg-surface">
      <header class="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 class="m-0 text-base font-semibold">Evidencias</h2>
        <span class="text-xs text-subtle">{{ lista().length }}</span>
      </header>
      @if (lista().length === 0) {
        <p class="m-0 px-5 py-6 text-center text-sm text-muted">
          Nadie ha adjuntado fotos, videos o notas todavía. Aparecerán aquí cuando el ciudadano o el sereno las envíen.
        </p>
      } @else {
        <ul class="m-0 flex list-none flex-col gap-3 p-4">
          @for (e of lista(); track e.id) {
            <li class="flex gap-3">
              @if (e.conArchivo) {
                <button
                  type="button"
                  class="relative flex size-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2 p-0"
                  [attr.aria-label]="(e.tipo === 'VIDEO' ? 'Ver video de ' : 'Ver foto de ') + e.autor"
                  (click)="abrir(e)"
                >
                  @if (miniatura(e.id); as m) {
                    <img [src]="m" alt="" class="size-full object-cover" />
                  } @else {
                    <mat-icon class="text-subtle">{{ e.tipo === 'VIDEO' ? 'videocam' : 'image' }}</mat-icon>
                  }
                  @if (e.tipo === 'VIDEO') {
                    <span class="absolute inset-0 flex items-center justify-center bg-black/30 text-white"><mat-icon>play_circle</mat-icon></span>
                  }
                </button>
              } @else {
                <span class="flex size-20 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-subtle"><mat-icon>notes</mat-icon></span>
              }
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="text-sm font-semibold">{{ etiqueta(e) }}</span>
                <span class="text-xs text-subtle">{{ e.autor }} · {{ e.origen === 'SERENO' ? 'Sereno' : 'Ciudadano' }} · {{ e.creadoEn | date: 'HH:mm' }}</span>
                @if (e.observacion) { <span class="text-sm leading-snug text-muted">{{ e.observacion }}</span> }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class EvidenciasAlerta {
  private readonly api = inject(MonitoreoService);
  private readonly dialog = inject(MatDialog);

  readonly alertaId = input.required<number>();
  /** Cambia cuando la alerta cambia (historial nuevo): vuelve a pedir la lista. */
  readonly version = input(0);

  protected readonly lista = signal<Evidencia[]>([]);
  private readonly miniaturas = signal<Record<number, string>>({});

  constructor() {
    effect((alCerrar) => {
      this.version();
      const sub = this.api.evidencias(this.alertaId()).subscribe({
        next: (l) => {
          this.lista.set(l);
          this.cargarMiniaturas(l);
        },
        error: () => this.lista.set([]),
      });
      alCerrar(() => sub.unsubscribe());
    });
    inject(DestroyRef).onDestroy(() => Object.values(this.miniaturas()).forEach((u) => URL.revokeObjectURL(u)));
  }

  protected miniatura(id: number): string | undefined {
    return this.miniaturas()[id];
  }

  protected etiqueta(e: Evidencia): string {
    return e.tipo === 'FOTO' ? 'Foto' : e.tipo === 'VIDEO' ? 'Video' : 'Nota';
  }

  protected abrir(e: Evidencia): void {
    this.dialog.open(EvidenciaVisor, { data: e, width: '720px', maxWidth: '95vw' });
  }

  /** Solo las fotos tienen miniatura; cada archivo se pide una vez. */
  private cargarMiniaturas(lista: Evidencia[]): void {
    for (const e of lista.filter((x) => x.tipo === 'FOTO' && x.conArchivo && !this.miniaturas()[x.id])) {
      this.api.archivoEvidencia(e.id).subscribe({
        next: (blob) => this.miniaturas.update((m) => ({ ...m, [e.id]: URL.createObjectURL(blob) })),
        error: () => undefined,
      });
    }
  }
}
