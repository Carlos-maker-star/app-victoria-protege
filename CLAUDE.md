# La Victoria Protege

Sistema de seguridad ciudadana para el distrito de La Victoria (Chiclayo). Proyecto de tesis.
Este repositorio tiene el **backend** y la **plataforma web de la central**. Las apps móviles
(ciudadano y sereno) las desarrolla otra persona y consumen la misma API.

```
backend/    Spring Boot 4 · Java 21 · PostgreSQL + PostGIS · Flyway
web/        Angular 22 · Angular Material · Tailwind 4 · Leaflet · rx-stomp
bocetos/    Boceto HTML navegable aprobado del panel (claro/oscuro, modales incluidos)
promp-maestro.md   Especificación funcional original del sistema
```

## Cómo correrlo en local

Requisitos: JDK 21, Node 22+/24, PostgreSQL con PostGIS.

1. Base de datos: crear `victoria_protege` y `CREATE EXTENSION postgis;`. Este equipo usa el puerto **5433**.
2. `backend/src/main/resources/application-local.properties` (está en `.gitignore`; copiar el `.example` y completar):
   `spring.datasource.username/password`, `app.jwt.secret` (aleatorio, ≥ 32 caracteres) y `app.seed.password`
   (la clave de los usuarios de prueba). **Sin `app.jwt.secret` el backend no arranca.**
3. Backend: `cd backend && ./mvnw spring-boot:run` → http://localhost:8080 (Flyway crea las tablas y
   el perfil `local` crea usuarios, unidades SV-001/SV-002 y el límite del distrito).
4. Web: `cd web && npm install && npm start` → http://localhost:4200.

Usuarios de prueba (DNI): `00000001` admin, `00000002` supervisor, `00000003` operador,
`00000004`/`00000005` serenos, `00000006` ciudadano. La clave común es `app.seed.password`
de `application-local.properties` (solo perfil local; no se sube al repositorio). **La web solo admite operador, supervisor y admin.**

## Backend (resumen)

- **Motor de asignación** (`asignacion/`): al crear una alerta busca la unidad `DISPONIBLE` más cercana
  en línea recta con PostGIS, le da 15 s para responder y, si rechaza o no responde, reasigna.
  Regla fundamental: una alerta nunca se pierde; si no hay unidades se escala a la central (`SIN_UNIDAD`).
  Los temporizadores corren en el servidor (`AsignacionScheduler`).
- **Distrito único**: toda alerta debe caer dentro del polígono del distrito (+50 m de tolerancia).
- **Tiempo real** (`tiemporeal/`): STOMP en `ws://localhost:8080/ws`; el JWT va en el frame CONNECT.
  Canales: `/topic/monitoreo/alertas`, `/topic/monitoreo/unidades` (central),
  `/user/queue/seguimiento` (ciudadano), `/user/queue/estado` (sereno). Los mensajes salen tras el commit.
- Seguridad: JWT (HS256). En producción definir `JWT_SECRET`. Rutas por rol en `SecurityConfig`.
- El bean de CORS debe llamarse `corsConfigurationSource` o Spring Security lo ignora.

## Web (convenciones)

- Componentes standalone, `OnPush`, estado con signals, `inject()`. App zoneless.
- Archivos al estilo Angular 20+ (`alertas-list.ts` + `.html`, clase sin sufijo `Component`).
- **Estado en vivo**: `core/monitoreo.store.ts` carga por REST y se mantiene con el WebSocket
  (`core/tiempo-real.service.ts`). Al reconectar vuelve a cargar por REST (no se reciben mensajes perdidos).
- Colores solo con utilidades de `src/tailwind.css` (`bg-surface`, `text-muted`…); nunca hex en componentes.
  Para cambiar de paleta, editar el bloque «Primario» de `:root` y `.dark` (y `material.scss`).
