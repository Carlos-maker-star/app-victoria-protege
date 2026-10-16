import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AdminService } from '../../core/api/admin.service';
import { UsuarioAdmin } from '../../core/models';
import { NotificacionService } from '../../core/notificacion.service';
import { CampoContrasena } from '../../shared/campo-contrasena';

/** El administrador fija una clave nueva para un usuario (por ejemplo, si la olvidó). */
@Component({
  selector: 'app-clave-dialog',
  imports: [MatDialogModule, MatButton, CampoContrasena],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="flex! flex-col items-start gap-0.5">
      Reiniciar contraseña
      <span class="text-[13px] font-normal text-muted">{{ usuario.nombres }} {{ usuario.apellidos }} · DNI {{ usuario.dni }}</span>
    </h2>
    <mat-dialog-content class="flex flex-col gap-3">
      <app-campo-contrasena [control]="clave" etiqueta="Contraseña nueva" autocomplete="new-password" ayuda="Mínimo 8 caracteres. Compártela por un canal seguro." />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close [disabled]="enviando()">Cancelar</button>
      <button matButton="filled" type="button" [disabled]="enviando()" (click)="guardar()">Guardar contraseña</button>
    </mat-dialog-actions>
  `,
})
export class ClaveDialog {
  protected readonly usuario = inject<UsuarioAdmin>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ClaveDialog, boolean>>(MatDialogRef);
  private readonly admin = inject(AdminService);
  private readonly notificar = inject(NotificacionService);

  protected readonly clave = inject(NonNullableFormBuilder).control('', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]);
  protected readonly enviando = signal(false);

  protected guardar(): void {
    if (this.clave.invalid) {
      this.clave.markAsTouched();
      return;
    }
    this.enviando.set(true);
    this.admin.reiniciarClave(this.usuario.id, this.clave.value).subscribe({
      next: () => {
        this.notificar.exito('Contraseña actualizada.');
        this.ref.close(true);
      },
      error: () => this.enviando.set(false),
    });
  }
}
