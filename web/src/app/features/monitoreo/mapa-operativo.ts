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
import type { Feature, Geometry } from 'geojson';
import * as L from 'leaflet';
import { ESTADOS_ALERTA, ESTADOS_UNIDAD, iconoDeTipo } from '../../core/etiquetas';
import { Alerta, Unidad, Zona } from '../../core/models';

/** Estados en los que la alerta pulsa en el mapa: nadie la está atendiendo todavía. */
const PULSAN = new Set(['CREADA', 'BUSCANDO_UNIDAD', 'SIN_UNIDAD']);

function esc(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function iconoAlerta(a: Alerta, seleccionada: boolean): L.DivIcon {
  const clases = ['marcador-alerta', seleccionada ? 'seleccionada' : '', PULSAN.has(a.estado) ? 'pulso' : ''];
  return L.divIcon({
    className: clases.filter(Boolean).join(' '),
    html: `<span class="punto" style="--c:var(${ESTADOS_ALERTA[a.estado].css})"><span class="material-symbols-rounded">${iconoDeTipo(a.tipo)}</span></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function iconoUnidad(u: Unidad): L.DivIcon {
  return L.divIcon({
    className: 'marcador-unidad',
    html: `<span class="cuadro" style="--c:var(${ESTADOS_UNIDAD[u.estado].css})"><span class="material-symbols-rounded">local_police</span></span><span class="etiqueta">${esc(u.codigo)}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Mapa del distrito (OpenStreetMap + Leaflet). Dibuja el límite, las alertas y las unidades;
 * los marcadores se actualizan en sitio cuando cambian los datos (sin recrear el mapa).
 */
@Component({
  selector: 'app-mapa-operativo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block size-full' },
  template: `<div #contenedor class="size-full" role="application" aria-label="Mapa del distrito de La Victoria"></div>`,
})
export class MapaOperativo {
  readonly alertas = input<Alerta[]>([]);
  readonly unidades = input<Unidad[]>([]);
  readonly zonas = input<Zona[]>([]);
  readonly seleccionadaId = input<number | null>(null);
  /** Si se indica, el mapa se centra ahí (detalle de una alerta) en lugar de encuadrar el distrito. */
  readonly centro = input<{ latitud: number; longitud: number; zoom: number } | null>(null);
  /** Se emite con el id de la alerta pulsada. */
  readonly seleccionar = output<number>();

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private readonly listo = signal(false);
  private readonly destroyRef = inject(DestroyRef);

  private mapa: L.Map | null = null;
  private capaZonas: L.GeoJSON | null = null;
  private readonly marcadoresAlerta = new Map<number, L.Marker>();
  private readonly marcadoresUnidad = new Map<number, L.Marker>();
  private encuadrado = false;

  constructor() {
    afterNextRender(() => this.iniciar());
    this.destroyRef.onDestroy(() => {
      this.mapa?.remove();
      this.mapa = null;
    });

    effect(() => this.dibujarZonas(this.listo() ? this.zonas() : []));
    effect(() => this.dibujarAlertas(this.listo() ? this.alertas() : [], this.seleccionadaId()));
    effect(() => this.dibujarUnidades(this.listo() ? this.unidades() : []));
    effect(() => {
      const c = this.centro();
      if (this.listo() && c && this.mapa) {
        this.mapa.setView([c.latitud, c.longitud], c.zoom);
        this.encuadrado = true;
      }
    });
    effect(() => {
      const id = this.seleccionadaId();
      const alerta = id === null ? null : this.alertas().find((a) => a.id === id);
      if (this.listo() && alerta && this.mapa && !this.centro()) {
        this.mapa.panTo([alerta.latitud, alerta.longitud], { animate: true });
      }
    });
  }

  private iniciar(): void {
    const mapa = L.map(this.contenedor().nativeElement, { zoomControl: false, minZoom: 12, maxZoom: 19 });
    L.control.zoom({ position: 'bottomright' }).addTo(mapa);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
    // Vista inicial razonable hasta que llegue el límite del distrito (Chiclayo)
    mapa.setView([-6.8191, -79.8676], 13);
    this.mapa = mapa;

    // El contenedor cambia de tamaño con la ventana o el panel lateral
    const observador = new ResizeObserver(() => mapa.invalidateSize());
    observador.observe(this.contenedor().nativeElement);
    this.destroyRef.onDestroy(() => observador.disconnect());

    this.listo.set(true);
  }

  private dibujarZonas(zonas: Zona[]): void {
    if (!this.mapa) {
      return;
    }
    this.capaZonas?.remove();
    this.capaZonas = null;
    if (zonas.length === 0) {
      return;
    }
    const capa = L.geoJSON(undefined, {
      // El color sale de CSS (tailwind.css, .zona-distrito) para que siga el modo claro/oscuro
      style: (f) => ({ className: f?.properties?.['tipo'] === 'DISTRITO' ? 'zona-distrito' : 'zona-sector', weight: 3 }),
      interactive: false,
      onEachFeature: (f, capaZona) => {
        if (f.properties?.['tipo'] === 'SECTOR') {
          capaZona.bindTooltip(esc(String(f.properties['nombre'])), { permanent: true, direction: 'center', className: 'etiqueta-sector' });
        }
      },
    });
    for (const z of zonas) {
      const poligono: Feature = {
        type: 'Feature',
        properties: { tipo: z.tipo, nombre: z.nombre },
        geometry: JSON.parse(z.geojson) as Geometry,
      };
      capa.addData(poligono);
    }
    capa.addTo(this.mapa);
    this.capaZonas = capa;

    const distrito = zonas.find((z) => z.tipo === 'DISTRITO');
    if (distrito) {
      const limites = L.geoJSON(JSON.parse(distrito.geojson)).getBounds();
      this.mapa.setMaxBounds(limites.pad(0.6));
      if (!this.encuadrado && !this.centro()) {
        this.mapa.fitBounds(limites, { padding: [20, 20] });
        this.encuadrado = true;
      }
    }
  }

  private dibujarAlertas(alertas: Alerta[], seleccionada: number | null): void {
    if (!this.mapa) {
      return;
    }
    const vigentes = new Set(alertas.map((a) => a.id));
    for (const [id, marcador] of this.marcadoresAlerta) {
      if (!vigentes.has(id)) {
        marcador.remove();
        this.marcadoresAlerta.delete(id);
      }
    }
    for (const a of alertas) {
      const icono = iconoAlerta(a, a.id === seleccionada);
      const existente = this.marcadoresAlerta.get(a.id);
      if (existente) {
        existente.setLatLng([a.latitud, a.longitud]).setIcon(icono);
      } else {
        const marcador = L.marker([a.latitud, a.longitud], { icon: icono, zIndexOffset: 500, keyboard: true, title: `${a.tipoNombre} · ALR-${String(a.id).padStart(6, '0')}` });
        marcador.on('click', () => this.seleccionar.emit(a.id));
        marcador.addTo(this.mapa);
        this.marcadoresAlerta.set(a.id, marcador);
      }
    }
  }

  private dibujarUnidades(unidades: Unidad[]): void {
    if (!this.mapa) {
      return;
    }
    const conPosicion = unidades.filter((u) => u.latitud !== null && u.longitud !== null);
    const vigentes = new Set(conPosicion.map((u) => u.id));
    for (const [id, marcador] of this.marcadoresUnidad) {
      if (!vigentes.has(id)) {
        marcador.remove();
        this.marcadoresUnidad.delete(id);
      }
    }
    for (const u of conPosicion) {
      const posicion: L.LatLngTuple = [u.latitud as number, u.longitud as number];
      const existente = this.marcadoresUnidad.get(u.id);
      if (existente) {
        existente.setLatLng(posicion).setIcon(iconoUnidad(u));
      } else {
        const marcador = L.marker(posicion, { icon: iconoUnidad(u), interactive: false, keyboard: false });
        marcador.addTo(this.mapa);
        this.marcadoresUnidad.set(u.id, marcador);
      }
    }
  }
}