- Estados, prioridades y textos del dominio: `core/etiquetas.ts`. Clases completas, no concatenadas.
- Tailwind 4 marca `!important` con **sufijo** (`bg-nav-active!`).
- No usar PrimeNG (licencia). Toda contraseña usa `shared/campo-contrasena.ts`.
- Menú por rol: `layout/navegacion.ts`. Hoy solo están las pantallas construidas.

## Contrato de la API (para las apps móviles)

- `docs/api/GUIA-MOVILES.md`: guía de integración (flujos del ciudadano y del sereno, estados, WebSocket, errores,
  qué falta). **Es lo que debe leer quien hace las apps.**
- `docs/api/openapi-movil.json` y `openapi-web.json`: contratos OpenAPI 3.1 generados con springdoc desde el código.
  Swagger UI en `http://localhost:8080/swagger-ui.html` (selector de grupo arriba). Se apagan con `APP_DOCS=false`.
- Regenerar: `cd docs/api && npm run exportar` (backend corriendo). Verificar: `npm run lint` y `npm run contrato`
  (esta última ejecuta el flujo real y valida cada respuesta contra el esquema; requiere haber corrido el simulador).
- `OpenApiConfig` corrige lo que springdoc 3 emite mal con OpenAPI 3.1: enums que admiten `null`, objetos nulos
  (`oneOf`), campos obligatorios en las respuestas y los errores comunes (`ErrorApi`). Los campos que pueden ser nulos se
  marcan con `@Schema(nullable = true)`; si no, el contrato dice que nunca vienen nulos y la prueba de contrato falla.
- Los errores omiten `campos` cuando no es un error de validación (`@JsonInclude(NON_NULL)`).

## Administración (solo ADMIN) y simulador

- `/api/admin/usuarios` (listar con filtros `rol`, `q`, `sinUnidad`; crear; editar; `PATCH …/activo`; `POST …/clave`),
  `/api/admin/unidades` (listar activas e inactivas; crear; editar con el sereno; `PATCH …/activo`) y
  `/api/admin/parametros` (listar y `PUT` con validación de rango). Un sereno opera una sola unidad; no se puede
  desactivar una unidad o un sereno con una alerta en curso, ni el propio usuario, ni cambiar el propio rol.
  Cada cambio queda en la tabla `auditoria` (`AuditoriaService`).
- Parámetro `asignacion_automatica` (`true`/`false`): con `false` el motor no asigna y la central lo hace a mano
  (método base para comparar). Se cambia en **Administración → Configuración**.
- Web: `features/admin/` (usuarios, gestionar unidades, configuración); menú «Administración» solo para ADMIN.
- **Simulador**: `simulador/simulador.mjs` (ver `simulador/README.md`). Dos modos (automático y manual), plan de
  alertas reproducible por semilla, resultados en `simulador/resultados/`.

## Zonas y sectores (solo ADMIN)

- `zona` tiene una fila `DISTRITO` (límite de OpenStreetMap, no modificable) y los `SECTOR` que cree el administrador.
  `/api/admin/zonas`: `GET` (distrito primero, con área, alertas y unidades), `POST` (sector dibujado, GeoJSON),
  `PUT /{id}` (renombrar), `PATCH /{id}/activo`, `POST /cuadricula` (`filas`×`columnas` de 1 a 5, recortada al distrito;
  409 si hay sectores activos y `reemplazar=false`) y `POST /recalcular`.
- Reglas: polígono válido (422 `GEOMETRIA_INVALIDA`), dentro del distrito con 50 m de tolerancia (422
  `FUERA_DEL_DISTRITO`), sin superponerse a otro sector activo (409, tolerancia 500 m²), nombre único, máximo 25
  sectores activos y 2000 vértices. Cada cambio recalcula `alerta.zona_id` y queda en `auditoria`.
