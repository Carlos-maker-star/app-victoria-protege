import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

// Misma clave que el script inline de index.html
const CLAVE_TEMA = 'app.tema';

/** Modo claro/oscuro: pone la clase `dark` en <html> (Tailwind y Material la usan). */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly document = inject(DOCUMENT);

  readonly oscuro = signal(this.document.documentElement.classList.contains('dark'));

  constructor() {
    effect(() => {
      const oscuro = this.oscuro();
      this.document.documentElement.classList.toggle('dark', oscuro);
      try {
        localStorage.setItem(CLAVE_TEMA, oscuro ? 'oscuro' : 'claro');
      } catch {
        // Sin almacenamiento: el tema no se recuerda entre visitas.
      }
    });
  }

  alternar(): void {
    this.oscuro.update((valor) => !valor);
  }
}
