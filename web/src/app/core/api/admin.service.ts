import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActualizarUnidad,
  ActualizarUsuario,
  CrearSector,
  CrearUnidad,
  CrearUsuario,
  FiltroAuditoria,
  GenerarCuadricula,
  PaginaAuditoria,
  Parametro,
  Rol,
  UnidadAdmin,
  UsuarioAdmin,
  ZonaAdmin,
} from '../models';

/** Endpoints de administración: /api/admin/** (solo el rol ADMIN). */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin`;

  // ---- usuarios
  usuarios(filtro: { rol?: Rol | null; q?: string; sinUnidad?: boolean } = {}): Observable<UsuarioAdmin[]> {
    let params = new HttpParams();
    if (filtro.rol) {
      params = params.set('rol', filtro.rol);
    }
    if (filtro.q?.trim()) {
      params = params.set('q', filtro.q.trim());
    }
    if (filtro.sinUnidad) {
      params = params.set('sinUnidad', true);
    }
    return this.http.get<UsuarioAdmin[]>(`${this.url}/usuarios`, { params });
  }

  crearUsuario(datos: CrearUsuario): Observable<UsuarioAdmin> {
    return this.http.post<UsuarioAdmin>(`${this.url}/usuarios`, datos);
  }

  actualizarUsuario(id: number, datos: ActualizarUsuario): Observable<UsuarioAdmin> {
    return this.http.put<UsuarioAdmin>(`${this.url}/usuarios/${id}`, datos);
  }

  activarUsuario(id: number, activo: boolean): Observable<UsuarioAdmin> {
    return this.http.patch<UsuarioAdmin>(`${this.url}/usuarios/${id}/activo`, { activo });
  }

  reiniciarClave(id: number, password: string): Observable<UsuarioAdmin> {
    return this.http.post<UsuarioAdmin>(`${this.url}/usuarios/${id}/clave`, { password });
  }

  // ---- unidades
  unidades(): Observable<UnidadAdmin[]> {
    return this.http.get<UnidadAdmin[]>(`${this.url}/unidades`);
  }

  crearUnidad(datos: CrearUnidad): Observable<UnidadAdmin> {
    return this.http.post<UnidadAdmin>(`${this.url}/unidades`, datos);
  }

  actualizarUnidad(id: number, datos: ActualizarUnidad): Observable<UnidadAdmin> {
    return this.http.put<UnidadAdmin>(`${this.url}/unidades/${id}`, datos);
  }

  activarUnidad(id: number, activo: boolean): Observable<UnidadAdmin> {
    return this.http.patch<UnidadAdmin>(`${this.url}/unidades/${id}/activo`, { activo });
  }

  // ---- zonas y sectores
  zonas(): Observable<ZonaAdmin[]> {
    return this.http.get<ZonaAdmin[]>(`${this.url}/zonas`);
  }

  crearSector(datos: CrearSector): Observable<ZonaAdmin> {
    return this.http.post<ZonaAdmin>(`${this.url}/zonas`, datos);
  }

  /** Cambia el límite del distrito (la cobertura). Falla si deja fuera sectores activos o alertas en curso. */
  redefinirDistrito(geojson: string): Observable<ZonaAdmin> {
    return this.http.put<ZonaAdmin>(`${this.url}/zonas/distrito`, { geojson });
  }

  renombrarSector(id: number, nombre: string): Observable<ZonaAdmin> {
    return this.http.put<ZonaAdmin>(`${this.url}/zonas/${id}`, { nombre });
  }

  activarSector(id: number, activo: boolean): Observable<ZonaAdmin> {
    return this.http.patch<ZonaAdmin>(`${this.url}/zonas/${id}/activo`, { activo });
  }

  generarCuadricula(datos: GenerarCuadricula): Observable<ZonaAdmin[]> {
    return this.http.post<ZonaAdmin[]>(`${this.url}/zonas/cuadricula`, datos);
  }

  recalcularSectores(): Observable<number> {
    return this.http.post<number>(`${this.url}/zonas/recalcular`, {});
  }

  // ---- auditoría
  auditoria(filtro: FiltroAuditoria = {}): Observable<PaginaAuditoria> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtro)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<PaginaAuditoria>(`${this.url}/auditoria`, { params });
  }

  accionesAuditoria(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/auditoria/acciones`);
  }

  // ---- parámetros del motor
  parametros(): Observable<Parametro[]> {
    return this.http.get<Parametro[]>(`${this.url}/parametros`);
  }

  cambiarParametro(clave: string, valor: string): Observable<Parametro> {
    return this.http.put<Parametro>(`${this.url}/parametros/${clave}`, { valor });
  }
}
