import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let token: string | null;
  const logout = vi.fn();
  const abrirAviso = vi.fn();

  beforeEach(() => {
    token = 'token-vigente';
    logout.mockClear();
    abrirAviso.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { token: () => token, logout } },
        { provide: MatSnackBar, useValue: { open: abrirAviso } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('añade el token a las llamadas a la API', () => {
    http.get(`${environment.apiUrl}/monitoreo/alertas`).subscribe();
    const req = backend.expectOne(`${environment.apiUrl}/monitoreo/alertas`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-vigente');
    req.flush([]);
  });

  it('no envía el token a otros dominios', () => {
    http.get('https://tile.openstreetmap.org/1/1/1.png').subscribe();
    const req = backend.expectOne('https://tile.openstreetmap.org/1/1/1.png');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush('');
  });

  it('ante un 401 con sesión cierra la sesión y avisa', () => {
    http.get(`${environment.apiUrl}/monitoreo/alertas`).subscribe({ error: () => undefined });
    backend.expectOne(`${environment.apiUrl}/monitoreo/alertas`).flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(logout).toHaveBeenCalledWith('expirada');
    expect(abrirAviso).toHaveBeenCalled();
  });

  it('muestra el mensaje del backend en los demás errores', () => {
    http.get(`${environment.apiUrl}/monitoreo/alertas/9`).subscribe({ error: () => undefined });
    backend
      .expectOne(`${environment.apiUrl}/monitoreo/alertas/9`)
      .flush({ codigo: 'NO_ENCONTRADO', mensaje: 'Alerta no encontrada', campos: null }, { status: 404, statusText: 'Not Found' });
    expect(logout).not.toHaveBeenCalled();
    expect(abrirAviso.mock.calls[0][0]).toBe('Alerta no encontrada');
  });
});
