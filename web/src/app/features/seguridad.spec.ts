import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AdminService } from '../core/api/admin.service';
import { AuthService } from '../core/auth/auth.service';
import { infoEvento } from '../core/etiquetas';
import { Evidencia, PaginaAuditoria } from '../core/models';
import { AuditoriaAdmin } from './admin/auditoria-admin';
import { Cuenta } from './cuenta/cuenta';
import { EvidenciasAlerta } from './alertas/evidencias-alerta';

const API = environment.apiUrl;

function evidencia(extra: Partial<Evidencia> = {}): Evidencia {
  return { id: 1, alertaId: 10, origen: 'CIUDADANO', tipo: 'FOTO', observacion: null, autor: 'Ana Pérez', conArchivo: true, creadoEn: '2026-10-15T20:00:00Z', ...extra };
}

function proveer() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: MatSnackBar, useValue: { open: vi.fn() } }],
  });
  return TestBed.inject(HttpTestingController);
}

describe('AuthService.cambiarClave', () => {
  it('envía la clave actual y la nueva a /auth/clave', () => {
    const backend = proveer();
    TestBed.inject(AuthService).cambiarClave('vieja123', 'nueva1234').subscribe();
    const r = backend.expectOne({ method: 'POST', url: `${API}/auth/clave` });
    expect(r.request.body).toEqual({ actual: 'vieja123', nueva: 'nueva1234' });
    r.flush(null, { status: 204, statusText: 'No Content' });
  });
});

describe('Cuenta', () => {
  it('no envía nada si la repetición no coincide', () => {
    const backend = proveer();
    const f = TestBed.createComponent(Cuenta);
    f.detectChanges();
    const c = f.componentInstance as unknown as { form: { setValue(v: object): void }; guardar(): void };
    c.form.setValue({ actual: 'vieja123', nueva: 'nueva1234', repetir: 'otra12345' });
    c.guardar();
    backend.expectNone(`${API}/auth/clave`);
  });

  it('muestra el mensaje del backend si la clave actual es incorrecta', () => {
    const backend = proveer();
    const f = TestBed.createComponent(Cuenta);
    f.detectChanges();
    const c = f.componentInstance as unknown as { form: { setValue(v: object): void }; guardar(): void; error(): string | null };
    c.form.setValue({ actual: 'mala', nueva: 'nueva1234', repetir: 'nueva1234' });
    c.guardar();
    backend
      .expectOne(`${API}/auth/clave`)
      .flush({ codigo: 'CLAVE_ACTUAL_INCORRECTA', mensaje: 'La clave actual no es correcta' }, { status: 422, statusText: 'Unprocessable' });
    expect(c.error()).toBe('La clave actual no es correcta');
  });

  it('exige 8 caracteres mínimo en la clave nueva', () => {
    const backend = proveer();
    const f = TestBed.createComponent(Cuenta);
    f.detectChanges();
    const c = f.componentInstance as unknown as { form: { setValue(v: object): void }; guardar(): void };
    c.form.setValue({ actual: 'vieja123', nueva: 'corta', repetir: 'corta' });
    c.guardar();
    backend.expectNone(`${API}/auth/clave`);
  });
});

