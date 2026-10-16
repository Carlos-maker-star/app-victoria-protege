import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { AdminService } from '../../core/api/admin.service';
import { NotificacionService } from '../../core/notificacion.service';
import { UnidadAdmin } from '../../core/models';
import { Avatar } from '../../shared/avatar';
import { EstadoUnidadBadge } from '../../shared/badges';
import { ConfirmarDatos, ConfirmarDialog } from '../../shared/confirmar-dialog';
import { UnidadDialog } from './unidad-dialog';

const TIPOS: Record<string, string> = { CAMIONETA: 'Camioneta', MOTO: 'Moto', PATRULLERO: 'Patrullero', OTRO: 'Otro' };

@Component({
  selector: 'app-unidades-admin',
  imports: [MatButton, MatIconButton, MatIcon, MatProgressBar, MatTooltip, Avatar, EstadoUnidadBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unidades-admin.html',
})
export class UnidadesAdmin {
  private readonly admin = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly notificar = inject(NotificacionService);

  protected readonly unidades = signal<UnidadAdmin[]>([]);
  protected readonly cargando = signal(false);
  private readonly recarga = signal(0);
  protected readonly tipos = TIPOS;

  protected readonly resumen = computed(() => {
    const l = this.unidades();
    const activas = l.filter((u) => u.activo).length;
    return `${l.length} unidades · ${activas} activas · ${l.length - activas} inactivas`;
  });

  constructor() {
    effect((alCerrar) => {
      this.recarga();
      this.cargando.set(true);
      const sub = this.admin.unidades().subscribe({
        next: (l) => {
          this.unidades.set(l);
          this.cargando.set(false);
        },
        error: () => this.cargando.set(false),
      });
      alCerrar(() => sub.unsubscribe());
    });
  }

  protected nueva(): void {
    this.abrir(null);
  }

  protected editar(u: UnidadAdmin): void {
    this.abrir(u);
  }

  protected alternarActivo(u: UnidadAdmin): void {
    if (u.activo) {
      const datos: ConfirmarDatos = {
        titulo: `¿Desactivar la unidad ${u.codigo}?`,
        mensaje: 'Dejará de recibir alertas y de aparecer en el mapa. Podrás reactivarla cuando quieras. Si tiene una alerta en curso, no se podrá desactivar.',
        confirmar: 'Desactivar',
        peligro: true,
      };
      this.dialog.open(ConfirmarDialog, { data: datos, width: '460px' }).afterClosed().subscribe((ok) => ok && this.cambiar(u, false));
    } else {
      this.cambiar(u, true);
    }
  }

  private cambiar(u: UnidadAdmin, activo: boolean): void {
    this.admin.activarUnidad(u.id, activo).subscribe(() => {
      this.notificar.exito(activo ? `Unidad ${u.codigo} activada.` : `Unidad ${u.codigo} desactivada.`);
      this.recarga.update((n) => n + 1);
    });
  }

  private abrir(datos: UnidadAdmin | null): void {
    this.dialog.open<UnidadDialog, UnidadAdmin | null, boolean>(UnidadDialog, { data: datos, width: '540px' }).afterClosed().subscribe((ok) => {
      if (ok) {
        this.recarga.update((n) => n + 1);
      }
    });
  }
}
