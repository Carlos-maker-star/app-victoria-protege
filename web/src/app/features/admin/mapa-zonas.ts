import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Geometry } from 'geojson';
import * as L from 'leaflet';
import { ZonaAdmin } from '../../core/models';

function esc(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Mapa de la pantalla de sectores: muestra el distrito y los sectores y, en modo dibujo, deja marcar los
 * vértices de un polígono con clics. Los vértices se emiten como [latitud, longitud]; guardar es cosa del padre.
 */
@Component({
  selector: 'app-mapa-zonas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block size-full' },
  template: `<div #contenedor class="size-full" role="application" aria-label="Mapa para editar los sectores"></div>`,
})
export class MapaZonas {
  readonly zonas = input<ZonaAdmin[]>([]);
  readonly seleccionadaId = input<number | null>(null);
  readonly dibujando = input(false);
  /** Vértices del polígono en dibujo, cada vez que cambian. */
  readonly vertices = output<[number, number][]>();
  readonly seleccionar = output<number>();

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private readonly listo = signal(false);
  private readonly destroyRef = inject(DestroyRef);

  private mapa: L.Map | null = null;
  private capaZonas: L.LayerGroup | null = null;
  private readonly borrador = L.layerGroup();
  private puntos: [number, number][] = [];
  private encuadrado = false;

  constructor() {
    afterNextRender(() => this.iniciar());
    this.destroyRef.onDestroy(() => {
      this.mapa?.remove();
      this.mapa = null;
    });
    effect(() => this.dibujarZonas(this.listo() ? this.zonas() : [], this.seleccionadaId()));
    effect(() => {
      const activo = this.dibujando();
      if (!this.listo() || !this.mapa) {
        return;
      }
      this.mapa.getContainer().style.cursor = activo ? 'crosshair' : '';
      if (!activo) {
        this.limpiar();
      }
    });
  }

  /** Quita el último vértice. */
  deshacer(): void {
    this.puntos.pop();
    this.redibujarBorrador();
  }

  limpiar(): void {
    this.puntos = [];
    this.redibujarBorrador();
  }

  private iniciar(): void {
    const mapa = L.map(this.contenedor().nativeElement, { zoomControl: false, minZoom: 12, maxZoom: 19 });
    L.control.zoom({ position: 'bottomright' }).addTo(mapa);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
    mapa.setView([-6.8191, -79.8676], 13);
    this.borrador.addTo(mapa);
    mapa.on('click', (e: L.LeafletMouseEvent) => {
      if (this.dibujando()) {
        this.puntos.push([e.latlng.lat, e.latlng.lng]);
        this.redibujarBorrador();
      }
    });
    this.mapa = mapa;
    const observador = new ResizeObserver(() => mapa.invalidateSize());
    observador.observe(this.contenedor().nativeElement);
    this.destroyRef.onDestroy(() => observador.disconnect());
    this.listo.set(true);
  }

  private redibujarBorrador(): void {
    this.borrador.clearLayers();
    for (const p of this.puntos) {
      L.circleMarker(p, { radius: 5, className: 'vertice-borrador', interactive: false }).addTo(this.borrador);
    }
    if (this.puntos.length >= 2) {
      L.polygon(this.puntos, { className: 'sector-borrador', interactive: false }).addTo(this.borrador);
    }
    this.vertices.emit([...this.puntos]);
  }

  private dibujarZonas(zonas: ZonaAdmin[], seleccionada: number | null): void {
    if (!this.mapa) {
      return;
    }
    this.capaZonas?.remove();
    const grupo = L.layerGroup();
    for (const z of zonas) {
      const geometria = JSON.parse(z.geojson) as Geometry;
      const esSector = z.tipo === 'SECTOR';
      const clase = !esSector
        ? 'zona-distrito'
        : !z.activo
          ? 'sector-inactivo'
          : z.id === seleccionada
            ? 'sector-activo seleccionado'
            : 'sector-activo';
      const capa = L.geoJSON(geometria, { style: () => ({ className: clase, weight: esSector ? 2 : 3 }), interactive: esSector });
      if (esSector) {
        capa.bindTooltip(esc(z.nombre) + (z.activo ? '' : ' (inactivo)'), { permanent: true, direction: 'center', className: 'etiqueta-sector' });
        capa.on('click', (e) => {
          if (!this.dibujando()) {
            L.DomEvent.stopPropagation(e);
            this.seleccionar.emit(z.id);
          }
        });
      }
      capa.addTo(grupo);
    }
    grupo.addTo(this.mapa);
    this.capaZonas = grupo;

    const distrito = zonas.find((z) => z.tipo === 'DISTRITO');
    if (distrito && !this.encuadrado) {
      this.mapa.fitBounds(L.geoJSON(JSON.parse(distrito.geojson) as Geometry).getBounds(), { padding: [20, 20] });
      this.encuadrado = true;
    }
  }
}
