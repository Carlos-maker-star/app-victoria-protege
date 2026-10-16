import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { GenerarCuadricula } from '../../core/models';

export interface NombreSectorDatos {
  titulo: string;
  nombre: string;
  confirmar: string;
}

/** Pide el nombre de un sector (al crearlo o renombrarlo). Se cierra con el nombre, o sin valor si se cancela. */
@Component({
  selector: 'app-nombre-sector-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatButton, MatFormField, MatLabel, MatError, MatInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ datos.titulo }}</h2>
    <mat-dialog-content>
      <form (ngSubmit)="aceptar()" novalidate>
        <mat-form-field class="w-full">
          <mat-label>Nombre del sector</mat-label>
          <input matInput [formControl]="nombre" maxlength="80" placeholder="Sector Norte" />
          @if (nombre.invalid) { <mat-error>Escribe un nombre (hasta 80 caracteres)</mat-error> }
        </mat-form-field>
        <button type="submit" hidden>Aceptar</button>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancelar</button>
      <button matButton="filled" type="button" (click)="aceptar()">{{ datos.confirmar }}</button>
    </mat-dialog-actions>
  `,
})
export class NombreSectorDialog {
  protected readonly datos = inject<NombreSectorDatos>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<NombreSectorDialog, string>>(MatDialogRef);
  protected readonly nombre = inject(NonNullableFormBuilder).control(this.datos.nombre, [
    Validators.required,
    Validators.maxLength(80),
    Validators.pattern(/\S/),
  ]);

  protected aceptar(): void {
    if (this.nombre.invalid) {
      this.nombre.markAsTouched();
      return;
    }
    this.ref.close(this.nombre.value.trim());
  }
}

export interface CuadriculaDatos {
  /** true si ya hay sectores activos (la cuadrícula los reemplazaría). */
  hayActivos: boolean;
}

/** Elige filas y columnas para dividir el distrito en sectores. Se cierra con los parámetros, o sin valor. */
@Component({
  selector: 'app-cuadricula-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatButton, MatFormField, MatLabel, MatError, MatHint, MatInput, MatCheckbox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="flex! flex-col items-start gap-0.5">
      Generar sectores en cuadrícula
      <span class="text-[13px] font-normal text-muted">Divide el distrito en filas × columnas, recortadas a su límite.</span>
    </h2>
    <mat-dialog-content class="flex flex-col gap-4">
      <form [formGroup]="form" class="flex flex-col gap-4" (ngSubmit)="aceptar()" novalidate>
        <div class="grid gap-4 sm:grid-cols-2">
          <mat-form-field>
            <mat-label>Filas</mat-label>
            <input matInput type="number" min="1" max="5" formControlName="filas" />
            @if (form.controls.filas.invalid) { <mat-error>De 1 a 5</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Columnas</mat-label>
            <input matInput type="number" min="1" max="5" formControlName="columnas" />
            @if (form.controls.columnas.invalid) { <mat-error>De 1 a 5</mat-error> }
            <mat-hint>Las celdas casi vacías se descartan.</mat-hint>
          </mat-form-field>
        </div>
        @if (datos.hayActivos) {
          <mat-checkbox formControlName="reemplazar">
            Reemplazar los sectores activos (se desactivan; las alertas se reubican en los nuevos)
          </mat-checkbox>
        }
        <button type="submit" hidden>Generar</button>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancelar</button>
      <button matButton="filled" type="button" [disabled]="datos.hayActivos && !form.controls.reemplazar.value" (click)="aceptar()">Generar</button>
    </mat-dialog-actions>
  `,
})
export class CuadriculaDialog {
  protected readonly datos = inject<CuadriculaDatos>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<CuadriculaDialog, GenerarCuadricula>>(MatDialogRef);
  protected readonly form = inject(NonNullableFormBuilder).group({
    filas: [2, [Validators.required, Validators.min(1), Validators.max(5)]],
    columnas: [2, [Validators.required, Validators.min(1), Validators.max(5)]],
    reemplazar: [false],
  });

  protected aceptar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.ref.close({ filas: Number(v.filas), columnas: Number(v.columnas), reemplazar: v.reemplazar });
  }
}
