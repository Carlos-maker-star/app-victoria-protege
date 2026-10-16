import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeDeError } from '../../core/http/errores';
import { NotificacionService } from '../../core/notificacion.service';
import { CampoContrasena } from '../../shared/campo-contrasena';

/** «Mi cuenta»: datos de la sesión y cambio de contraseña. Disponible para todos los roles de la web. */
@Component({
  selector: 'app-cuenta',
  imports: [ReactiveFormsModule, MatButton, CampoContrasena],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex max-w-xl flex-col gap-6">
      <div class="flex flex-col gap-1.5">
        <h1 class="m-0 text-[28px] font-semibold tracking-tight">Mi cuenta</h1>
        <p class="m-0 text-sm text-muted">{{ auth.nombre() }} · DNI {{ auth.usuario()?.dni }}</p>
      </div>

      <form [formGroup]="form" (ngSubmit)="guardar()" class="flex flex-col gap-2 rounded-xl border border-line bg-surface px-6 py-5" novalidate>
        <h2 class="m-0 mb-2 text-base font-semibold">Cambiar contraseña</h2>
        @if (error()) {
          <p class="m-0 mb-2 rounded-lg bg-peligro-bg px-3 py-2 text-sm text-peligro-fg" role="alert">{{ error() }}</p>
        }
        <app-campo-contrasena [control]="form.controls.actual" etiqueta="Contraseña actual" autocomplete="current-password" />
        <app-campo-contrasena [control]="form.controls.nueva" etiqueta="Contraseña nueva" autocomplete="new-password" ayuda="Mínimo 8 caracteres." />
        <app-campo-contrasena [control]="form.controls.repetir" etiqueta="Repite la contraseña nueva" autocomplete="new-password" />
        <div class="flex justify-end pt-2">
          <button matButton="filled" type="submit" [disabled]="enviando()">Guardar contraseña</button>
        </div>
        <p class="m-0 text-xs text-subtle">Tu sesión actual sigue abierta. Si sospechas que alguien más la conoce, también cierra sesión en otros equipos.</p>
      </form>
    </div>
  `,
})
export class Cuenta {
  protected readonly auth = inject(AuthService);
  private readonly notificar = inject(NotificacionService);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    actual: ['', Validators.required],
    nueva: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
    repetir: ['', Validators.required],
  });

  protected guardar(): void {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { actual, nueva, repetir } = this.form.getRawValue();
    if (nueva !== repetir) {
      this.form.controls.repetir.setErrors({ mensaje: 'Las contraseñas no coinciden' });
      this.form.controls.repetir.markAsTouched();
      return;
    }
    this.enviando.set(true);
    this.auth.cambiarClave(actual, nueva).subscribe({
      next: () => {
        this.notificar.exito('Contraseña actualizada.');
        this.form.reset();
        this.enviando.set(false);
      },
      error: (err) => {
        this.error.set(mensajeDeError(err));
        this.enviando.set(false);
      },
    });
  }
}
