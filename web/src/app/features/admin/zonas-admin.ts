import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { AdminService } from '../../core/api/admin.service';
import { ZonaAdmin } from '../../core/models';
import { MonitoreoStore } from '../../core/monitoreo.store';
import { NotificacionService } from '../../core/notificacion.service';
import { ConfirmarDatos, ConfirmarDialog } from '../../shared/confirmar-dialog';
import { MapaZonas } from './mapa-zonas';
import { CuadriculaDatos, CuadriculaDialog, NombreSectorDatos, NombreSectorDialog } from './zona-dialogs';

/** Convierte los vértices [lat, lon] en un polígono GeoJSON cerrado ([lon, lat]). */
export function poligonoGeoJson(vertices: [number, number][]): string {
  const anillo = vertices.map(([lat, lon]) => [lon, lat]);
  anillo.push(anillo[0]);
  return JSON.stringify({ type: 'Polygon', coordinates: [anillo] });
}

/**
 * Saca el polígono de un archivo GeoJSON (Polygon, MultiPolygon, Feature o FeatureCollection).
 * Devuelve el texto de la geometría o null si el archivo no trae un polígono.
 */
export function extraerGeometria(contenido: string): string | null {
  try {
    let g = JSON.parse(contenido);
    if (g?.type === 'FeatureCollection') {
      g = g.features?.find((f: { geometry?: { type?: string } }) => /Polygon/.test(f?.geometry?.type ?? ''));
    }
    if (g?.type === 'Feature') {
      g = g.geometry;
    }
    return g && (g.type === 'Polygon' || g.type === 'MultiPolygon') ? JSON.stringify(g) : null;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-zonas-admin',
  imports: [MatButton, MatIconButton, MatIcon, MatProgressBar, MatTooltip, MapaZonas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './zonas-admin.html',
})
export class ZonasAdmin {
  private readonly admin = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly notificar = inject(NotificacionService);
  private readonly store = inject(MonitoreoStore);
  private readonly mapa = viewChild(MapaZonas);

  protected readonly zonas = signal<ZonaAdmin[]>([]);
  protected readonly cargando = signal(false);
  protected readonly dibujando = signal(false);
  /** Qué se está dibujando: un sector nuevo o el nuevo límite del distrito. */
  protected readonly dibujo = signal<'sector' | 'distrito'>('sector');
  protected readonly verInactivos = signal(false);
  protected readonly vertices = signal<[number, number][]>([]);
  protected readonly seleccionadaId = signal<number | null>(null);
  private readonly recarga = signal(0);

  /** El mapa oculta los sectores inactivos (si no, se amontonan sus rótulos) salvo que se pida verlos. */
  protected readonly zonasMapa = computed(() =>
    this.zonas().filter((z) => z.tipo === 'DISTRITO' || z.activo || this.verInactivos() || z.id === this.seleccionadaId()),
  );
  protected readonly inactivos = computed(() => this.sectores().filter((z) => !z.activo).length);
  protected readonly distrito = computed(() => this.zonas().find((z) => z.tipo === 'DISTRITO') ?? null);
  protected readonly sectores = computed(() => this.zonas().filter((z) => z.tipo === 'SECTOR'));
  protected readonly activos = computed(() => this.sectores().filter((z) => z.activo));
  protected readonly sinSector = computed(() => this.activos().length === 0);

  constructor() {
    effect((alCerrar) => {
      this.recarga();
      this.cargando.set(true);
      const sub = this.admin.zonas().subscribe({
        next: (l) => {
          this.zonas.set(l);
          this.cargando.set(false);
        },
        error: () => this.cargando.set(false),
      });
      alCerrar(() => sub.unsubscribe());
    });
  }

  // ---- dibujo de un sector
  protected empezarDibujo(tipo: 'sector' | 'distrito' = 'sector'): void {
    this.dibujo.set(tipo);
    this.seleccionadaId.set(null);
    this.vertices.set([]);
    this.dibujando.set(true);
  }

  protected cancelarDibujo(): void {
    this.dibujando.set(false);
    this.vertices.set([]);
  }

  protected deshacer(): void {
    this.mapa()?.deshacer();
  }

  protected guardarDibujo(): void {
    const puntos = this.vertices();
    if (puntos.length < 3) {
      return;
    }
    if (this.dibujo() === 'distrito') {
      this.confirmarDistrito(poligonoGeoJson(puntos));
      return;
    }
    const datos: NombreSectorDatos = { titulo: 'Nuevo sector', nombre: `Sector ${this.sectores().length + 1}`, confirmar: 'Crear sector' };
    this.dialog
      .open(NombreSectorDialog, { data: datos, width: '420px' })
      .afterClosed()
      .subscribe((nombre?: string) => {
        if (!nombre) {
          return;
        }
        this.admin.crearSector({ nombre, geojson: poligonoGeoJson(puntos) }).subscribe((z) => {
          this.notificar.exito(`Sector «${z.nombre}» creado.`);
          this.cancelarDibujo();
          this.seleccionadaId.set(z.id);
          this.cambioTerminado();
        });
      });
  }

  // ---- límite del distrito
  /** Lee un archivo GeoJSON con el límite que entregó la municipalidad. */
  protected async cargarArchivo(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) {
      return;
    }
    const geometria = extraerGeometria(await archivo.text());
    if (!geometria) {
      this.notificar.error('El archivo no tiene un polígono. Usa un GeoJSON (.geojson o .json) con un Polygon o MultiPolygon.');
      return;
    }
    this.confirmarDistrito(geometria);
  }

  private confirmarDistrito(geojson: string): void {
    const datos: ConfirmarDatos = {
      titulo: '¿Cambiar el límite del distrito?',
      mensaje:
        'Desde ahora solo se aceptarán alertas dentro del nuevo límite (con 50 m de tolerancia). No se puede hacer si deja fuera algún sector activo o alguna alerta en curso. Se registra en la auditoría.',
      confirmar: 'Cambiar límite',
      peligro: true,
    };
    this.dialog
      .open(ConfirmarDialog, { data: datos, width: '480px' })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) {
          return;
        }
        this.admin.redefinirDistrito(geojson).subscribe((z) => {
          this.notificar.exito(`Límite actualizado: ${z.areaKm2} km².`);
          this.cancelarDibujo();
          this.cambioTerminado();
        });
      });
  }

  // ---- acciones sobre sectores
  protected cuadricula(): void {
    const datos: CuadriculaDatos = { hayActivos: !this.sinSector() };
    this.dialog
      .open(CuadriculaDialog, { data: datos, width: '480px' })
      .afterClosed()
      .subscribe((parametros) => {
        if (!parametros) {
          return;
        }
        this.admin.generarCuadricula(parametros).subscribe((creados) => {
          this.notificar.exito(`${creados.length} sectores generados.`);
          this.seleccionadaId.set(null);
          this.cambioTerminado();
        });
      });
  }

  protected renombrar(z: ZonaAdmin): void {
    const datos: NombreSectorDatos = { titulo: 'Renombrar sector', nombre: z.nombre, confirmar: 'Guardar' };
    this.dialog
      .open(NombreSectorDialog, { data: datos, width: '420px' })
      .afterClosed()
      .subscribe((nombre?: string) => {
        if (nombre && nombre !== z.nombre) {
          this.admin.renombrarSector(z.id, nombre).subscribe(() => {
            this.notificar.exito('Sector renombrado.');
            this.cambioTerminado();
          });
        }
      });
  }

  protected alternarActivo(z: ZonaAdmin): void {
    if (!z.activo) {
      this.cambiarActivo(z, true);
      return;
    }
    const datos: ConfirmarDatos = {
      titulo: `¿Desactivar «${z.nombre}»?`,
      mensaje: 'Deja de verse en el mapa y las alertas que caen ahí pasan a «Sin sector asignado» en los reportes. Se puede reactivar.',
      confirmar: 'Desactivar',
      peligro: true,
    };
    this.dialog.open(ConfirmarDialog, { data: datos, width: '460px' }).afterClosed().subscribe((ok) => ok && this.cambiarActivo(z, false));
  }

  protected recalcular(): void {
    this.admin.recalcularSectores().subscribe((n) => {
      this.notificar.exito(n === 0 ? 'Todas las alertas ya estaban en su sector.' : `${n} alertas cambiaron de sector.`);
      this.cambioTerminado();
    });
  }

  protected seleccionar(id: number | null): void {
    this.seleccionadaId.set(id);
  }

  private cambiarActivo(z: ZonaAdmin, activo: boolean): void {
    this.admin.activarSector(z.id, activo).subscribe(() => {
      this.notificar.exito(activo ? `Sector «${z.nombre}» activado.` : `Sector «${z.nombre}» desactivado.`);
      this.cambioTerminado();
    });
  }

  /** Recarga la lista y avisa al mapa operativo para que muestre los sectores nuevos. */
  private cambioTerminado(): void {
    this.recarga.update((n) => n + 1);
    this.store.recargarZonas();
  }
}
