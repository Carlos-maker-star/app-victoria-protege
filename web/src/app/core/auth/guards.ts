import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Rol } from '../models';
import { AuthService } from './auth.service';

/** Rutas privadas: sin sesión, al login. */
export const authGuard: CanActivateFn = () =>
  inject(AuthService).autenticado() || inject(Router).createUrlTree(['/login']);

/** Login: con sesión, al centro de monitoreo. */
export const invitadoGuard: CanActivateFn = () =>
  !inject(AuthService).autenticado() || inject(Router).createUrlTree(['/monitoreo']);

/** Restringe una ruta a ciertos roles (el backend igual lo valida en cada endpoint). */
export const rolGuard =
  (...roles: Rol[]): CanActivateFn =>
  () =>
    inject(AuthService).tieneRol(...roles) || inject(Router).createUrlTree(['/monitoreo']);
