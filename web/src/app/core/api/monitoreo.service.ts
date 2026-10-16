import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Alerta, AlertaDetalle, AsignacionManual, Cancelacion, Candidata, Evidencia, Reporte, Resumen, Unidad, Zona } from '../models';

/** Endpoints de la central: /api/monitoreo/**. */
@Injectable({ providedIn: 'root' })
export class MonitoreoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/monitoreo`;

  /** Sin parámetros: solo alertas activas. `todas` incluye finalizadas y canceladas. */
  alertas(opciones: { todas?: boolean; estado?: string; limite?: number } = {}): Observable<Alerta[]> {
    let params = new HttpParams();
    if (opciones.todas) {
      params = params.set('todas', true);
    }
    if (opciones.estado) {
      params = params.set('estado', opciones.estado);
    }
    if (opciones.limite) {
      params = params.set('limite', opciones.limite);
    }
    return this.http.get<Alerta[]>(`${this.url}/alertas`, { params });
  }

  evidencias(alertaId: number): Observable<Evidencia[]> {
    return this.http.get<Evidencia[]>(`${this.url}/alertas/${alertaId}/evidencias`);
  }

  /** El archivo exige el token, por eso se pide por HTTP (una etiqueta img sola no lo envía). */
  archivoEvidencia(id: number): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}/evidencias/${id}/archivo`, { responseType: 'blob' });
  }

  detalle(id: number): Observable<AlertaDetalle> {
    return this.http.get<AlertaDetalle>(`${this.url}/alertas/${id}`);
  }

  /** Unidades que se pueden elegir para la alerta, de la más cercana a la más lejana. */
  candidatas(id: number): Observable<Candidata[]> {
    return this.http.get<Candidata[]>(`${this.url}/alertas/${id}/candidatas`);
  }

  asignar(id: number, datos: AsignacionManual): Observable<AlertaDetalle> {
    return this.http.post<AlertaDetalle>(`${this.url}/alertas/${id}/asignar`, datos);
  }

  cancelar(id: number, datos: Cancelacion): Observable<AlertaDetalle> {
    return this.http.post<AlertaDetalle>(`${this.url}/alertas/${id}/cancelar`, datos);
  }

  /** Reporte del rango (AAAA-MM-DD, hora de Lima). Sin fechas: los últimos 7 días. */
  reporte(desde?: string, hasta?: string): Observable<Reporte> {
    let params = new HttpParams();
    if (desde) {
      params = params.set('desde', desde);
    }
    if (hasta) {
      params = params.set('hasta', hasta);
    }
    return this.http.get<Reporte>(`${this.url}/reportes`, { params });
  }

  unidades(): Observable<Unidad[]> {
    return this.http.get<Unidad[]>(`${this.url}/unidades`);
  }

  resumen(): Observable<Resumen> {
    return this.http.get<Resumen>(`${this.url}/resumen`);
  }

  zonas(): Observable<Zona[]> {
    return this.http.get<Zona[]>(`${this.url}/zonas`);
  }
}
