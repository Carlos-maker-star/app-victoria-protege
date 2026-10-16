import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { map, timer } from 'rxjs';
import { formatoDuracion, iconoDeTipo, infoEvento, partirDuracion, TIPOS } from '../../core/etiquetas';
import { Alerta } from '../../core/models';
import { IntervencionService } from '../../core/intervencion.service';
import { MonitoreoStore } from '../../core/monitoreo.store';
import { EstadoAlertaBadge, PrioridadBadge } from '../../shared/badges';
import { MapaOperativo } from './mapa-operativo';

interface Kpi {
  titulo: string;
  valor: string;
  unidad?: string;
  detalle: string;
  icono: string;
  /** Clases del cuadro del ícono (fondo y color del rol semántico). */
  tono: string;
}

@Component({
  selector: 'app-monitoreo',
  imports: [DatePipe, MatIcon, MatButton, MatIconButton, RouterLink, MapaOperativo, EstadoAlertaBadge, PrioridadBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './monitoreo.html',
})
export class Monitoreo {
  protected readonly store = inject(MonitoreoStore);
  protected readonly intervencion = inject(IntervencionService);

  protected readonly seleccionadaId = signal<number | null>(null);
  protected readonly seleccionada = computed(
    () => this.store.alertas().find((a) => a.id === this.seleccionadaId()) ?? null,
  );

  /** Reloj de 1 s para los tiempos transcurridos. */
  private readonly ahora = toSignal(timer(0, 1000).pipe(map(() => Date.now())), { initialValue: Date.now() });

  protected readonly actividadReciente = computed(() => this.store.actividad().slice(0, 8));

  protected readonly kpis = computed<Kpi[]>(() => {
    const r = this.store.resumen();
    const n = (v: number | undefined) => (v === undefined ? '—' : String(v));
    return [
      { titulo: 'Alertas activas', valor: n(r?.alertasActivas), detalle: r ? `${r.alertasSinUnidad} sin unidad` : '', icono: 'notifications_active', tono: 'bg-peligro-bg text-peligro-fg' },
      { titulo: 'Unidades disp.', valor: n(r?.unidadesDisponibles), detalle: r ? `de ${r.unidadesTotal}` : '', icono: 'check_circle', tono: 'bg-exito-bg text-exito-fg' },
      { titulo: 'En ruta', valor: n(r?.unidadesEnRuta), detalle: 'en desplazamiento', icono: 'directions_car', tono: 'bg-curso-bg text-curso-fg' },
      { titulo: 'En atención', valor: n(r?.unidadesEnAtencion), detalle: r ? `${r.unidadesFueraDeServicio} fuera de servicio` : '', icono: 'shield', tono: 'bg-atencion-bg text-atencion-fg' },
      { titulo: 'Atendidas hoy', valor: n(r?.atendidasHoy), detalle: 'finalizadas', icono: 'task_alt', tono: 'bg-exito-bg text-exito-fg' },
      { titulo: 'T. respuesta', ...partirDuracion(r?.tiempoRespuestaSeg), detalle: 'hasta aceptar', icono: 'timer', tono: 'bg-nuevo-bg text-nuevo-fg' },
      { titulo: 'T. llegada', ...partirDuracion(r?.tiempoLlegadaSeg), detalle: 'promedio de hoy', icono: 'schedule', tono: 'bg-nuevo-bg text-nuevo-fg' },
      { titulo: 'Reasignadas', valor: n(r?.reasignadasHoy), detalle: 'hoy', icono: 'swap_horiz', tono: 'bg-espera-bg text-espera-fg' },
    ];
  });

  protected asignar(a: Alerta): void {
    this.intervencion.asignar(a).subscribe();
  }

  protected cancelarAlerta(a: Alerta): void {
    this.intervencion.cancelar(a).subscribe();
  }

  protected seleccionar(id: number | null): void {
    this.seleccionadaId.update((actual) => (actual === id ? null : id));
  }

  protected transcurrido(a: Alerta): string {
    return formatoDuracion(Math.max(0, Math.floor((this.ahora() - new Date(a.creadaEn).getTime()) / 1000)));
  }

  protected nombreTipo(a: Alerta): string {
    return TIPOS[a.tipo]?.nombre ?? a.tipoNombre;
  }

  protected icono(a: Alerta): string {
    return iconoDeTipo(a.tipo);
  }

  protected codigo(id: number): string {
    return `ALR-${String(id).padStart(6, '0')}`;
  }

  protected evento(tipo: string) {
    return infoEvento(tipo);
  }

  /** Quién o qué atiende la alerta, en una línea para la lista. */
  protected resumenAtencion(a: Alerta): string {
    switch (a.estado) {
      case 'SIN_UNIDAD':
        return 'Escalada a la central · requiere acción';
      case 'CREADA':
      case 'BUSCANDO_UNIDAD':
        return 'Buscando la unidad más cercana…';
      case 'ASIGNADA':
        return `${a.unidadCodigo ?? 'Unidad'} · esperando respuesta`;
      case 'LLEGO':
      case 'EN_ATENCION':
        return `${a.unidadCodigo ?? 'Unidad'} · en el lugar`;
      default:
        return `${a.unidadCodigo ?? 'Unidad'} · en camino`;
    }
  }
}
