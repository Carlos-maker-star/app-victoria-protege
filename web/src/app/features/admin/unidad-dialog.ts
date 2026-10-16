import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { AdminService } from '../../core/api/admin.service';
import { TipoUnidad, UnidadAdmin, UsuarioAdmin, ZonaAdmin } from '../../core/models';
import { NotificacionService } from '../../core/notificacion.service';

const TIPOS: { codigo: TipoUnidad; etiqueta: string }[] = [
  { codigo: 'CAMIONETA', etiqueta: 'Camioneta' },
  { codigo: 'MOTO', etiqueta: 'Moto' },
  { codigo: 'PATRULLERO', etiqueta: 'Patrullero' },
  { codigo: 'OTRO', etiqueta: 'Otro' },
];

interface OpcionSereno {
  id: number;
  nombre: string;
}

/** Alta (data = null) o edición de una unidad y del sereno que la opera. */
@Component({
  selector: 'app-unidad-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatButton, MatFormField, MatLabel, MatError, MatHint, MatInput, MatSelect, MatOption],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="flex! flex-col items-start gap-0.5">
      {{ editando ? 'Editar unidad ' + datos?.codigo : 'Nueva unidad' }}
      <span class="text-[13px] font-normal text-muted">Vehículo o moto de serenazgo que aparecerá en el mapa.</span>
    </h2>

    <mat-dialog-content class="flex flex-col gap-4">
      <form [formGroup]="form" class="flex flex-col gap-4" (ngSubmit)="guardar()" novalidate>
        <div class="grid gap-4 sm:grid-cols-2">
          @if (!editando) {
            <mat-form-field>
              <mat-label>Código</mat-label>
              <input matInput formControlName="codigo" placeholder="SV-007" (input)="mayusculas()" />
              <mat-hint>Único. Letras mayúsculas, números y guiones.</mat-hint>
              @if (form.controls.codigo.invalid) { <mat-error>3 a 20 caracteres: A–Z, 0–9 y guion</mat-error> }
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>Placa (opcional)</mat-label>
            <input matInput formControlName="placa" maxlength="10" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="tipo">
            @for (t of tipos; track t.codigo) { <mat-option [value]="t.codigo">{{ t.etiqueta }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Sereno asignado</mat-label>
          <mat-select formControlName="serenoId">
            <mat-option [value]="null">Sin sereno</mat-option>
            @for (s of serenos(); track s.id) { <mat-option [value]="s.id">{{ s.nombre }}</mat-option> }
          </mat-select>
          <mat-hint>Un sereno opera una sola unidad. Solo aparecen serenos sin unidad.</mat-hint>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Sector base</mat-label>
          <mat-select formControlName="zonaId">
            <mat-option [value]="null">Sin sector</mat-option>
            @for (z of sectores(); track z.id) { <mat-option [value]="z.id">{{ z.nombre }}</mat-option> }
          </mat-select>
          <mat-hint>Zona donde patrulla normalmente. Es informativo: la asignación sigue usando la distancia.</mat-hint>
        </mat-form-field>
        @if (!editando) {
          <p class="m-0 rounded-lg bg-nuevo-bg px-3 py-2.5 text-[13px] text-nuevo-fg">
            La unidad nace <b>Fuera de servicio</b>. Pasa a <b>Disponible</b> cuando su sereno inicia sesión y comparte su ubicación.
          </p>
        }
        <button type="submit" hidden>Guardar</button>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close [disabled]="enviando()">Cancelar</button>
      <button matButton="filled" type="button" [disabled]="enviando()" (click)="guardar()">{{ editando ? 'Guardar cambios' : 'Crear unidad' }}</button>
    </mat-dialog-actions>
  `,
})
export class UnidadDialog {
  protected readonly datos = inject<UnidadAdmin | null>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<UnidadDialog, boolean>>(MatDialogRef);
  private readonly admin = inject(AdminService);
  private readonly notificar = inject(NotificacionService);

  protected readonly editando = this.datos !== null;
  protected readonly tipos = TIPOS;
  protected readonly enviando = signal(false);
  /** Serenos libres, más el que ya opera esta unidad (para poder mantenerlo). */
  protected readonly serenos = signal<OpcionSereno[]>(
    this.datos?.serenoId ? [{ id: this.datos.serenoId, nombre: this.datos.sereno ?? 'Sereno actual' }] : [],
  );

  protected readonly sectores = signal<ZonaAdmin[]>([]);

  protected readonly form = inject(NonNullableFormBuilder).group({
    codigo: ['', this.editando ? [] : [Validators.required, Validators.pattern(/^[A-Z0-9-]{3,20}$/)]],
    placa: [this.datos?.placa ?? '', Validators.maxLength(10)],
    tipo: [this.datos?.tipo ?? ('CAMIONETA' as TipoUnidad), Validators.required],
    serenoId: [this.datos?.serenoId ?? (null as number | null)],
    zonaId: [this.datos?.zonaId ?? (null as number | null)],
  });

  constructor() {
    this.admin.zonas().subscribe((lista) => this.sectores.set(lista.filter((z) => z.tipo === 'SECTOR' && z.activo)));
    this.admin.usuarios({ rol: 'SERENO', sinUnidad: true }).subscribe((lista: UsuarioAdmin[]) => {
      const actual = this.serenos();
      const libres = lista.filter((u) => !actual.some((a) => a.id === u.id)).map((u) => ({ id: u.id, nombre: `${u.nombres} ${u.apellidos}` }));
      this.serenos.set([...actual, ...libres]);
    });
  }

  protected mayusculas(): void {
    const c = this.form.controls.codigo;
    c.setValue(c.value.toUpperCase(), { emitEvent: false });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const base = { placa: v.placa.trim() || null, tipo: v.tipo, serenoId: v.serenoId, zonaId: v.zonaId };
    this.enviando.set(true);
    const peticion = this.datos
      ? this.admin.actualizarUnidad(this.datos.id, base)
      : this.admin.crearUnidad({ ...base, codigo: v.codigo.trim() });
    peticion.subscribe({
      next: () => {
        this.notificar.exito(this.editando ? 'Unidad actualizada.' : 'Unidad creada.');
        this.ref.close(true);
      },
      error: () => this.enviando.set(false),
    });
  }
}
