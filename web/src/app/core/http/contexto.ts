import { HttpContextToken } from '@angular/common/http';

/** Si es true, el interceptor no muestra el aviso global de error: lo maneja el componente. */
export const SILENCIAR_ERRORES = new HttpContextToken<boolean>(() => false);
