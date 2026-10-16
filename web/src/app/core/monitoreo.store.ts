import { computed, inject, Injectable, signal } from '@angular/core';
import { debounceTime, forkJoin, Subject, Subscription } from 'rxjs';
import { MonitoreoService } from './api/monitoreo.service';
import { ESTADOS_FINALES } from './etiquetas';
import { Alerta, NotificacionCentral, Resumen, Unidad, Zona } from './models';
import { TiempoRealService } from './tiempo-real.service';

export interface Actividad {
  /** Epoch ms en que llegó al navegador. */
  hora: number;
  alertaId: number;
  tipo: string;
  detalle: string | null;
  unidadCodigo: string | null;
}

const MAX_ACTIVIDAD = 30;

/**
 * Estado en vivo de la central: se carga por REST al entrar y se mantiene al día con los mensajes
 * del WebSocket. Lo comparten el mapa, las listas y los indicadores.
 */
@Injectable({ providedIn: 'root' })
export class MonitoreoStore {
  private readonly api = inject(MonitoreoService);
  private readonly tiempoReal = inject(TiempoRealService);

  readonly alertas = signal<Alerta[]>([]);
  readonly unidades = signal<Unidad[]>([]);
  readonly zonas = signal<Zona[]>([]);
  readonly resumen = signal<Resumen | null>(null);
  readonly actividad = signal<Actividad[]>([]);
  readonly cargando = signal(false);
  /** true si falló la carga inicial (backend caído). */
  readonly error = signal(false);
  readonly conectado = this.tiempoReal.conectado;

  /** Cantidad de alertas escaladas a la central que necesitan acción manual. */
  readonly sinUnidad = computed(() => this.alertas().filter((a) => a.estado === 'SIN_UNIDAD').length);

  private suscripciones: Subscription[] = [];
  private readonly refrescarResumen$ = new Subject<void>();
  /** Notifica a las pantallas con datos propios (lista de alertas, detalle) que algo cambió. */
  readonly cambios$ = new Subject<NotificacionCentral>();

  iniciar(): void {
    if (this.suscripciones.length > 0) {
      return;
    }
    this.tiempoReal.conectar();
    this.suscripciones = [
      this.tiempoReal.alertas$.subscribe((n) => this.alRecibirAlerta(n)),
      this.tiempoReal.unidades$.subscribe((u) => this.alRecibirUnidad(u)),
      this.tiempoReal.reconectado$.subscribe(() => this.cargar()),
      this.refrescarResumen$.pipe(debounceTime(800)).subscribe(() => this.cargarResumen()),
    ];
    this.cargar();
  }

  detener(): void {
    this.suscripciones.forEach((s) => s.unsubscribe());
    this.suscripciones = [];
    this.tiempoReal.desconectar();
    this.alertas.set([]);
    this.unidades.set([]);
    this.actividad.set([]);
    this.resumen.set(null);
  }

  /** Carga completa por REST (al iniciar y al reconectar el WebSocket). */
  cargar(): void {
    this.cargando.set(true);
    forkJoin({
      alertas: this.api.alertas(),
      unidades: this.api.unidades(),
      resumen: this.api.resumen(),
      zonas: this.api.zonas(),
    }).subscribe({
      next: (r) => {
        this.alertas.set(ordenar(r.alertas));
        this.unidades.set(r.unidades);
        this.resumen.set(r.resumen);
        this.zonas.set(r.zonas);
        this.error.set(false);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set(true);
        this.cargando.set(false);
      },
    });
  }

  /** Vuelve a pedir el límite y los sectores (tras editarlos en Administración). */
  recargarZonas(): void {
    this.api.zonas().subscribe((z) => this.zonas.set(z));
  }

  private cargarResumen(): void {
    this.api.resumen().subscribe((r) => this.resumen.set(r));
  }

  private alRecibirAlerta(n: NotificacionCentral): void {
    const activa = !ESTADOS_FINALES.includes(n.alerta.estado);
    this.alertas.update((lista) => {
      const sin = lista.filter((a) => a.id !== n.alerta.id);
      return activa ? ordenar([...sin, n.alerta]) : sin;
    });
    this.actividad.update((lista) =>
      [
        { hora: Date.now(), alertaId: n.alerta.id, tipo: n.tipo, detalle: n.detalle, unidadCodigo: n.unidadCodigo },
        ...lista,
      ].slice(0, MAX_ACTIVIDAD),
    );
    this.refrescarResumen$.next();
    this.cambios$.next(n);
  }

  private alRecibirUnidad(u: Unidad): void {
    this.unidades.update((lista) => {
      if (!u.activo) {
        return lista.filter((x) => x.id !== u.id);
      }
      const existe = lista.some((x) => x.id === u.id);
      const nueva = existe ? lista.map((x) => (x.id === u.id ? u : x)) : [...lista, u];
      return nueva.sort((a, b) => a.codigo.localeCompare(b.codigo));
    });
    this.refrescarResumen$.next();
  }
}

/** Más urgentes primero; a igual prioridad, las más antiguas primero. */
function ordenar(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => a.prioridad - b.prioridad || a.creadaEn.localeCompare(b.creadaEn));
}
