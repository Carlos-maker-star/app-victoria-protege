import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';

/**
 * Campo de contraseña con botón de ojo para mostrar u ocultar lo escrito.
 * Úsalo en TODA contraseña (login, cambio de contraseña, alta de usuarios).
 * Errores: required, minlength o un `{ mensaje: '...' }` propio del control.
 */
@Component({
  selector: 'app-campo-contrasena',
  imports: [ReactiveFormsModule, MatFormField, MatLabel, MatError, MatHint, MatInput, MatIconButton, MatIcon, MatSuffix],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field class="w-full">
      <mat-label>{{ etiqueta() }}</mat-label>
      <input matInput [type]="visible() ? 'text' : 'password'" [formControl]="control()" [attr.autocomplete]="autocomplete()" />
      <button
        matSuffix
        matIconButton
        type="button"
        class="mr-1"
        (click)="visible.set(!visible())"
        [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
        [attr.aria-pressed]="visible()"
      >
        <mat-icon>{{ visible() ? 'visibility_off' : 'visibility' }}</mat-icon>
      </button>
      @if (ayuda()) {
        <mat-hint>{{ ayuda() }}</mat-hint>
      }
      @if (control().hasError('required')) {
        <mat-error>Este campo es obligatorio</mat-error>
      } @else if (control().hasError('minlength')) {
        <mat-error>Mínimo {{ control().getError('minlength').requiredLength }} caracteres</mat-error>
      } @else if (control().getError('mensaje'); as mensaje) {
        <mat-error>{{ mensaje }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class CampoContrasena {
  readonly control = input.required<FormControl<string>>();
  readonly etiqueta = input('Contraseña');
  readonly autocomplete = input('current-password');
  readonly ayuda = input('');

  protected readonly visible = signal(false);
}