describe('EvidenciasAlerta', () => {
  it('lista las evidencias y pide la miniatura solo de las fotos', async () => {
    const backend = proveer();
    const f = TestBed.createComponent(EvidenciasAlerta);
    f.componentRef.setInput('alertaId', 10);
    f.detectChanges();
    await f.whenStable();
    backend.expectOne(`${API}/monitoreo/alertas/10/evidencias`).flush([
      evidencia({ id: 1, tipo: 'FOTO' }),
      evidencia({ id: 2, tipo: 'VIDEO', origen: 'SERENO' }),
      evidencia({ id: 3, tipo: 'NOTA', conArchivo: false, observacion: 'Dos sujetos huyeron' }),
    ]);
    backend.expectOne(`${API}/evidencias/1/archivo`).flush(new Blob(['x'], { type: 'image/jpeg' }));
    backend.expectNone(`${API}/evidencias/2/archivo`); // el video se pide al abrirlo
    backend.expectNone(`${API}/evidencias/3/archivo`); // la nota no tiene archivo
    f.detectChanges();
    const texto = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Dos sujetos huyeron');
    expect(texto).toContain('Video');
  });

  it('sin evidencias explica qué pasará', async () => {
    const backend = proveer();
    const f = TestBed.createComponent(EvidenciasAlerta);
    f.componentRef.setInput('alertaId', 11);
    f.detectChanges();
    await f.whenStable();
    backend.expectOne(`${API}/monitoreo/alertas/11/evidencias`).flush([]);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Nadie ha adjuntado');
  });

  it('el evento EVIDENCIA_AGREGADA tiene texto propio en el historial', () => {
    expect(infoEvento('EVIDENCIA_AGREGADA').texto).toBe('Evidencia agregada');
  });
});

describe('AuditoriaAdmin', () => {
  const pagina: PaginaAuditoria = {
    total: 30,
    pagina: 0,
    tamano: 25,
    items: [
      { id: 2, usuario: null, dni: null, accion: 'LOGIN_BLOQUEADO', entidad: 'usuario', entidadId: null, detalle: 'DNI 12345678', ip: '127.0.0.1', dispositivo: null, creadoEn: '2026-10-15T20:00:00Z' },
    ],
  };

  it('carga la primera página y las acciones para el filtro', async () => {
    const backend = proveer();
    const f = TestBed.createComponent(AuditoriaAdmin);
    f.detectChanges();
    await f.whenStable();
    backend.expectOne(`${API}/admin/auditoria/acciones`).flush(['LOGIN', 'LOGIN_BLOQUEADO']);
    const r = backend.expectOne((x) => x.url === `${API}/admin/auditoria`);
    expect(r.request.params.get('tamano')).toBe('25');
    expect(r.request.params.get('pagina')).toBe('0');
    r.flush(pagina);
    f.detectChanges();
    const texto = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Cuenta bloqueada por intentos');
    expect(texto).toContain('1–1 de 30');
  });

  it('el filtro por acción y texto se manda al backend y vuelve a la página 0', async () => {
    const backend = proveer();
    const f = TestBed.createComponent(AuditoriaAdmin);
    f.detectChanges();
    await f.whenStable();
    backend.expectOne(`${API}/admin/auditoria/acciones`).flush([]);
    backend.expectOne((x) => x.url === `${API}/admin/auditoria`).flush(pagina);
    const c = f.componentInstance as unknown as { accion: string; texto: string; buscar(): void; irA(p: number): void };
    c.irA(1);
    await f.whenStable();
    backend.expectOne((x) => x.params.get('pagina') === '1').flush({ ...pagina, pagina: 1 });
    c.accion = 'LOGIN';
    c.texto = ' 00000003 ';
    c.buscar();
    await f.whenStable();
    const r = backend.expectOne((x) => x.url === `${API}/admin/auditoria`);
    expect(r.request.params.get('accion')).toBe('LOGIN');
    expect(r.request.params.get('q')).toBe('00000003');
    expect(r.request.params.get('pagina')).toBe('0');
    r.flush(pagina);
  });

  it('AdminService omite los filtros vacíos', () => {
    const backend = proveer();
    TestBed.inject(AdminService).auditoria({ accion: '', q: undefined, pagina: 0, tamano: 25 }).subscribe();
    const r = backend.expectOne((x) => x.url === `${API}/admin/auditoria`);
    expect(r.request.params.has('accion')).toBe(false);
    expect(r.request.params.has('q')).toBe(false);
    expect(r.request.params.get('tamano')).toBe('25');
    r.flush(pagina);
    void TestBed.inject(MatDialog);
  });
});
