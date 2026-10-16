import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { AdminService } from '../../core/api/admin.service';
import { ROLES } from '../../core/etiquetas';
import { Rol, UsuarioAdmin } from '../../core/models';
import { NotificacionService } from '../../core/notificacion.service';
import { CampoContrasena } from '../../shared/campo-contrasena';

/** Alta (data = null) o edición de un usuario. El DNI y la clave solo se piden al crear. */
@Component({
  selector: 'app-usuario-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatButton, MatFormField, MatLabel, MatError, MatHint, MatInput, MatSelect, MatOption, CampoContrasena],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="flex! flex-col items-start gap-0.5">
      {{ editando ? 'Editar usuario' : 'Nuevo usuario' }}
      <span class="text-[13px] font-normal text-muted">
        {{ editando ? 'DNI ' + datos?.dni : 'Los ciudadanos se registran solos desde la app. Aquí se crea el personal.' }}
      </span>
    </h2>

    <mat-dialog-content class="flex flex-col gap-4">
      <form [formGroup]="form" class="flex flex-col gap-4" (ngSubmit)="guardar()" novalidate>
        <div class="grid gap-4 sm:grid-cols-2">
          <mat-form-field>
            <mat-label>Nombres</mat-label>
            <input matInput formControlName="nombres" />
            @if (form.controls.nombres.hasError('required')) { <mat-error>Obligatorio</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Apellidos</mat-label>
            <input matInput formControlName="apellidos" />
            @if (form.controls.apellidos.hasError('required')) { <mat-error>Obligatorio</mat-error> }
          </mat-form-field>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          @if (!editando) {
            <mat-form-field>
              <mat-label>DNI</mat-label>
              <input matInput formControlName="dni" inputmode="numeric" maxlength="8" />
              @if (form.controls.dni.invalid) { <mat-error>8 dígitos</mat-error> }
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>Teléfono (opcional)</mat-label>
            <input matInput formControlName="telefono" inputmode="numeric" maxlength="9" />
            @if (form.controls.telefono.invalid) { <mat-error>9 dígitos</mat-error> }
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>Correo (opcional)</mat-label>
          <input matInput type="email" formControlName="email" />
          @if (form.controls.email.invalid) { <mat-error>Correo no válido</mat-error> }
        </mat-form-field>
        <mat-form-field>
          <mat-label>Rol</mat-label>
          <mat-select formControlName="rol">
            @for (r of roles; track r.codigo) { <mat-option [value]="r.codigo">{{ r.etiqueta }}</mat-option> }
          </mat-select>
          <mat-hint>{{ ayudaRol() }}</mat-hint>
        </mat-form-field>
        @if (!editando) {
          <app-campo-contrasena [control]="form.controls.password" etiqueta="Contraseña temporal" autocomplete="new-password" ayuda="Mínimo 8 caracteres. Compártela con la persona por un canal seguro." />
        }
        @if (error()) {
          <p class="m-0 rounded-lg bg-peligro-bg px-3 py-2 text-sm text-peligro-fg" role="alert">{{ error() }}</p>
        }
        <button type="submit" hidden>Guardar</button>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close [disabled]="enviando()">Cancelar</button>
      <button matButton="filled" type="button" [disabled]="enviando()" (click)="guardar()">{{ editando ? 'Guardar cambios' : 'Crear usuario' }}</button>
    </mat-dialog-actions>
  `,
})
export class UsuarioDialog {
  protected readonly datos = inject<UsuarioAdmin | null>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<UsuarioDialog, boolean>>(MatDialogRef);
  private readonly admin = inject(AdminService);
  private readonly notificar = inject(NotificacionService);

  protected readonly editando = this.datos !== null;
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly roles = (Object.entries(ROLES) as [Rol, string][]).map(([codigo, etiqueta]) => ({ codigo, etiqueta }));

  protected readonly form = inject(NonNullableFormBuilder).group({
    dni: [this.datos?.dni ?? '', this.editando ? [] : [Validators.required, Validators.pattern(/^\d{8}$/)]],
    nombres: [this.datos?.nombres ?? '', [Validators.required, Validators.maxLength(100)]],
    apellidos: [this.datos?.apellidos ?? '', [Validators.required, Validators.maxLength(100)]],
    email: [this.datos?.email ?? '', [Validators.email, Validators.maxLength(150)]],
    telefono: [this.datos?.telefono ?? '', [Validators.pattern(/^(\d{9})?$/)]],
    rol: [this.datos?.rol ?? ('SERENO' as Rol), Validators.required],
    password: ['', this.editando ? [] : [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
  });

  protected ayudaRol(): string {
    switch (this.form.controls.rol.value) {
      case 'SERENO': return 'Usa la app móvil de serenazgo; se le asigna una unidad.';
      case 'CIUDADANO': return 'Usa la app móvil del vecino.';
      case 'OPERADOR': return 'Atiende la central: mapa, alertas y asignación manual.';
      case 'SUPERVISOR': return 'Como el operador, además supervisa reportes.';
      default: return 'Acceso total: usuarios, unidades y configuración.';
    }
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const base = {
      nombres: v.nombres.trim(),
      apellidos: v.apellidos.trim(),
      email: v.email.trim() || null,
      telefono: v.telefono.trim() || null,
      rol: v.rol,
    };
    this.enviando.set(true);
    this.error.set(null);
    const peticion = this.datos
      ? this.admin.actualizarUsuario(this.datos.id, base)
      : this.admin.crearUsuario({ ...base, dni: v.dni, password: v.password });
    peticion.subscribe({
      next: () => {
        this.notificar.exito(this.editando ? 'Usuario actualizado.' : 'Usuario creado.');
        this.ref.close(true);
      },
      error: () => this.enviando.set(false), // el interceptor ya muestra el motivo
    });
  }
}
