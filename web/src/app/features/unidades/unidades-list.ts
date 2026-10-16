import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatFormField } from '@angular/material/form-field';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { ESTADOS_UNIDAD } from '../../core/etiquetas';
import { EstadoUnidad } from '../../core/models';
import { MonitoreoStore } from '../../core/monitoreo.store';
import { Avatar } from '../../shared/avatar';
import { EstadoUnidadBadge } from '../../shared/badges';
import { TiempoRelativoPipe } from '../../shared/tiempo-relativo.pipe';

@Component({
  selector: 'app-unidades-list',
  imports: [ReactiveFormsModule, RouterLink, MatIcon, MatInput, MatFormField, Avatar, EstadoUnidadBadge, TiempoRelativoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unidades-list.html',
})
export class UnidadesList {
  protected readonly store = inject(MonitoreoStore);

  protected readonly busqueda = new FormControl('', { nonNullable: true });
  private readonly texto = toSignal(this.busqueda.valueChanges.pipe(debounceTime(250)), { initialValue: '' });
  protected readonly filtro = signal<EstadoUnidad | null>(null);

  protected readonly estados = Object.entries(ESTADOS_UNIDAD).map(([clave, info]) => ({
    clave: clave as EstadoUnidad,
    etiqueta: info.etiqueta,
    punto: info.punto,
  }));

  protected readonly cuentas = computed(() => {
    const c: Record<string, number> = {};
    for (const u of this.store.unidades()) {
      c[u.estado] = (c[u.estado] ?? 0) + 1;
    }
    return c;
  });

  protected readonly filtradas = computed(() => {
    const q = this.texto().trim().toLowerCase();
    const estado = this.filtro();
    return this.store.unidades().filter(
      (u) =>
        (!estado || u.estado === estado) &&
        (!q || [u.codigo, u.placa, u.sereno].filter(Boolean).some((c) => (c as string).toLowerCase().includes(q))),
    );
  });

  protected punto(estado: EstadoUnidad): string {
    return ESTADOS_UNIDAD[estado].punto;
  }

  protected codigo(id: number): string {
    return `ALR-${String(id).padStart(6, '0')}`;
  }
}
