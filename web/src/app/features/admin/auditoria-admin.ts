import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { AdminService } from '../../core/api/admin.service';
import { PaginaAuditoria } from '../../core/models';

const TAMANO = 25;

/** Nombres legibles de las acciones que registra el backend. Las que no estén aquí se muestran con su código. */
export const ACCIONES_AUDITORIA: Record<string, string> = {
  LOGIN: 'Inicio de sesión',
  LOGIN_FALLIDO: 'Intento de acceso fallido',
  LOGIN_BLOQUEADO: 'Cuenta bloqueada por intentos',
  REGISTRO: 'Registro de ciudadano',
  CLAVE_CAMBIADA: 'Cambio de contraseña',
  ASIGNACION_MANUAL: 'Asignación manual',
  ALERTA_CANCELADA: 'Alerta cancelada por la central',
  EVIDENCIA_AGREGADA: 'Evidencia agregada',
  SECTOR_CREADO: 'Sector creado',
  SECTOR_RENOMBRADO: 'Sector renombrado',
  SECTOR_ACTIVADO: 'Sector activado',
  SECTOR_DESACTIVADO: 'Sector desactivado',
  SECTORES_GENERADOS: 'Sectores generados',
  SECTORES_RECALCULADOS: 'Alertas reubicadas por sector',
};

/** Colores por gravedad: lo que merece atención (accesos fallidos, bloqueos, cancelaciones) se distingue. */
function claseAccion(accion: string): string {
  if (accion === 'LOGIN_BLOQUEADO' || accion === 'LOGIN_FALLIDO') {
    return 'bg-peligro-bg text-peligro-fg';
  }
  if (accion === 'ALERTA_CANCELADA' || accion === 'ASIGNACION_MANUAL') {
    return 'bg-atencion-bg text-atencion-fg';
  }
  return 'bg-neutro-bg text-neutro-fg';
}

@Component({
  selector: 'app-auditoria-admin',
  imports: [DatePipe, FormsModule, MatIcon, MatIconButton, MatProgressBar, MatTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auditoria-admin.html',
})
export class AuditoriaAdmin {
  private readonly admin = inject(AdminService);

  protected readonly pagina = signal<PaginaAuditoria>({ total: 0, pagina: 0, tamano: TAMANO, items: [] });
  protected readonly acciones = signal<string[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal(false);

  // Filtros: los de texto se aplican al pulsar «Buscar» o Enter; el resto, al cambiar.
  protected accion = '';
  protected texto = '';
  protected desde = '';
  protected hasta = '';
  private readonly filtro = signal({ accion: '', q: '', desde: '', hasta: '', pagina: 0 });

  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.pagina().total / TAMANO)));
  protected readonly rango = computed(() => {
    const p = this.pagina();
    if (p.total === 0) {
      return 'Sin registros';
    }
    return `${p.pagina * TAMANO + 1}–${p.pagina * TAMANO + p.items.length} de ${p.total}`;
  });

  protected readonly nombres = ACCIONES_AUDITORIA;
  protected readonly clase = claseAccion;

  constructor() {
    this.admin.accionesAuditoria().subscribe((a) => this.acciones.set(a));
    effect((alCerrar) => {
      const f = this.filtro();
      this.cargando.set(true);
      const sub = this.admin.auditoria({ ...f, tamano: TAMANO }).subscribe({
        next: (p) => {
          this.pagina.set(p);
          this.error.set(false);
          this.cargando.set(false);
        },
        error: () => {
          this.error.set(true);
          this.cargando.set(false);
        },
      });
      alCerrar(() => sub.unsubscribe());
    });
  }

  protected buscar(): void {
    this.filtro.set({ accion: this.accion, q: this.texto.trim(), desde: this.desde, hasta: this.hasta, pagina: 0 });
  }

  protected limpiar(): void {
    this.accion = this.texto = this.desde = this.hasta = '';
    this.buscar();
  }

  protected irA(pagina: number): void {
    this.filtro.update((f) => ({ ...f, pagina }));
  }

  protected nombreAccion(codigo: string): string {
    return ACCIONES_AUDITORIA[codigo] ?? codigo;
  }
}
