import { Component, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { TemaService } from './core/tema.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  constructor() {
    // Íconos: Material Symbols Rounded (cargado en index.html)
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-rounded');
    // Instancia el servicio para que aplique y recuerde el tema desde el arranque
    inject(TemaService);
    inject(AuthService).refrescarUsuario();
  }
}
