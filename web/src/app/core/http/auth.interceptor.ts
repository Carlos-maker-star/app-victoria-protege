import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { NotificacionService } from '../notificacion.service';
import { SILENCIAR_ERRORES } from './contexto';
import { mensajeDeError } from './errores';

/**
 * Añade `Authorization: Bearer <token>` a las llamadas a la API y centraliza los errores:
 * 401 con sesión cierra la sesión; el resto se muestra como aviso salvo que la petición lo silencie.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const notificar = inject(NotificacionService);

  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const token = auth.token();
  const peticion = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(peticion).pipe(
    catchError((error: HttpErrorResponse) => {
      const silenciado = req.context.get(SILENCIAR_ERRORES);
      if (error.status === 401 && token) {
        notificar.error('Tu sesión expiró. Vuelve a iniciar sesión.');
        auth.logout('expirada');
      } else if (!silenciado) {
        notificar.error(mensajeDeError(error));
      }
      return throwError(() => error);
    }),
  );
};
