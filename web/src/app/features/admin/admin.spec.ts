import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { rolGuard } from '../../core/auth/guards';
import { AuthService } from '../../core/auth/auth.service';
import { Parametro, UnidadAdmin, UsuarioAdmin } from '../../core/models';
import { Configuracion } from './configuracion';
import { UnidadDialog } from './unidad-dialog';
import { UsuarioDialog } from './usuario-dialog';

const API = `${environment.apiUrl}/admin`;

function usuario(extra: Partial<UsuarioAdmin> = {}): UsuarioAdmin {
  return { id: 7, dni: '45678912', nombres: 'Carla', apellidos: 'Soto', email: null, telefono: null, rol: 'SERENO', activo: true, unidadCodigo: null, creadoEn: '2026-10-15T14:00:00Z', ...extra };
}

function unidad(extra: Partial<UnidadAdmin> = {}): UnidadAdmin {
  return { id: 3, codigo: 'SV-003', placa: 'CAM-1', tipo: 'CAMIONETA', activo: true, estado: 'DISPONIBLE', serenoId: 7, sereno: 'Carla Soto', latitud: null, longitud: null, zonaId: null, zona: null, ...extra };
}

function proveer(datos: unknown) {
  const cerrar = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: MAT_DIALOG_DATA, useValue: datos },
      { provide: MatDialogRef, useValue: { close: cerrar } },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
    ],
  });
  return { cerrar, backend: TestBed.inject(HttpTestingController) };
}

describe('UsuarioDialog', () => {
  it('al crear exige DNI de 8 dígitos y clave de mínimo 8 caracteres', () => {
    const { backend } = proveer(null);
    const f = TestBed.createComponent(UsuarioDialog);
    f.detectChanges();
    const c = f.componentInstance as unknown as { form: { controls: Record<string, { setValue(v: string): void; valid: boolean }>; valid: boolean }; guardar(): void };

    c.guardar();
    backend.expectNone(`${API}/usuarios`);

    c.form.controls['nombres'].setValue('Ana');
    c.form.controls['apellidos'].setValue('Pérez');
    c.form.controls['dni'].setValue('123');
    c.form.controls['password'].setValue('corta');
    expect(c.form.valid).toBe(false);
    c.form.controls['dni'].setValue('12345678');
    c.form.controls['password'].setValue('claveSegura1');
    expect(c.form.valid).toBe(true);
  });

  it('envía el alta con los datos limpios y cierra con éxito', () => {
    const { backend, cerrar } = proveer(null);
    const f = TestBed.createComponent(UsuarioDialog);
    f.detectChanges();
    const c = f.componentInstance as unknown as { form: { controls: Record<string, { setValue(v: string): void }> }; guardar(): void };
    c.form.controls['nombres'].setValue('  Ana ');
    c.form.controls['apellidos'].setValue('Pérez');
    c.form.controls['dni'].setValue('12345678');
    c.form.controls['rol'].setValue('OPERADOR');
    c.form.controls['password'].setValue('claveSegura1');
    c.guardar();

    const post = backend.expectOne(`${API}/usuarios`);
    expect(post.request.body).toEqual({ nombres: 'Ana', apellidos: 'Pérez', email: null, telefono: null, rol: 'OPERADOR', dni: '12345678', password: 'claveSegura1' });
    post.flush(usuario({ rol: 'OPERADOR' }));
    expect(cerrar).toHaveBeenCalledWith(true);
  });

  it('al editar no pide DNI ni clave y usa PUT', () => {
    const { backend } = proveer(usuario({ email: 'c@x.pe', telefono: '987654321' }));
    const f = TestBed.createComponent(UsuarioDialog);
    f.detectChanges();
    const texto = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Editar usuario');
    expect(texto).not.toContain('Contraseña temporal');
    (f.componentInstance as unknown as { guardar(): void }).guardar();
    const put = backend.expectOne(`${API}/usuarios/7`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ nombres: 'Carla', apellidos: 'Soto', email: 'c@x.pe', telefono: '987654321', rol: 'SERENO' });
    put.flush(usuario());
  });
});

