import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { ROLES } from '../core/etiquetas';
import { MARCA } from '../core/marca';
import { MonitoreoStore } from '../core/monitoreo.store';
import { TemaService } from '../core/tema.service';
import { Avatar } from '../shared/avatar';
import { NAVEGACION } from './navegacion';

/** Layout de las páginas privadas: menú lateral + barra superior + contenido. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIcon, MatIconButton, MatButton, MatTooltip, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly tema = inject(TemaService);
  protected readonly store = inject(MonitoreoStore);
  private readonly router = inject(Router);

  protected readonly marca = MARCA;
  protected readonly roles = ROLES;
  protected readonly menuAbierto = signal(false);

  constructor() {
    // Datos en vivo: se cargan y se conecta el WebSocket mientras la sesión esté abierta
    this.store.iniciar();
    inject(DestroyRef).onDestroy(() => this.store.detener());
  }

  /** Secciones e ítems visibles para el rol actual. */
  protected readonly navegacion = computed(() => {
    const rol = this.auth.rol();
    const visible = (roles?: string[]) => !roles || (rol !== null && roles.includes(rol));
    return NAVEGACION.filter((s) => visible(s.roles))
      .map((s) => ({ ...s, items: s.items.filter((i) => visible(i.roles)) }))
      .filter((s) => s.items.length > 0);
  });

  protected readonly alertasActivas = computed(() => this.store.alertas().length);

  /** Título de la barra superior: `data: { titulo }` de la ruta activa. */
  protected readonly titulo = toSignal(
    this.router.events.pipe(
      filter((evento) => evento instanceof NavigationEnd),
      startWith(null),
      map(() => tituloDeRuta(this.router.routerState.snapshot.root)),
    ),
    { initialValue: '' },
  );
}

function tituloDeRuta(ruta: ActivatedRouteSnapshot): string {
  let actual = ruta;
  while (actual.firstChild) {
    actual = actual.firstChild;
  }
  return (actual.data['titulo'] as string | undefined) ?? '';
}
