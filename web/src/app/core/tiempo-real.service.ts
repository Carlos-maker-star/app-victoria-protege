import { inject, Injectable, signal } from '@angular/core';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import { Subject, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth/auth.service';
import { NotificacionCentral, Unidad } from './models';

/**
 * Conexión WebSocket (STOMP) con el backend. El JWT viaja en el frame CONNECT; si el servidor
 * rechaza el token, la conexión no abre. Se reconecta sola y avisa con `reconectado$` para que
 * quien muestre datos los recargue por REST (no se reciben los mensajes perdidos).
 */
@Injectable({ providedIn: 'root' })
export class TiempoRealService {
  private readonly auth = inject(AuthService);
  private rx: RxStomp | null = null;
  private suscripciones: Subscription[] = [];

  /** true mientras la conexión está abierta. */
  readonly conectado = signal(false);

  readonly alertas$ = new Subject<NotificacionCentral>();
  readonly unidades$ = new Subject<Unidad>();
  /** Se emite cada vez que se abre la conexión después de haberla perdido. */
  readonly reconectado$ = new Subject<void>();

  conectar(): void {
    if (this.rx) {
      return;
    }
    const rx = new RxStomp();
    rx.configure({
      brokerURL: environment.wsUrl,
      // Se evalúa en cada intento de conexión: usa siempre el token vigente
      beforeConnect: () => {
        rx.stompClient.connectHeaders = { Authorization: `Bearer ${this.auth.token() ?? ''}` };
      },
      reconnectDelay: 3000,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
    });

    let abiertaAntes = false;
    this.suscripciones = [
      rx.connectionState$.subscribe((estado) => {
        const abierto = estado === RxStompState.OPEN;
        this.conectado.set(abierto);
        if (abierto && abiertaAntes) {
          this.reconectado$.next();
        }
        abiertaAntes = abiertaAntes || abierto;
      }),
      rx.watch('/topic/monitoreo/alertas').subscribe((m) => this.alertas$.next(JSON.parse(m.body))),
      rx.watch('/topic/monitoreo/unidades').subscribe((m) => this.unidades$.next(JSON.parse(m.body))),
    ];
    rx.activate();
    this.rx = rx;
  }

  desconectar(): void {
    this.suscripciones.forEach((s) => s.unsubscribe());
    this.suscripciones = [];
    void this.rx?.deactivate();
    this.rx = null;
    this.conectado.set(false);
  }
}