describe('UnidadDialog', () => {
  it('ofrece los serenos sin unidad y el código se escribe en mayúsculas', async () => {
    const { backend } = proveer(null);
    const f = TestBed.createComponent(UnidadDialog);
    f.detectChanges();
    backend.expectOne(`${API}/usuarios?rol=SERENO&sinUnidad=true`).flush([usuario({ id: 9, nombres: 'Luis', apellidos: 'Vega' })]);
    backend.expectOne(`${API}/zonas`).flush([]);
    await f.whenStable();
    const c = f.componentInstance as unknown as { serenos(): { id: number; nombre: string }[]; form: { controls: Record<string, { setValue(v: unknown): void; value: string; valid: boolean }> }; mayusculas(): void };
    expect(c.serenos()).toEqual([{ id: 9, nombre: 'Luis Vega' }]);

    c.form.controls['codigo'].setValue('sv-010');
    c.mayusculas();
    expect(c.form.controls['codigo'].value).toBe('SV-010');
    expect(c.form.controls['codigo'].valid).toBe(true);
    c.form.controls['codigo'].setValue('sv 010');
    expect(c.form.controls['codigo'].valid).toBe(false);
  });

  it('al editar conserva al sereno actual en la lista y no repite códigos', async () => {
    const { backend } = proveer(unidad());
    const f = TestBed.createComponent(UnidadDialog);
    f.detectChanges();
    backend.expectOne(`${API}/usuarios?rol=SERENO&sinUnidad=true`).flush([usuario({ id: 9, nombres: 'Luis', apellidos: 'Vega' })]);
    backend.expectOne(`${API}/zonas`).flush([
      { id: 1, nombre: 'La Victoria', tipo: 'DISTRITO', activo: true, areaKm2: 40, alertas: 0, unidades: 0, geojson: '{}' },
      { id: 2, nombre: 'Sector 1', tipo: 'SECTOR', activo: true, areaKm2: 5, alertas: 0, unidades: 0, geojson: '{}' },
      { id: 3, nombre: 'Sector viejo', tipo: 'SECTOR', activo: false, areaKm2: 5, alertas: 0, unidades: 0, geojson: '{}' },
    ]);
    await f.whenStable();
    const c = f.componentInstance as unknown as { serenos(): { id: number }[]; sectores(): { id: number }[]; guardar(): void };
    expect(c.sectores().map((z) => z.id)).toEqual([2]); // solo sectores activos
    expect(c.serenos().map((s) => s.id)).toEqual([7, 9]);
    c.guardar();
    const put = backend.expectOne(`${API}/unidades/3`);
    expect(put.request.body).toEqual({ placa: 'CAM-1', tipo: 'CAMIONETA', serenoId: 7, zonaId: null });
    put.flush(unidad());
  });
});

describe('Configuracion', () => {
  const parametros: Parametro[] = [
    { clave: 'asignacion_automatica', valor: 'true', descripcion: 'modo' },
    { clave: 'tiempo_respuesta_segundos', valor: '15', descripcion: 'Segundos para responder' },
    { clave: 'clave_desconocida', valor: '1', descripcion: 'no se muestra' },
  ];

  async function abrir() {
    const { backend } = proveer(null);
    const f = TestBed.createComponent(Configuracion);
    f.detectChanges();
    backend.expectOne(`${API}/parametros`).flush(parametros);
    await f.whenStable();
    f.detectChanges();
    return { f, backend, el: f.nativeElement as HTMLElement };
  }

  it('muestra solo los parámetros conocidos y el modo como interruptor', async () => {
    const { el } = await abrir();
    expect(el.textContent).toContain('Tiempo para responder una alerta');
    expect(el.textContent).not.toContain('clave_desconocida');
    expect(el.textContent).toContain('Motor activo');
  });

  it('el botón Guardar solo aparece al cambiar un valor y se bloquea fuera de rango', async () => {
    const { f, el } = await abrir();
    const campo = el.querySelector<HTMLInputElement>('#p-tiempo_respuesta_segundos')!;
    const guardar = () => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Guardar') as HTMLButtonElement | undefined;
    expect(guardar()).toBeUndefined();

    campo.value = '1';
    campo.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(guardar()?.disabled).toBe(true); // 1 está fuera de 5–120

    campo.value = '30';
    campo.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(guardar()?.disabled).toBe(false);
  });

  it('guardar envía el valor y deja de mostrar el botón', async () => {
    const { f, backend, el } = await abrir();
    const campo = el.querySelector<HTMLInputElement>('#p-tiempo_respuesta_segundos')!;
    campo.value = '30';
    campo.dispatchEvent(new Event('input'));
    f.detectChanges();
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Guardar')!.click();

    const put = backend.expectOne(`${API}/parametros/tiempo_respuesta_segundos`);
    expect(put.request.body).toEqual({ valor: '30' });
    put.flush({ clave: 'tiempo_respuesta_segundos', valor: '30', descripcion: 'Segundos para responder' });
    await f.whenStable();
    f.detectChanges();
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Guardar')).toBe(false);
    expect(el.querySelector<HTMLInputElement>('#p-tiempo_respuesta_segundos')!.value).toBe('30');
  });

  it('apagar el modo automático envía asignacion_automatica=false', async () => {
    const { f, backend } = await abrir();
    (f.componentInstance as unknown as { cambiarModo(v: boolean): void }).cambiarModo(false);
    const put = backend.expectOne(`${API}/parametros/asignacion_automatica`);
    expect(put.request.body).toEqual({ valor: 'false' });
    put.flush({ clave: 'asignacion_automatica', valor: 'false', descripcion: 'modo' });
    await f.whenStable();
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Manual');
  });
});

describe('rolGuard en rutas de administración', () => {
  it('un operador es enviado al monitoreo y un administrador entra', () => {
    const sesion = (rol: string) => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideRouter([]), { provide: AuthService, useValue: { tieneRol: (...r: string[]) => r.includes(rol) } }],
      });
    };
    const evaluar = () => TestBed.runInInjectionContext(() => rolGuard('ADMIN')({} as never, {} as never));

    sesion('OPERADOR');
    const bloqueo = evaluar();
    expect(bloqueo).not.toBe(true);
    expect(TestBed.inject(Router).serializeUrl(bloqueo as never)).toBe('/monitoreo');

    sesion('ADMIN');
    expect(evaluar()).toBe(true);
  });
});
