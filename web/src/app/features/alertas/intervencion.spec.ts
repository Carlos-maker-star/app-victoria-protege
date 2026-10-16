import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { IntervencionService } from '../../core/intervencion.service';
import { Alerta, Candidata, EstadoAlerta } from '../../core/models';
import { AsignarDialog } from './asignar-dialog';
import { CancelarDialog } from './cancelar-dialog';

function alerta(estado: EstadoAlerta, extra: Partial<Alerta> = {}): Alerta {
  return {
    id: 149, tipo: 'SOSPECHOSA', tipoNombre: 'Situación sospechosa', prioridad: 3, descripcion: null,
    latitud: -6.84, longitud: -79.88, referencia: 'Mz. K Lt. 2', estado, resultado: null, ciudadano: 'Rosa Paredes',
    ciudadanoTelefono: null, unidadCodigo: null, creadaEn: '2026-10-15T14:32:00Z', finalizadaEn: null, ...extra,
  };
}

function candidata(id: number, codigo: string, extra: Partial<Candidata> = {}): Candidata {
  return {
    id, codigo, sereno: `Sereno ${codigo}`, estado: 'DISPONIBLE', distanciaM: 2400, etaSegundos: 290,
    ubicacionEn: '2026-10-15T14:38:00Z', asignable: true, motivoNoDisponible: null, ...extra,
  };
}

describe('IntervencionService', () => {
  const servicio = () => TestBed.inject(IntervencionService);

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it.each<[EstadoAlerta, boolean]>([
    ['CREADA', true], ['BUSCANDO_UNIDAD', true], ['SIN_UNIDAD', true], ['ASIGNADA', true],
    ['EN_CAMINO', false], ['ACEPTADA', false], ['LLEGO', false], ['EN_ATENCION', false], ['FINALIZADA', false], ['CANCELADA', false],
  ])('puede asignar a mano en %s: %s', (estado, esperado) => {
    expect(servicio().puedeAsignar(alerta(estado))).toBe(esperado);
  });

  it.each<[EstadoAlerta, boolean]>([
    ['CREADA', true], ['SIN_UNIDAD', true], ['EN_CAMINO', true], ['LLEGO', true], ['EN_ATENCION', true],
    ['FINALIZADA', false], ['CANCELADA', false],
  ])('puede cancelar en %s: %s', (estado, esperado) => {
    expect(servicio().puedeCancelar(alerta(estado))).toBe(esperado);
  });
});

describe('AsignarDialog', () => {
  let backend: HttpTestingController;
  const cerrar = vi.fn();
  const avisar = vi.fn();
  const url = `${environment.apiUrl}/monitoreo/alertas/149`;

  async function abrir(a: Alerta) {
    cerrar.mockClear();
    avisar.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: a },
        { provide: MatDialogRef, useValue: { close: cerrar } },
        { provide: MatSnackBar, useValue: { open: avisar } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AsignarDialog);
    fixture.detectChanges();
    backend.expectOne(`${url}/candidatas`).flush([
      candidata(2, 'SV-003'),
      candidata(1, 'SV-002', { distanciaM: 3100 }),
      candidata(6, 'SV-006', { asignable: false, estado: 'EN_DESPLAZAMIENTO', motivoNoDisponible: 'Atiende ALR-000153' }),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => backend.verify());

  it('elige por defecto la unidad disponible más cercana y atenúa las no disponibles', async () => {
    const fixture = await abrir(alerta('SIN_UNIDAD'));
    const radios = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]')];

    expect(radios).toHaveLength(3);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].textContent).toContain('SV-003');
    expect(radios[0].textContent).toContain('2.4 km');
    expect(radios[2].disabled).toBe(true);
    expect(radios[2].textContent).toContain('Atiende ALR-000153');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Escalada a la central');
  });

  it('no deja asignar sin escribir el motivo y luego envía unidad y motivo', async () => {
    const fixture = await abrir(alerta('SIN_UNIDAD'));
    const el = fixture.nativeElement as HTMLElement;
    const boton = () => [...el.querySelectorAll<HTMLButtonElement>('mat-dialog-actions button')].at(-1)!;

    expect(boton().disabled).toBe(true);

    const area = el.querySelector('textarea')!;
    area.value = 'Es la más cercana';
    area.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(boton().disabled).toBe(false);
    expect(boton().textContent).toContain('Asignar a SV-003');

    boton().click();
    const post = backend.expectOne(`${url}/asignar`);
    expect(post.request.body).toEqual({ unidadId: 2, motivo: 'Es la más cercana' });
    post.flush({ alerta: alerta('ASIGNADA', { unidadCodigo: 'SV-003' }), historial: [] });

    expect(cerrar).toHaveBeenCalledWith(true);
    expect(avisar).toHaveBeenCalled();
  });

  it('si el servidor rechaza (la unidad ya no está libre) el diálogo sigue abierto y recarga la lista', async () => {
    const fixture = await abrir(alerta('SIN_UNIDAD'));
    const el = fixture.nativeElement as HTMLElement;
    const area = el.querySelector('textarea')!;
    area.value = 'x';
    area.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    [...el.querySelectorAll<HTMLButtonElement>('mat-dialog-actions button')].at(-1)!.click();
    backend.expectOne(`${url}/asignar`).flush(
      { codigo: 'UNIDAD_NO_DISPONIBLE', mensaje: 'La unidad ya no está disponible', campos: null },
      { status: 409, statusText: 'Conflict' },
    );

    expect(cerrar).not.toHaveBeenCalled();
    backend.expectOne(`${url}/candidatas`).flush([candidata(1, 'SV-002')]);
  });
});

describe('CancelarDialog', () => {
  let backend: HttpTestingController;
  const cerrar = vi.fn();
  const url = `${environment.apiUrl}/monitoreo/alertas/151/cancelar`;

  function abrir() {
    cerrar.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: alerta('EN_CAMINO', { id: 151, unidadCodigo: 'SV-002' }) },
        { provide: MatDialogRef, useValue: { close: cerrar } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CancelarDialog);
    fixture.detectChanges();
    return { fixture, componente: fixture.componentInstance as unknown as { motivo: { setValue(v: string): void }; observacion: { setValue(v: string): void }; cancelar(): void } };
  }

  afterEach(() => backend.verify());

  it('explica que la unidad queda libre y no envía nada sin motivo', () => {
    const { fixture, componente } = abrir();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('SV-002 queda libre');
    componente.cancelar();
    backend.expectNone(url);
  });

  it('cancela con un motivo y observación opcional', () => {
    const { componente } = abrir();
    componente.motivo.setValue('FALSA_ALARMA');
    componente.cancelar();
    const post = backend.expectOne(url);
    expect(post.request.body).toEqual({ motivo: 'FALSA_ALARMA', observacion: null });
    post.flush({ alerta: alerta('CANCELADA'), historial: [] });
    expect(cerrar).toHaveBeenCalledWith(true);
  });

  it('"Otro motivo" exige describirlo', () => {
    const { componente } = abrir();
    componente.motivo.setValue('OTRO');
    componente.cancelar();
    backend.expectNone(url);

    componente.observacion.setValue('Llamó el dueño del local');
    componente.cancelar();
    const post = backend.expectOne(url);
    expect(post.request.body).toEqual({ motivo: 'OTRO', observacion: 'Llamó el dueño del local' });
    post.flush({ alerta: alerta('CANCELADA'), historial: [] });
  });
});
