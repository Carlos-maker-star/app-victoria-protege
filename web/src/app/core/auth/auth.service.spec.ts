import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthResponse, Rol } from '../models';
import { AuthService, CLAVE_SESION_TEST } from './auth.service';

function respuesta(rol: Rol): AuthResponse {
  return {
    token: 'jwt-de-prueba',
    tipo: 'Bearer',
    expiraEnSegundos: 3600,
    usuario: { id: 1, dni: '00000003', nombres: 'Operador', apellidos: 'Central', email: null, telefono: null, rol },
  };
}

describe('AuthService', () => {
  let auth: AuthService;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('un operador inicia sesión y queda guardada', () => {
    let nombre = '';
    auth.login('00000003', 'clave').subscribe((u) => (nombre = u.nombres));

    const peticion = backend.expectOne(`${environment.apiUrl}/auth/login`);
    expect(peticion.request.body).toEqual({ usuario: '00000003', password: 'clave' });
    peticion.flush(respuesta('OPERADOR'));

    expect(nombre).toBe('Operador');
    expect(auth.autenticado()).toBe(true);
    expect(auth.rol()).toBe('OPERADOR');
    expect(auth.nombre()).toBe('Operador Central');
    expect(localStorage.getItem(CLAVE_SESION_TEST)).toContain('jwt-de-prueba');
  });

  it.each<Rol>(['CIUDADANO', 'SERENO'])('rechaza a un %s aunque sus credenciales sean válidas', (rol) => {
    let error: { status: number; error: { codigo: string } } | null = null;
    auth.login('00000006', 'clave').subscribe({ error: (e) => (error = e) });

    backend.expectOne(`${environment.apiUrl}/auth/login`).flush(respuesta(rol));

    expect(error).not.toBeNull();
    expect(error!.error.codigo).toBe('ROL_NO_PERMITIDO');
    expect(auth.autenticado()).toBe(false);
    expect(localStorage.getItem(CLAVE_SESION_TEST)).toBeNull();
  });

  it('con credenciales incorrectas no abre sesión', () => {
    let status = 0;
    auth.login('00000003', 'mala').subscribe({ error: (e) => (status = e.status) });

    backend
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ codigo: 'NO_AUTORIZADO', mensaje: 'Credenciales invalidas', campos: null }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(auth.autenticado()).toBe(false);
  });

  it('tieneRol y esSupervisor reflejan el rol de la sesión', () => {
    auth.login('1', 'x').subscribe();
    backend.expectOne(`${environment.apiUrl}/auth/login`).flush(respuesta('SUPERVISOR'));

    expect(auth.tieneRol('SUPERVISOR', 'ADMIN')).toBe(true);
    expect(auth.tieneRol('OPERADOR')).toBe(false);
    expect(auth.esSupervisor()).toBe(true);
    expect(auth.esAdmin()).toBe(false);
  });
});
