import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { MonitoreoService } from '../../core/api/monitoreo.service';
import { ESTADOS_ALERTA, ESTADOS_FINALES, iconoDeTipo, TIPOS } from '../../core/etiquetas';
import { Alerta, EstadoAlerta } from '../../core/models';
import { MonitoreoStore } from '../../core/monitoreo.store';
import { EstadoAlertaBadge, PrioridadBadge } from '../../shared/badges';

@Component({
  selector: 'app-alertas-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButton,
    MatFormField,
    MatLabel,
    MatIcon,
    MatInput,
    MatSelect,
    MatOption,
    MatProgressBar,
    EstadoAlertaBadge,
    PrioridadBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alertas-list.html',
})
export class AlertasList {
  private readonly api = inject(MonitoreoService);
  private readonly store = inject(MonitoreoStore);

  protected readonly busqueda = new FormControl('', { nonNullable: true });
  private readonly texto = toSignal(this.busqueda.valueChanges.pipe(debounceTime(250)), { initialValue: '' });
  protected readonly estado = signal<EstadoAlerta | 'ACTIVAS' | null>(null);
  protected readonly tipo = signal<string | null>(null);

  protected readonly alertas = signal<Alerta[]>([]);
  protected readonly cargando = signal(false);

  protected readonly estados = Object.entries(ESTADOS_ALERTA)
    .filter(([clave]) => clave !== 'BUSCANDO_UNIDAD')
    .map(([clave, info]) => ({ clave: clave as EstadoAlerta, etiqueta: info.etiqueta }));
  protected readonly tipos = Object.entries(TIPOS).map(([clave, t]) => ({ clave, nombre: t.nombre }));

  protected readonly filtradas = computed(() => {
    const q = this.texto().trim().toLowerCase();
    const estado = this.estado();
    const tipo = this.tipo();
    return this.alertas().filter((a) => {
      if (estado === 'ACTIVAS' && ESTADOS_FINALES.includes(a.estado)) {
        return false;
      }
      if (estado && estado !== 'ACTIVAS' && a.estado !== estado && !(estado === 'CREADA' && a.estado === 'BUSCANDO_UNIDAD')) {
        return false;
      }
      if (tipo && a.tipo !== tipo) {
        return false;
      }
      if (!q) {
        return true;
      }
      return [this.codigo(a.id), a.referencia, a.ciudadano, a.unidadCodigo, a.tipoNombre]
        .filter(Boolean)
        .some((campo) => (campo as string).toLowerCase().includes(q));
    });
  });

  protected readonly hayFiltros = computed(() => this.estado() !== null || this.tipo() !== null || this.texto() !== '');

  constructor() {
    this.cargar();
    // Cualquier cambio en vivo vuelve a pedir la lista (con una pequeña espera para agrupar)
    this.store.cambios$.pipe(debounceTime(600), takeUntilDestroyed(inject(DestroyRef))).subscribe(() => this.cargar(false));
  }

  protected limpiar(): void {
    this.busqueda.setValue('');
    this.estado.set(null);
    this.tipo.set(null);
  }

  protected icono(a: Alerta): string {
    return iconoDeTipo(a.tipo);
  }

  protected nombreTipo(a: Alerta): string {
    return TIPOS[a.tipo]?.nombre ?? a.tipoNombre;
  }

  protected codigo(id: number): string {
    return `ALR-${String(id).padStart(6, '0')}`;
  }

  private cargar(conBarra = true): void {
    this.cargando.set(conBarra);
    this.api.alertas({ todas: true, limite: 200 }).subscribe({
      next: (lista) => {
        this.alertas.set(lista);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
