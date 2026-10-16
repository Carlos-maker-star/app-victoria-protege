import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { environment } from '../../../environments/environment';
import { AdminService } from '../../core/api/admin.service';
import { extraerGeometria, poligonoGeoJson } from './zonas-admin';
import { CuadriculaDialog, NombreSectorDialog } from './zona-dialogs';

const API = `${environment.apiUrl}/admin`;

function proveer(datos: unknown) {
  const cerrar = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MAT_DIALOG_DATA, useValue: datos },
      { provide: MatDialogRef, useValue: { close: cerrar } },
    ],
  });
  return { cerrar, backend: TestBed.inject(HttpTestingController) };
}

describe('poligonoGeoJson', () => {
  it('invierte [lat, lon] a [lon, lat] y cierra el anillo', () => {
    const g = JSON.parse(poligonoGeoJson([[-6.8, -79.8], [-6.8, -79.9], [-6.9, -79.9]]));
    expect(g.type).toBe('Polygon');
    expect(g.coordinates[0]).toEqual([[-79.8, -6.8], [-79.9, -6.8], [-79.9, -6.9], [-79.8, -6.8]]);
  });
});

describe('AdminService (zonas)', () => {
  it('usa las rutas de sectores', () => {
    const { backend } = proveer(null);
    const s = TestBed.inject(AdminService);
    s.zonas().subscribe();
    backend.expectOne({ method: 'GET', url: `${API}/zonas` });
    s.crearSector({ nombre: 'A', geojson: '{}' }).subscribe();
    expect(backend.expectOne({ method: 'POST', url: `${API}/zonas` }).request.body).toEqual({ nombre: 'A', geojson: '{}' });
    s.renombrarSector(4, 'B').subscribe();
    expect(backend.expectOne({ method: 'PUT', url: `${API}/zonas/4` }).request.body).toEqual({ nombre: 'B' });
    s.activarSector(4, false).subscribe();
    expect(backend.expectOne({ method: 'PATCH', url: `${API}/zonas/4/activo` }).request.body).toEqual({ activo: false });
    s.generarCuadricula({ filas: 2, columnas: 3, reemplazar: true }).subscribe();
    expect(backend.expectOne({ method: 'POST', url: `${API}/zonas/cuadricula` }).request.body).toEqual({ filas: 2, columnas: 3, reemplazar: true });
    s.recalcularSectores().subscribe();
    backend.expectOne({ method: 'POST', url: `${API}/zonas/recalcular` });
  });
});

describe('NombreSectorDialog', () => {
  it('no acepta un nombre vacío y recorta los espacios', () => {
    const { cerrar } = proveer({ titulo: 'Nuevo sector', nombre: '', confirmar: 'Crear' });
    const f = TestBed.createComponent(NombreSectorDialog);
    f.detectChanges();
    const c = f.componentInstance as unknown as { nombre: { setValue(v: string): void }; aceptar(): void };
    c.aceptar();
    expect(cerrar).not.toHaveBeenCalled();
    c.nombre.setValue('   ');
    c.aceptar();
    expect(cerrar).not.toHaveBeenCalled();
    c.nombre.setValue('  Norte ');
    c.aceptar();
    expect(cerrar).toHaveBeenCalledWith('Norte');
  });
});

describe('CuadriculaDialog', () => {
  it('limita filas y columnas a 1–5', () => {
    const { cerrar } = proveer({ hayActivos: false });
    const f = TestBed.createComponent(CuadriculaDialog);
    f.detectChanges();
    const c = f.componentInstance as unknown as { form: { patchValue(v: object): void }; aceptar(): void };
    c.form.patchValue({ filas: 6 });
    c.aceptar();
    expect(cerrar).not.toHaveBeenCalled();
    c.form.patchValue({ filas: 3, columnas: 2 });
    c.aceptar();
    expect(cerrar).toHaveBeenCalledWith({ filas: 3, columnas: 2, reemplazar: false });
  });
});

describe('extraerGeometria', () => {
  const poligono = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

  it('acepta un Polygon, un Feature y un FeatureCollection', () => {
    expect(JSON.parse(extraerGeometria(JSON.stringify(poligono))!)).toEqual(poligono);
    expect(JSON.parse(extraerGeometria(JSON.stringify({ type: 'Feature', geometry: poligono, properties: {} }))!)).toEqual(poligono);
    const coleccion = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } }, { type: 'Feature', geometry: poligono }] };
    expect(JSON.parse(extraerGeometria(JSON.stringify(coleccion))!)).toEqual(poligono);
  });

  it('rechaza lo que no es un polígono o no es JSON', () => {
    expect(extraerGeometria('no es json')).toBeNull();
    expect(extraerGeometria(JSON.stringify({ type: 'Point', coordinates: [0, 0] }))).toBeNull();
    expect(extraerGeometria(JSON.stringify({ type: 'FeatureCollection', features: [] }))).toBeNull();
  });
});

describe('AdminService.redefinirDistrito', () => {
  it('hace PUT a /zonas/distrito con el GeoJSON', () => {
    const { backend } = proveer(null);
    TestBed.inject(AdminService).redefinirDistrito('{"type":"Polygon"}').subscribe();
    expect(backend.expectOne({ method: 'PUT', url: `${API}/zonas/distrito` }).request.body).toEqual({ geojson: '{"type":"Polygon"}' });
  });
});
