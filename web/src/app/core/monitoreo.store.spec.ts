import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { Alerta, EstadoAlerta, NotificacionCentral, Unidad } from './models';
import { MonitoreoStore } from './monitoreo.store';
import { TiempoRealService } from './tiempo-real.service';

function alerta(id: number, estado: EstadoAlerta, prioridad = 1, creadaEn = '2026-10-15T14:00:00Z'): Alerta {
  return {
    id, tipo: 'ROBO', tipoNombre: 'Robo', prioridad, descripcion: null, latitud: -6.82, longitud: -79.86,
    referencia: null, estado, resultado: null, ciudadano: 'Rosa Paredes', ciudadanoTelefono: null,
    unidadCodigo: null, creadaEn, finalizadaEn: null,
  };
}

function aviso(tipo: string, a: Alerta): NotificacionCentral {
  return { tipo, detalle: null, unidadCodigo: null, alerta: a };
}

describe('MonitoreoStore', () => {
  let store: MonitoreoStore;
  let backend: HttpTestingController;
  const alertas$ = new Subject<NotificacionCentral>();
  const unidades$ = new Subject<Unidad>();
  const reconectado$ = new Subject<void>();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: TiempoRealService,
          useValue: { alertas$, unidades$, reconectado$, conectado: signal(true), conectar: vi.fn(), desconectar: vi.fn() },
        },
      ],
    });
    store = TestBed.inject(MonitoreoStore);
    backend = TestBed.inject(HttpTestingController);
  });

  /** Responde la carga inicial por REST. */
  function cargarInicial(alertas: Alerta[] = []) {
    store.iniciar();
    backend.expectOne(`${environment.apiUrl}/monitoreo/alertas`).flush(alertas);
    backend.expectOne(`${environment.apiUrl}/monitoreo/unidades`).flush([]);
    backend.expectOne(`${environment.apiUrl}/monitoreo/resumen`).flush({ alertasActivas: alertas.length });
    backend.expectOne(`${environment.apiUrl}/monitoreo/zonas`).flush([]);
  }

  afterEach(() => store.detener());

  it('carga alertas, unidades, resumen y zonas por REST al iniciar', () => {
    cargarInicial([alerta(1, 'ASIGNADA')]);
    expect(store.alertas().map((a) => a.id)).toEqual([1]);
    expect(store.resumen()?.alertasActivas).toBe(1);
    expect(store.error()).toBe(false);
  });

  it('marca error si el backend no responde', () => {
    store.iniciar();
    // forkJoin cancela las demás peticiones en cuanto una falla
    backend.expectOne(`${environment.apiUrl}/monitoreo/alertas`).flush(null, { status: 0, statusText: 'Unknown Error' });
    expect(store.error()).toBe(true);
    expect(store.cargando()).toBe(false);
  });

  it('una alerta nueva por WebSocket aparece y la lista se ordena por prioridad', () => {
    cargarInicial([alerta(1, 'ASIGNADA', 3)]);
    alertas$.next(aviso('ALERTA_CREADA', alerta(2, 'CREADA', 1)));
    expect(store.alertas().map((a) => a.id)).toEqual([2, 1]);
    expect(store.actividad()[0].tipo).toBe('ALERTA_CREADA');
  });

  it('una alerta que cambia de estado se actualiza sin duplicarse', () => {
    cargarInicial([alerta(1, 'ASIGNADA')]);
    alertas$.next(aviso('ALERTA_ACEPTADA', alerta(1, 'EN_CAMINO')));
    expect(store.alertas()).toHaveLength(1);
    expect(store.alertas()[0].estado).toBe('EN_CAMINO');
  });

  it.each<EstadoAlerta>(['FINALIZADA', 'CANCELADA'])('una alerta %s sale de las activas', (estado) => {
    cargarInicial([alerta(1, 'EN_CAMINO')]);
    alertas$.next(aviso('ATENCION_FINALIZADA', alerta(1, estado)));
    expect(store.alertas()).toHaveLength(0);
  });

  it('cuenta las alertas escaladas a la central', () => {
    cargarInicial([alerta(1, 'SIN_UNIDAD'), alerta(2, 'EN_CAMINO')]);
    expect(store.sinUnidad()).toBe(1);
  });

  it('al reconectar el WebSocket recarga todo por REST', () => {
    cargarInicial();
    reconectado$.next();
    backend.expectOne(`${environment.apiUrl}/monitoreo/alertas`).flush([alerta(7, 'CREADA')]);
    backend.expectOne(`${environment.apiUrl}/monitoreo/unidades`).flush([]);
    backend.expectOne(`${environment.apiUrl}/monitoreo/resumen`).flush({});
    backend.expectOne(`${environment.apiUrl}/monitoreo/zonas`).flush([]);
    expect(store.alertas().map((a) => a.id)).toEqual([7]);
  });
});
