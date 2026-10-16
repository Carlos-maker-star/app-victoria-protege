import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { startWith } from 'rxjs';
import { MonitoreoService } from '../../core/api/monitoreo.service';
import { MOTIVOS_CANCELACION, TIPOS } from '../../core/etiquetas';
import { Alerta } from '../../core/models';
import { NotificacionService } from '../../core/notificacion.service';

/** Cancelación de una alerta por la central: motivo obligatorio, queda en el historial con el nombre del operador. */
@Component({
  selector: 'app-cancelar-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatButton, MatFormField, MatLabel, MatError, MatInput, MatIcon, MatSelect, MatOption],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-start gap-4 px-6 pt-6">
      <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-peligro-bg text-peligro-fg">
        <mat-icon>report</mat-icon>
      </span>
      <div class="flex min-w-0 flex-col gap-1.5">
        <h2 class="m-0 text-lg font-semibold">¿Cancelar la alerta {{ codigo }}?</h2>
        <p class="m-0 text-sm text-muted">{{ tipo }}@if (alerta.referencia) { · {{ alerta.referencia }} }. Esta acción no se puede deshacer.</p>
      </div>
    </div>

    <mat-dialog-content class="flex flex-col gap-4 pt-4!">
      <div class="flex items-start gap-3 rounded-lg bg-curso-bg px-3.5 py-3 text-[13px] text-curso-fg">
        <mat-icon class="icono-sm mt-0.5">info</mat-icon>
        <span>
          <b>Qué pasará:</b>
          @if (alerta.unidadCodigo) { {{ alerta.unidadCodigo }} queda libre al instante, }
          el ciudadano recibe el aviso de cancelación y el motivo queda en el historial con tu nombre.
        </span>
      </div>

      <mat-form-field class="w-full">
        <mat-label>Motivo de la cancelación</mat-label>
        <mat-select [formControl]="motivo" required>
          @for (m of motivos; track m.codigo) {
            <mat-option [value]="m.codigo">{{ m.etiqueta }}</mat-option>
          }
        </mat-select>
        @if (motivo.hasError('required')) {
          <mat-error>Selecciona el motivo</mat-error>
        }
      </mat-form-field>

      <mat-form-field class="w-full">
        <mat-label>Observación {{ esOtro() ? '' : '(opcional)' }}</mat-label>
        <textarea matInput [formControl]="observacion" rows="3" maxlength="300" placeholder="Detalle de lo ocurrido…"></textarea>
        @if (observacion.hasError('required')) {
          <mat-error>Describe brevemente el motivo</mat-error>
        }
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close [disabled]="enviando()">Volver</button>
      <button matButton="filled" type="button" class="boton-peligro" [disabled]="enviando()" (click)="cancelar()">
        <mat-icon>block</mat-icon>Sí, cancelar alerta
      </button>
    </mat-dialog-actions>
  `,
})
export class CancelarDialog {
  protected readonly alerta = inject<Alerta>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<CancelarDialog, boolean>>(MatDialogRef);
  private readonly api = inject(MonitoreoService);
  private readonly notificar = inject(NotificacionService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly codigo = `ALR-${String(this.alerta.id).padStart(6, '0')}`;
  protected readonly tipo = TIPOS[this.alerta.tipo]?.nombre ?? this.alerta.tipoNombre;
  protected readonly motivos = MOTIVOS_CANCELACION;
  protected readonly enviando = signal(false);

  protected readonly motivo = this.fb.control('', Validators.required);
  protected readonly observacion = this.fb.control('', Validators.maxLength(300));

  private readonly motivoActual = toSignal(this.motivo.valueChanges.pipe(startWith('')), { initialValue: '' });
  /** "Otro motivo" exige describirlo. */
  protected readonly esOtro = computed(() => this.motivoActual() === 'OTRO');

  constructor() {
    this.motivo.valueChanges.subscribe((m) => {
      this.observacion.setValidators(m === 'OTRO' ? [Validators.required, Validators.maxLength(300)] : [Validators.maxLength(300)]);
      this.observacion.updateValueAndValidity();
    });
  }

  protected cancelar(): void {
    this.motivo.markAsTouched();
    this.observacion.markAsTouched();
    if (this.motivo.invalid || this.observacion.invalid) {
      return;
    }
    this.enviando.set(true);
    this.api
      .cancelar(this.alerta.id, { motivo: this.motivo.value, observacion: this.observacion.value.trim() || null })
      .subscribe({
        next: () => {
          this.notificar.exito(`Alerta ${this.codigo} cancelada.`);
          this.ref.close(true);
        },
        error: () => this.enviando.set(false),
      });
  }
}
