import { Rol } from '../core/models';

export interface ItemNav {
  etiqueta: string;
  /** Ícono de Material Symbols. */
  icono: string;
  ruta: string;
  /** Si se indica, solo lo ven estos roles. */
  roles?: Rol[];
  /** Muestra el contador de alertas activas junto al ítem. */
  contador?: 'alertas';
}

export interface SeccionNav {
  titulo: string;
  items: ItemNav[];
  roles?: Rol[];
}

// Solo las pantallas ya construidas. Cuando se agreguen Reportes, Zonas, Usuarios… se añaden aquí
// (con `roles` para limitarlas a supervisión o administración).
export const NAVEGACION: SeccionNav[] = [
  {
    titulo: 'Operación',
    items: [
      { etiqueta: 'Monitoreo', icono: 'map', ruta: '/monitoreo' },
      { etiqueta: 'Alertas', icono: 'notifications_active', ruta: '/alertas', contador: 'alertas' },
      { etiqueta: 'Unidades', icono: 'local_police', ruta: '/unidades' },
    ],
  },
  {
    titulo: 'Supervisión',
    items: [{ etiqueta: 'Reportes', icono: 'monitoring', ruta: '/reportes' }],
  },
  {
    titulo: 'Cuenta',
    items: [{ etiqueta: 'Mi cuenta', icono: 'manage_accounts', ruta: '/cuenta' }],
  },
  {
    titulo: 'Administración',
    roles: ['ADMIN'],
    items: [
      { etiqueta: 'Usuarios', icono: 'group', ruta: '/admin/usuarios' },
      { etiqueta: 'Gestionar unidades', icono: 'garage', ruta: '/admin/unidades' },
      { etiqueta: 'Zonas y sectores', icono: 'map', ruta: '/admin/zonas' },
      { etiqueta: 'Auditoría', icono: 'fact_check', ruta: '/admin/auditoria' },
      { etiqueta: 'Configuración', icono: 'settings', ruta: '/admin/configuracion' },
    ],
  },
];

/** Ruta a la que envía el buscador de la barra superior (con `?q=`). `null` lo oculta. */
export const RUTA_BUSQUEDA: string | null = null;
