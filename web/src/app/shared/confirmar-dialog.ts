import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmarDatos {
  titulo: string;
  mensaje: string;
  confirmar: string;
  peligro?: boolean;
}

/** Diálogo genérico de confirmación. Se cierra con `true` si el usuario confirma. */
@Component({
  selector: 'app-confirmar-dialog',
  imports: [MatDialogModule, MatButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ datos.titulo }}</h2>
    <mat-dialog-content>
      <p class="m-0 text-sm leading-relaxed text-muted">{{ datos.mensaje }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" [class.boton-peligro]="datos.peligro" [mat-dialog-close]="true">
        {{ datos.confirmar }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmarDialog {
  protected readonly datos = inject<ConfirmarDatos>(MAT_DIALOG_DATA);
}
