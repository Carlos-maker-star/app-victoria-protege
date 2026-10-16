import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { AdminService } from '../../core/api/admin.service';
import { PARAMETROS } from '../../core/etiquetas';
import { Parametro } from '../../core/models';
import { NotificacionService } from '../../core/notificacion.service';

const MODO = 'asignacion_automatica';

interface FilaParametro extends Parametro {
  etiqueta: string;
  unidad: string;
  min: number;
  max: number;
}

@Component({
  selector: 'app-configuracion',
  imports: [MatButton, MatIcon, MatProgressBar, MatSlideToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './configuracion.html',
})
export class Configuracion {
  private readonly admin = inject(AdminService);
  private readonly notificar = inject(NotificacionService);

  protected readonly parametros = signal<Parametro[]>([]);
  protected readonly cargando = signal(true);
  /** Valores escritos y todavía no guardados, por clave. */
  protected readonly editados = signal<Record<string, string>>({});
  protected readonly guardando = signal<string | null>(null);

  protected readonly automatico = computed(() => this.parametros().find((p) => p.clave === MODO)?.valor !== 'false');

  protected readonly filas = computed<FilaParametro[]>(() =>
    this.parametros()
      .filter((p) => p.clave in PARAMETROS)
      .map((p) => ({ ...p, ...PARAMETROS[p.clave] }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es')),
  );

  constructor() {
    this.admin.parametros().subscribe({
      next: (l) => {
        this.parametros.set(l);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  protected valor(f: FilaParametro): string {
    return this.editados()[f.clave] ?? f.valor;
  }

  protected cambio(f: FilaParametro): boolean {
    return this.valor(f) !== f.valor;
  }

  /** Entero dentro del rango permitido. */
  protected valido(f: FilaParametro): boolean {
    const v = this.valor(f).trim();
    return /^\d+$/.test(v) && Number(v) >= f.min && Number(v) <= f.max;
  }

  protected escribir(f: FilaParametro, texto: string): void {
    this.editados.update((e) => ({ ...e, [f.clave]: texto }));
  }

  protected guardar(f: FilaParametro): void {
    if (!this.valido(f)) {
      return;
    }
    this.cambiar(f.clave, this.valor(f).trim(), `${f.etiqueta} actualizado.`);
  }

  protected cambiarModo(automatico: boolean): void {
    this.cambiar(MODO, String(automatico), automatico ? 'El motor vuelve a asignar las unidades.' : 'Asignación manual activada: la central asigna a mano.');
  }

  private cambiar(clave: string, valor: string, mensaje: string): void {
    this.guardando.set(clave);
    this.admin.cambiarParametro(clave, valor).subscribe({
      next: (p) => {
        this.parametros.update((l) => l.map((x) => (x.clave === clave ? p : x)));
        this.editados.update(({ [clave]: _descartado, ...resto }) => resto);
        this.guardando.set(null);
        this.notificar.exito(mensaje);
      },
      error: () => this.guardando.set(null),
    });
  }
}
