import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificacionService {
  private readonly snackBar = inject(MatSnackBar);

  exito(mensaje: string): void {
    this.snackBar.open(mensaje, 'OK', { duration: 3500, panelClass: 'aviso-exito' });
  }

  error(mensaje: string): void {
    this.snackBar.open(mensaje, 'Cerrar', { duration: 6000, panelClass: 'aviso-error' });
  }
}
