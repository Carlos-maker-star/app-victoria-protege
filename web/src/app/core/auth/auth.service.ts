import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SILENCIAR_ERRORES } from '../http/contexto';
import { AuthResponse, Rol, ROLES_CENTRAL, Usuario } from '../models';

const CLAVE_SESION = 'victoria.sesion';

interface Sesion {
  token: string;
  /** Epoch en ms en que expira el JWT. */
  expiraEn: number;
  usuario: Usuario;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly url = `${environment.apiUrl}/auth`;

  private readonly sesion = signal<Sesion | null>(leerSesion());

  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly token = computed(() => this.sesion()?.token ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);
  readonly rol = computed(() => this.usuario()?.rol ?? null);
  readonly nombre = computed(() => {
    const u = this.usuario();
    return u ? `${u.nombres} ${u.apellidos}` : '';
  });
  readonly esAdmin = computed(() => this.rol() === 'ADMIN');
  readonly esSupervisor = computed(() => this.rol() === 'SUPERVISOR' || this.rol() === 'ADMIN');

  /** El usuario cambia su propia contraseña. La sesión actual sigue vigente. */
  cambiarClave(actual: string, nueva: string): Observable<void> {
    // El error se muestra en el formulario, no como aviso global
    return this.http.post<void>(`${this.url}/clave`, { actual, nueva }, { context: silencioso() });
  }

  /**
   * Inicia sesión con DNI o correo. Esta plataforma es solo para el personal de la central:
   * un ciudadano o un sereno con credenciales válidas igual es rechazado aquí (usan la app móvil).
   * Los errores se muestran en el formulario, no como aviso global.
   */
  login(usuario: string, password: string): Observable<Usuario> {
    return this.http
      .post<AuthResponse>(`${this.url}/login`, { usuario, password }, { context: silencioso() })
      .pipe(
        switchMap((r) => {
          if (!ROLES_CENTRAL.includes(r.usuario.rol)) {
            return throwError(() => ({
              status: 403,
              error: {
                codigo: 'ROL_NO_PERMITIDO',
                mensaje: 'Esta plataforma es solo para el personal de la central. Usa la app móvil.',
              },
            }));
          }
          this.guardar(r);
          return of(r.usuario);
        }),
      );
  }

  /** Recarga el usuario desde el backend (por si un administrador le cambió el rol). */
  refrescarUsuario(): void {
    if (!this.autenticado()) {
      return;
    }
    this.http.get<Usuario>(`${this.url}/me`).subscribe((usuario) => {
      const actual = this.sesion();
      if (!actual) {
        return;
      }
      if (!ROLES_CENTRAL.includes(usuario.rol)) {
        this.logout();
        return;
      }
      this.persistir({ ...actual, usuario });
    });
  }

  logout(motivo?: 'expirada'): void {
    this.persistir(null);
    this.router.navigate(['/login'], motivo ? { queryParams: { sesion: motivo } } : {});
  }

  tieneRol(...roles: Rol[]): boolean {
    const rol = this.rol();
    return rol !== null && roles.includes(rol);
  }

  private guardar(respuesta: AuthResponse): void {
    this.persistir({
      token: respuesta.token,
      expiraEn: Date.now() + respuesta.expiraEnSegundos * 1000,
      usuario: respuesta.usuario,
    });
  }

  private persistir(sesion: Sesion | null): void {
    this.sesion.set(sesion);
    try {
      if (sesion) {
        localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
      } else {
        localStorage.removeItem(CLAVE_SESION);
      }
    } catch {
      // Sin almacenamiento (modo privado): la sesión dura lo que la pestaña.
    }
  }
}

function leerSesion(): Sesion | null {
  try {
    const guardada = localStorage.getItem(CLAVE_SESION);
    if (!guardada) {
      return null;
    }
    const sesion = JSON.parse(guardada) as Sesion;
    return sesion.expiraEn > Date.now() ? sesion : null;
  } catch {
    return null;
  }
}

function silencioso(): HttpContext {
  return new HttpContext().set(SILENCIAR_ERRORES, true);
}

/** Clave de localStorage de la sesión (la usan los tests). */
export const CLAVE_SESION_TEST = CLAVE_SESION;
