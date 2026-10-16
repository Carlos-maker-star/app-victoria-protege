import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import { debounceTime } from 'rxjs';
import { AdminService } from '../../core/api/admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { ROLES, ROLES_CLASES } from '../../core/etiquetas';
import { Rol, UsuarioAdmin } from '../../core/models';
import { NotificacionService } from '../../core/notificacion.service';
import { Avatar } from '../../shared/avatar';
import { ConfirmarDatos, ConfirmarDialog } from '../../shared/confirmar-dialog';
import { ClaveDialog } from './clave-dialog';
import { UsuarioDialog } from './usuario-dialog';

@Component({
  selector: 'app-usuarios-admin',
  imports: [DatePipe, ReactiveFormsModule, MatButton, MatIconButton, MatFormField, MatLabel, MatIcon, MatInput, MatSelect, MatOption, MatProgressBar, MatTooltip, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './usuarios-admin.html',
})
export class UsuariosAdmin {
  private readonly admin = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly notificar = inject(NotificacionService);
  protected readonly yo = inject(AuthService).usuario;

  protected readonly busqueda = new FormControl('', { nonNullable: true });
  private readonly texto = toSignal(this.busqueda.valueChanges.pipe(debounceTime(300)), { initialValue: '' });
  protected readonly rol = signal<Rol | null>(null);

  protected readonly usuarios = signal<UsuarioAdmin[]>([]);
  protected readonly cargando = signal(false);
  private readonly recarga = signal(0);

  protected readonly roles = (Object.entries(ROLES) as [Rol, string][]).map(([codigo, etiqueta]) => ({ codigo, etiqueta }));
  protected readonly etiquetaRol = ROLES;
  protected readonly clasesRol = ROLES_CLASES;
  protected readonly hayFiltros = computed(() => this.rol() !== null || this.texto() !== '');

  constructor() {
    effect((alCerrar) => {
      this.recarga();
      this.cargando.set(true);
      const sub = this.admin.usuarios({ rol: this.rol(), q: this.texto() }).subscribe({
        next: (lista) => {
          this.usuarios.set(lista);
          this.cargando.set(false);
        },
        error: () => this.cargando.set(false),
      });
      alCerrar(() => sub.unsubscribe());
    });
  }

  protected nuevo(): void {
    this.abrir(UsuarioDialog, null);
  }

  protected editar(u: UsuarioAdmin): void {
    this.abrir(UsuarioDialog, u);
  }

  protected clave(u: UsuarioAdmin): void {
    this.abrir(ClaveDialog, u, '440px');
  }

  protected limpiar(): void {
    this.busqueda.setValue('');
    this.rol.set(null);
  }

  protected alternarActivo(u: UsuarioAdmin): void {
    if (u.activo) {
      const datos: ConfirmarDatos = {
        titulo: `¿Desactivar a ${u.nombres} ${u.apellidos}?`,
        mensaje:
          u.rol === 'SERENO'
            ? 'No podrá iniciar sesión y su unidad dejará de recibir alertas. Si tiene una alerta en curso, no se podrá desactivar.'
            : 'No podrá iniciar sesión. Sus datos y su historial se conservan.',
        confirmar: 'Desactivar',
        peligro: true,
      };
      this.dialog.open(ConfirmarDialog, { data: datos, width: '460px' }).afterClosed().subscribe((ok) => ok && this.cambiarActivo(u, false));
    } else {
      this.cambiarActivo(u, true);
    }
  }

  private cambiarActivo(u: UsuarioAdmin, activo: boolean): void {
    this.admin.activarUsuario(u.id, activo).subscribe(() => {
      this.notificar.exito(activo ? 'Usuario activado.' : 'Usuario desactivado.');
      this.recarga.update((n) => n + 1);
    });
  }

  private abrir(componente: typeof UsuarioDialog | typeof ClaveDialog, datos: UsuarioAdmin | null, ancho = '560px'): void {
    this.dialog.open<unknown, UsuarioAdmin | null, boolean>(componente, { data: datos, width: ancho }).afterClosed().subscribe((ok) => {
      if (ok) {
        this.recarga.update((n) => n + 1);
      }
    });
  }
}
