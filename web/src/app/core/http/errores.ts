import { HttpErrorResponse } from '@angular/common/http';
import { ErrorApi } from '../models';

/** Convierte un error HTTP (ErrorApi del backend) en un mensaje para mostrar. */
export function mensajeDeError(error: unknown): string {
  const e = error as Partial<HttpErrorResponse> | null;
  if (e?.status === 0) {
    return 'No se pudo conectar con el servidor. ¿Está corriendo el backend?';
  }
  const cuerpo = e?.error as Partial<ErrorApi> | null | undefined;
  const primerCampo = cuerpo?.campos ? Object.values(cuerpo.campos)[0] : null;
  if (primerCampo ?? cuerpo?.mensaje) {
    return (primerCampo ?? cuerpo?.mensaje) as string;
  }
  if (e?.status === 403) {
    return 'No tienes permiso para esta acción.';
  }
  return e?.status ? `Error ${e.status}` : 'Ocurrió un error inesperado';
}
