import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeDeError } from '../../core/http/errores';
import { CampoContrasena } from '../../shared/campo-contrasena';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatFormField, MatLabel, MatError, MatInput, MatButton, MatProgressBar, AuthLayout, CampoContrasena],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-layout>
      <form [formGroup]="form" (ngSubmit)="ingresar()" class="flex flex-col gap-6" novalidate>
        <div class="flex flex-col gap-2">
          <h1 class="m-0 text-[28px] font-semibold tracking-tight">Inicia sesión</h1>
          <p class="m-0 text-[15px] text-muted">Acceso para personal de central, supervisión y administración.</p>
        </div>

        @if (sesion() === 'expirada') {
          <p class="m-0 rounded-lg bg-curso-bg px-3 py-2 text-sm text-curso-fg" role="status">
            Tu sesión expiró. Vuelve a iniciar sesión.
          </p>
        }
        @if (error()) {
          <p class="m-0 rounded-lg bg-peligro-bg px-3 py-2 text-sm text-peligro-fg" role="alert">{{ error() }}</p>
        }

        <div class="flex flex-col gap-4">
          <mat-form-field>
            <mat-label>DNI o correo institucional</mat-label>
            <input matInput formControlName="usuario" autocomplete="username" />
            @if (form.controls.usuario.hasError('required')) {
              <mat-error>Este campo es obligatorio</mat-error>
            }
          </mat-form-field>
          <app-campo-contrasena [control]="form.controls.password" />
        </div>

        <div class="flex flex-col gap-2">
          <button matButton="filled" type="submit" class="h-11!" [disabled]="cargando()">Ingresar</button>
          @if (cargando()) {
            <mat-progress-bar mode="indeterminate" />
          }
        </div>
      </form>
    </app-auth-layout>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query param `?sesion=expirada` que pone AuthService.logout(). */
  readonly sesion = input<string>();

  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    usuario: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected ingresar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { usuario, password } = this.form.getRawValue();
    this.cargando.set(true);
    this.error.set(null);
    this.auth.login(usuario.trim(), password).subscribe({
      next: () => this.router.navigate(['/monitoreo']),
      error: (err) => {
        this.error.set(mensajeDeError(err));
        this.cargando.set(false);
      },
    });
  }
}
