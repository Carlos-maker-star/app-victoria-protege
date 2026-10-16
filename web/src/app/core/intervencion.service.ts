import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { map, Observable } from 'rxjs';
import { AsignarDialog } from '../features/alertas/asignar-dialog';
import { CancelarDialog } from '../features/alertas/cancelar-dialog';
import { ESTADOS_ASIGNABLES, ESTADOS_FINALES } from './etiquetas';
import { Alerta } from './models';

/**
 * Acciones manuales de la central sobre una alerta. Se abren como diálogo desde el monitoreo y desde
 * el detalle; cada método emite `true` si la acción se hizo (para que la pantalla se refresque).
 */
@Injectable({ providedIn: 'root' })
export class IntervencionService {
  private readonly dialog = inject(MatDialog);

  /** La central puede asignar una unidad mientras no haya una en camino. */
  puedeAsignar(a: Alerta): boolean {
    return ESTADOS_ASIGNABLES.includes(a.estado);
  }

  /** La central puede cancelar cualquier alerta que siga activa. */
  puedeCancelar(a: Alerta): boolean {
    return !ESTADOS_FINALES.includes(a.estado);
  }

  asignar(alerta: Alerta): Observable<boolean> {
    return this.dialog
      .open<AsignarDialog, Alerta, boolean>(AsignarDialog, { data: alerta, width: '600px' })
      .afterClosed()
      .pipe(map((ok) => ok === true));
  }

  cancelar(alerta: Alerta): Observable<boolean> {
    return this.dialog
      .open<CancelarDialog, Alerta, boolean>(CancelarDialog, { data: alerta, width: '500px' })
      .afterClosed()
      .pipe(map((ok) => ok === true));
  }
}
