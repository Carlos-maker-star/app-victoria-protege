import { Routes } from '@angular/router';
import { authGuard, invitadoGuard, rolGuard } from './core/auth/guards';

// `data.titulo` es el texto de la barra superior; `title` es el de la pestaña del navegador.
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [invitadoGuard],
    title: 'Iniciar sesión · La Victoria Protege',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'monitoreo' },
      {
        path: 'monitoreo',
        title: 'Centro de monitoreo · La Victoria Protege',
        data: { titulo: 'Centro de monitoreo' },
        loadComponent: () => import('./features/monitoreo/monitoreo').then((m) => m.Monitoreo),
      },
      {
        path: 'alertas',
        title: 'Alertas · La Victoria Protege',
        data: { titulo: 'Alertas' },
        loadComponent: () => import('./features/alertas/alertas-list').then((m) => m.AlertasList),
      },
      {
        path: 'alertas/:id',
        title: 'Detalle de alerta · La Victoria Protege',
        data: { titulo: 'Detalle de alerta' },
        loadComponent: () => import('./features/alertas/alerta-detail').then((m) => m.AlertaDetail),
      },
      {
        path: 'reportes',
        title: 'Reportes · La Victoria Protege',
        data: { titulo: 'Reportes' },
        loadComponent: () => import('./features/reportes/reportes').then((m) => m.Reportes),
      },
      {
        path: 'admin/usuarios',
        canActivate: [rolGuard('ADMIN')],
        title: 'Usuarios · La Victoria Protege',
        data: { titulo: 'Usuarios' },
        loadComponent: () => import('./features/admin/usuarios-admin').then((m) => m.UsuariosAdmin),
      },
      {
        path: 'admin/unidades',
        canActivate: [rolGuard('ADMIN')],
        title: 'Administrar unidades · La Victoria Protege',
        data: { titulo: 'Administrar unidades' },
        loadComponent: () => import('./features/admin/unidades-admin').then((m) => m.UnidadesAdmin),
      },
      {
        path: 'admin/zonas',
        canActivate: [rolGuard('ADMIN')],
        title: 'Zonas y sectores · La Victoria Protege',
        data: { titulo: 'Zonas y sectores' },
        loadComponent: () => import('./features/admin/zonas-admin').then((m) => m.ZonasAdmin),
      },
      {
        path: 'admin/auditoria',
        canActivate: [rolGuard('ADMIN')],
        title: 'Auditoría · La Victoria Protege',
        data: { titulo: 'Auditoría' },
        loadComponent: () => import('./features/admin/auditoria-admin').then((m) => m.AuditoriaAdmin),
      },
      {
        path: 'cuenta',
        title: 'Mi cuenta · La Victoria Protege',
        data: { titulo: 'Mi cuenta' },
        loadComponent: () => import('./features/cuenta/cuenta').then((m) => m.Cuenta),
      },
      {
        path: 'admin/configuracion',
        canActivate: [rolGuard('ADMIN')],
        title: 'Configuración · La Victoria Protege',
        data: { titulo: 'Configuración' },
        loadComponent: () => import('./features/admin/configuracion').then((m) => m.Configuracion),
      },
      {
        path: 'unidades',
        title: 'Unidades · La Victoria Protege',
        data: { titulo: 'Unidades' },
        loadComponent: () => import('./features/unidades/unidades-list').then((m) => m.UnidadesList),
      },
    ],
  },
  { path: '**', redirectTo: 'monitoreo' },
];
