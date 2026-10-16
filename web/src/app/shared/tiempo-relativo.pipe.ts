import { Pipe, PipeTransform } from '@angular/core';

const formato = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const fechaCorta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

/** "hace 5 minutos", "ayer", "hace 3 días"; más de una semana → fecha corta. */
@Pipe({ name: 'tiempoRelativo' })
export class TiempoRelativoPipe implements PipeTransform {
  transform(valor: string | null | undefined): string {
    if (!valor) {
      return '';
    }
    const fecha = new Date(valor);
    const segundos = Math.round((fecha.getTime() - Date.now()) / 1000);
    const abs = Math.abs(segundos);
    if (abs < 60) {
      return 'justo ahora';
    }
    if (abs < 3600) {
      return formato.format(Math.round(segundos / 60), 'minute');
    }
    if (abs < 86400) {
      return formato.format(Math.round(segundos / 3600), 'hour');
    }
    if (abs < 7 * 86400) {
      return formato.format(Math.round(segundos / 86400), 'day');
    }
    return fechaCorta.format(fecha);
  }
}