- **Límite del distrito** (lo que decide la cobertura): `PUT /api/admin/zonas/distrito` `{geojson}` lo redefine (el área debe
  medir entre 0,5 y 200 km²). Se rechaza (409) si deja fuera algún sector activo o alguna alerta en curso; las alertas
  históricas no se tocan. Queda en auditoría (`DISTRITO_REDEFINIDO`). La web permite dibujarlo o cargar un archivo
  GeoJSON de la municipalidad. El valor original viene de OpenStreetMap (`V3__limite_distrito.sql`).
- Una unidad puede tener un **sector base** (`zonaId`), solo informativo: la asignación sigue usando la distancia.
- `GET /api/monitoreo/zonas` (mapa operativo) devuelve solo las zonas activas; el mapa rotula cada sector.
- Web: `features/admin/zonas-admin` (dibujo con clics sobre Leaflet, cuadrícula, renombrar, activar/desactivar).
- Prueba de integración: `cd docs/api && npm run sectores` (backend corriendo; deja los sectores de prueba inactivos).

## Evidencias y seguridad

- **Evidencias** (`evidencia/`): `POST /api/ciudadano/alertas/{id}/evidencias` y `POST /api/sereno/alertas/{alertaId}/evidencias`
  (multipart: `archivo` y/o `observacion`), `GET /api/ciudadano/alertas/{id}/evidencias`,
  `GET /api/monitoreo/alertas/{id}/evidencias` y `GET /api/evidencias/{id}/archivo` (exige token; lo ven la central, el
  ciudadano dueño y el sereno que atendió; para otros 404). Foto JPG/PNG/WebP ≤ 8 MB, video MP4 ≤ 40 MB, 10 por alerta y
  origen; el tipo se detecta por los primeros bytes (no por extensión) y el archivo se guarda con nombre UUID en
  `app.evidencias.directorio` (`./evidencias-data`, ignorado por git; **hay que respaldarlo junto con la base**).
  Solo se adjunta mientras la alerta está en curso (el sereno también después de finalizarla). Web: sección «Evidencias»
  del detalle de alerta (`features/alertas/evidencias-alerta.ts`); los archivos se piden por HTTP con el token y se
  muestran desde memoria.
- **Login**: `LimiteIntentos` bloquea un DNI/correo 15 min tras 5 fallos seguidos (`429 DEMASIADOS_INTENTOS`; en memoria,
  se reinicia con el servidor; configurable con `app.seguridad.*`). `POST /api/auth/clave` cambia la propia contraseña
  (todos los roles; no invalida las sesiones ya emitidas). Web: **Mi cuenta** (`/cuenta`).
- **Auditoría** (tabla `auditoria`, `AuditoriaService`): ahora registra LOGIN, LOGIN_FALLIDO, LOGIN_BLOQUEADO (solo el DNI,
  nunca contraseñas), REGISTRO, CLAVE_CAMBIADA, ASIGNACION_MANUAL, ALERTA_CANCELADA, EVIDENCIA_AGREGADA, además de los
  cambios de administración. `GET /api/admin/auditoria` (filtros `accion`, `q`, `desde`, `hasta`; paginado) y
  `/api/admin/auditoria/acciones`. Web: Administración → Auditoría.
- **JWT_SECRET**: el secreto de firma de esta máquina está en `application-local.properties` (`app.jwt.secret`, ignorado
  por git). `application.properties` no trae valor por defecto a propósito (el repositorio es público); en otro entorno se define `JWT_SECRET`.
- Pruebas de integración (backend corriendo): `cd docs/api && npm run seguridad` (login, clave, evidencias, auditoría),
  `npm run sectores` y `npm run contrato`.

## Intervención manual de la central

- `GET  /api/monitoreo/alertas/{id}/candidatas`: todas las unidades activas con distancia, ETA y, si no se
  pueden elegir, el motivo.
- `POST /api/monitoreo/alertas/{id}/asignar` `{unidadId, motivo}`: solo en CREADA, BUSCANDO_UNIDAD, SIN_UNIDAD o
  ASIGNADA (reemplaza la asignación pendiente). La unidad debe estar DISPONIBLE, con sereno y sin otra alerta.
  El sereno conserva sus 15 s para aceptar; si rechaza, el motor sigue su curso. A diferencia del motor, la
  central puede elegir una unidad sin posición reciente o ya intentada.
