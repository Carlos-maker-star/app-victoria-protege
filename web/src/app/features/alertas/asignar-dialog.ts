import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { startWith } from 'rxjs';
import { MonitoreoService } from '../../core/api/monitoreo.service';
import { ESTADOS_UNIDAD, TIPOS } from '../../core/etiquetas';
import { Alerta, Candidata } from '../../core/models';
import { NotificacionService } from '../../core/notificacion.service';
import { TiempoRelativoPipe } from '../../shared/tiempo-relativo.pipe';

/**
 * La central elige a mano la unidad de una alerta (típicamente una escalada por falta de unidades).
 * Solo se pueden elegir unidades disponibles; las demás se muestran atenuadas con su motivo.
 */
@Component({
  selector: 'app-asignar-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatButton, MatFormField, MatLabel, MatError, MatHint, MatInput, MatIcon, MatProgressBar, TiempoRelativoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="flex! flex-col items-start gap-0.5">
      Asignar unidad manualmente
      <span class="text-[13px] font-normal text-muted">
        <span class="font-mono">{{ codigo }}</span> · {{ tipo }}@if (alerta.referencia) { · {{ alerta.referencia }} }
      </span>
    </h2>

    <mat-dialog-content class="flex flex-col gap-4">
      @if (alerta.estado === 'SIN_UNIDAD') {
        <div class="flex items-start gap-3 rounded-lg bg-peligro-bg px-3.5 py-3 text-[13px] text-peligro-fg" role="alert">
          <mat-icon class="icono-sm mt-0.5">warning</mat-icon>
          <span><b>Escalada a la central.</b> No hubo unidades disponibles y la alerta sigue sin atender.</span>
        </div>
      } @else if (alerta.estado === 'ASIGNADA') {
        <div class="flex items-start gap-3 rounded-lg bg-curso-bg px-3.5 py-3 text-[13px] text-curso-fg">
          <mat-icon class="icono-sm mt-0.5">info</mat-icon>
          <span>
            Esta alerta espera la respuesta de <b>{{ alerta.unidadCodigo }}</b>. Si eliges otra unidad, esa asignación se retira.
          </span>
        </div>
      }

      <div class="flex flex-col gap-2">
        <span class="text-[13px] font-medium">Unidades cercanas <span class="text-critico">*</span></span>
        @if (cargando()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <div role="radiogroup" aria-label="Unidades" class="flex flex-col gap-2">
          @for (c of candidatas(); track c.id) {
            <button
              type="button"
              role="radio"
              class="flex w-full items-center gap-3 rounded-[10px] border bg-surface px-3.5 py-2.5 text-left font-sans text-ink enabled:cursor-pointer disabled:opacity-55"
              [class]="seleccionada() === c.id ? 'border-primary bg-primary-soft! ring-1 ring-primary' : 'border-line'"
              [attr.aria-checked]="seleccionada() === c.id"
              [disabled]="!c.asignable"
              (click)="seleccionada.set(c.id)"
            >
              <span class="size-[18px] shrink-0 rounded-full border-2" [class]="seleccionada() === c.id ? 'border-[5px] border-primary' : 'border-line'" aria-hidden="true"></span>
              <i class="size-3 shrink-0 rounded-[3px]" [class]="punto(c)"></i>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm"><b>{{ c.codigo }}</b> · {{ c.sereno ?? 'Sin sereno' }}</span>
                <span class="truncate text-xs text-subtle">
                  @if (c.asignable) {
                    Disponible@if (c.ubicacionEn) { · posición {{ c.ubicacionEn | tiempoRelativo }} }
                  } @else {
                    {{ c.motivoNoDisponible }}
                  }
                </span>
              </span>
              <span class="flex shrink-0 flex-col text-right text-sm">
                <b>{{ distancia(c) }}</b>
                <span class="text-xs text-subtle">{{ eta(c) }}</span>
              </span>
            </button>
          } @empty {
            @if (!cargando()) {
              <p class="m-0 rounded-lg bg-surface-2 px-3.5 py-3 text-sm text-muted">No hay unidades registradas.</p>
            }
          }
        </div>
        <span class="text-xs text-subtle">Ordenadas por distancia en línea recta. Solo se pueden elegir unidades disponibles.</span>
        @if (!cargando() && candidatas().length > 0 && !hayAsignables()) {
          <p class="m-0 rounded-lg bg-curso-bg px-3.5 py-2.5 text-[13px] text-curso-fg">
            Ninguna unidad está disponible ahora. Cuando un sereno quede libre, la alerta se asignará sola o podrás volver a elegir.
          </p>
        }
      </div>

      <mat-form-field class="w-full">
        <mat-label>Motivo de la asignación manual</mat-label>
        <textarea matInput [formControl]="motivo" rows="3" maxlength="200" placeholder="Ej.: SV-003 está a pocas cuadras y el motor no tenía unidades."></textarea>
        <mat-hint>Queda registrado en el historial de la alerta, con tu nombre.</mat-hint>
        @if (motivo.hasError('required')) {
          <mat-error>Indica el motivo</mat-error>
        }
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close [disabled]="enviando()">Cancelar</button>
      <button matButton="filled" type="button" [disabled]="!puedeEnviar()" (click)="asignar()">
        <mat-icon>send</mat-icon>{{ etiquetaBoton() }}
      </button>
    </mat-dialog-actions>
  `,
})
export class AsignarDialog {
  protected readonly alerta = inject<Alerta>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<AsignarDialog, boolean>>(MatDialogRef);
  private readonly api = inject(MonitoreoService);
  private readonly notificar = inject(NotificacionService);

  protected readonly codigo = `ALR-${String(this.alerta.id).padStart(6, '0')}`;
  protected readonly tipo = TIPOS[this.alerta.tipo]?.nombre ?? this.alerta.tipoNombre;

  protected readonly candidatas = signal<Candidata[]>([]);
  protected readonly seleccionada = signal<number | null>(null);
  protected readonly cargando = signal(true);
  protected readonly enviando = signal(false);
  protected readonly motivo = inject(NonNullableFormBuilder).control('', [Validators.required, Validators.maxLength(200)]);

  /** Texto del motivo como signal, para que el botón reaccione mientras se escribe. */
  private readonly textoMotivo = toSignal(this.motivo.valueChanges.pipe(startWith('')), { initialValue: '' });

  protected readonly hayAsignables = computed(() => this.candidatas().some((c) => c.asignable));
  protected readonly elegida = computed(() => this.candidatas().find((c) => c.id === this.seleccionada()) ?? null);
  protected readonly etiquetaBoton = computed(() => `Asignar a ${this.elegida()?.codigo ?? 'unidad'}`);
  protected readonly puedeEnviar = computed(
    () => this.elegida() !== null && !this.enviando() && this.textoMotivo().trim().length > 0,
  );

  constructor() {
    this.cargar();
  }

  protected punto(c: Candidata): string {
    return ESTADOS_UNIDAD[c.estado].punto;
  }

  protected distancia(c: Candidata): string {
    if (c.distanciaM === null) {
      return 'Sin posición';
    }
    return c.distanciaM >= 1000 ? `${(c.distanciaM / 1000).toFixed(1)} km` : `${c.distanciaM} m`;
  }

  protected eta(c: Candidata): string {
    return c.asignable && c.etaSegundos !== null ? `~${Math.max(1, Math.round(c.etaSegundos / 60))} min` : '—';
  }

  protected asignar(): void {
    const unidad = this.elegida();
    if (!unidad || this.motivo.invalid) {
      this.motivo.markAsTouched();
      return;
    }
    this.enviando.set(true);
    this.api.asignar(this.alerta.id, { unidadId: unidad.id, motivo: this.motivo.value.trim() }).subscribe({
      next: () => {
        this.notificar.exito(`Alerta asignada a ${unidad.codigo}. Espera su respuesta.`);
        this.ref.close(true);
      },
      error: () => {
        // El aviso de error lo muestra el interceptor; se refresca la lista por si la unidad dejó de estar libre
        this.enviando.set(false);
        this.cargar();
      },
    });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.api.candidatas(this.alerta.id).subscribe({
      next: (lista) => {
        this.candidatas.set(lista);
        const actual = this.seleccionada();
        const sigueLibre = lista.some((c) => c.id === actual && c.asignable);
        // Por defecto, la unidad disponible más cercana
        this.seleccionada.set(sigueLibre ? actual : (lista.find((c) => c.asignable)?.id ?? null));
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