- `POST /api/monitoreo/alertas/{id}/cancelar` `{motivo, observacion}`: motivos FALSA_ALARMA, DUPLICADA,
  RESUELTA_POR_LLAMADA, SOLICITUD_CIUDADANO y OTRO (este exige observación). La central puede cancelar incluso
  con la unidad ya en el lugar; el ciudadano no. Libera la unidad.
- Ambas quedan en `alerta_evento` (`ASIGNACION_MANUAL`, `ALERTA_CANCELADA`) con el usuario que las hizo; el
  historial devuelve su nombre en `usuario`.
- Web: `core/intervencion.service.ts` abre `AsignarDialog` y `CancelarDialog` desde el popup del monitoreo y
  desde el detalle de la alerta.

## Reportes

- `GET /api/monitoreo/reportes?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (OPERADOR, SUPERVISOR, ADMIN). Sin fechas: últimos
  7 días. Máximo un año. Los días y las horas se calculan en **hora de Lima** (UTC-5).
- Devuelve indicadores (total, atendidas, canceladas, activas, escaladas, reasignadas y los 4 tiempos promedio),
  alertas por día y por hora, por tipo, por sector, motivos de reasignación y actividad por unidad.
- Definición de los tiempos (segundos, promedio): **asignación** = creación → primera unidad asignada (incluye la
  espera de las alertas escaladas); **aceptación** = primera asignación → aceptación final; **llegada** = creación →
  llegada; **atención** = llegada → finalización (solo finalizadas). Cada promedio usa solo las alertas que tienen
  ese dato, así que no son comparables entre sí como si fueran etapas de un mismo conjunto.
- «Por sector» agrupa por `alerta.zona_id`; las alertas sin sector van a «Sin sector asignado» (ver Zonas y sectores).
- Web: `features/reportes/`. Gráficos propios en `shared/graficos.ts` (CSS/SVG, sin librerías). «Exportar CSV» usa
  `;` como separador y BOM para que Excel en español abra bien las tildes.

### Datos históricos de demostración (opcional)

Para ver los reportes con varios días de datos, una sola vez (perfil local):

```bash
./mvnw spring-boot:run "-Dspring-boot.run.arguments=--app.seed.historico=140"
```

Genera 140 alertas finalizadas o canceladas en los últimos 14 días (picos de 17 a 23 h, 17 % reasignadas, 4 %
escaladas) con asignaciones y línea de tiempo. No se repite si ya existen. **Son datos falsos: no usarlos en
resultados de la tesis.** Se reconocen por la descripción «Alerta de demostración». Para borrarlos:

```sql
DELETE FROM alerta_evento WHERE alerta_id IN (SELECT id FROM alerta WHERE descripcion = 'Alerta de demostración');
DELETE FROM asignacion    WHERE alerta_id IN (SELECT id FROM alerta WHERE descripcion = 'Alerta de demostración');
DELETE FROM alerta        WHERE descripcion = 'Alerta de demostración';
```

## Estado actual

Hecho: login, centro de monitoreo (mapa, indicadores, alertas activas, actividad), lista y detalle de
alertas, unidades, asignación manual y cancelación por la central, reportes con exportación CSV; todo en vivo.
84 pruebas del frontend (auth, interceptor, store, etiquetas, diálogos, gráficos, rangos, CSV, sectores, cuenta, evidencias y auditoría). Las pruebas del
backend son scripts de integración.

También hecho: administración de usuarios, unidades y parámetros, simulador, contrato OpenAPI, sectores, evidencias y
seguridad local (bloqueo de login, cambio de contraseña, auditoría visible).

Pendiente: despliegue (HTTPS, secretos de producción, respaldos; fuera de alcance por ahora) y, según el boceto,
registrar alerta por llamada y tipos de alerta.
