# Guía de integración para las apps móviles

Para quien desarrolla las apps del **ciudadano** y del **sereno**. Complementa la referencia técnica
(`openapi-movil.json`, también en Swagger UI): aquí está *cómo se usa* la API, los flujos, los estados y el tiempo real.

- [1. Lo básico](#1-lo-básico)
- [2. App del ciudadano](#2-app-del-ciudadano)
- [3. App del sereno](#3-app-del-sereno)
- [4. Tiempo real (WebSocket)](#4-tiempo-real-websocket)
- [5. Errores](#5-errores)
- [6. Qué todavía no existe](#6-qué-todavía-no-existe)
- [7. Probar sin tener la otra app](#7-probar-sin-tener-la-otra-app)

---

## 1. Lo básico

| | |
|---|---|
| URL base (local) | `http://localhost:8080/api` (desde el **emulador de Android** usa `http://10.0.2.2:8080/api`) |
| Documentación viva | `http://localhost:8080/swagger-ui.html` (elige el grupo «Apps móviles») |
| Contrato | [`openapi-movil.json`](openapi-movil.json): puedes generar el cliente con OpenAPI Generator |
| Formato | JSON, UTF-8 |
| Fechas | ISO 8601 en UTC, p. ej. `2026-10-15T21:11:32.417Z`. Conviértelas a hora de Lima (UTC-5) para mostrarlas |
| Coordenadas | WGS84 en grados decimales: `latitud` (-6.82…) y `longitud` (-79.86…). Siempre en ese orden y con esos nombres |
| Distancias / tiempos | metros y segundos (`distanciaM`, `etaSegundos`) |

### Autenticación

1. `POST /auth/login` con `{ "usuario": "<DNI o correo>", "password": "…" }`.
2. Guarda `token` en almacenamiento seguro (Keystore / Keychain). Dura **12 horas** (`expiraEnSegundos`).
3. Envíalo en **todas** las peticiones: `Authorization: Bearer <token>`.
4. Si recibes `401`, la sesión venció: vuelve a la pantalla de login.
5. **Bloqueo por intentos:** tras **5 intentos fallidos seguidos** con un mismo DNI o correo, el login responde
   `429 DEMASIADOS_INTENTOS` durante 15 minutos (aunque la clave sea correcta). Muestra `mensaje`, que dice cuánto falta.
6. **Cambiar la contraseña:** `POST /auth/clave` `{actual, nueva}` (mínimo 8 caracteres) → `204`. Errores:
   `422 CLAVE_ACTUAL_INCORRECTA` y `422 CLAVE_REPETIDA`. La sesión actual sigue vigente.

La respuesta trae `usuario.rol`. **La app del ciudadano solo debe dejar entrar a `CIUDADANO` y la del sereno solo a
`SERENO`.** Un operador o administrador con credenciales válidas no debe pasar a ninguna de las dos.

### Todas las respuestas de error tienen la misma forma

```json
{ "codigo": "FUERA_DE_COBERTURA", "mensaje": "El punto del incidente está fuera del distrito…", "campos": null }
```

Muestra `mensaje` al usuario y decide la lógica con `codigo` (los códigos son estables; los mensajes pueden cambiar).
En errores de validación (`400 VALIDACION`) `campos` indica el mensaje de cada campo.

---

## 2. App del ciudadano

### Registro e ingreso

- `POST /auth/registro` → crea la cuenta y devuelve la sesión iniciada (no hace falta login después).
  Campos: `dni` (8 dígitos), `nombres`, `apellidos`, `telefono` (9 dígitos, opcional), `email` (opcional), `password` (8 a 72).
- `409 CONFLICTO`: el DNI o el correo ya tienen cuenta.
- Biometría (huella) / PIN: son locales de la app; guarda el token protegido por la biometría. El servidor no interviene.
- La validación de identidad contra RENIEC **no está implementada** (ver §6).

### Reportar una alerta

`POST /ciudadano/alertas`

```json
{
  "tipo": "ROBO",
  "descripcion": "Dos sujetos arrebataron un celular",
  "latitud": -6.8262, "longitud": -79.8693,
  "latitudCiudadano": -6.8263, "longitudCiudadano": -79.8694,
  "referencia": "Frente a la losa deportiva"
}
```

- `tipo`: `ROBO`, `INCENDIO`, `ACCIDENTE`, `DISTURBIOS`, `SOSPECHOSA`, `EMERGENCIA`, `DESASTRE`, `OTRO`.
- `latitud/longitud` es el **punto del incidente**, el que el vecino confirma en el mapa. `latitudCiudadano/longitudCiudadano`
  es su GPS (opcional): pueden ser distintos.
- Flujo sugerido de la pantalla: elegir tipo → obtener GPS → mostrar el mapa para **confirmar o corregir** el punto →
  (descripción opcional) → enviar → «Alerta enviada correctamente» → pantalla de seguimiento.

Errores propios de esta operación:

| Código | HTTP | Qué hacer |
|---|---|---|
| `FUERA_DE_COBERTURA` | 422 | El punto está fuera de La Victoria (con 50 m de tolerancia). Muestra `mensaje`: sugiere llamar a la PNP (105). Deja que el vecino corrija el punto |
| `ALERTA_ACTIVA_EXISTENTE` | 409 | Ya tiene una alerta en curso (solo se permite una). Llévalo a su seguimiento |
| `TIPO_ALERTA_INVALIDO` | 422 | Tipo desconocido |

Tip: valida en la app que el punto esté dentro del distrito para avisar antes de enviar; **la validación que cuenta es la del servidor**.

### Seguimiento (la pantalla de espera)

`GET /ciudadano/alertas/{id}/seguimiento` devuelve lo que debe mostrar la pantalla. El `estado` ya viene simplificado: el
ciudadano **no ve** los rechazos ni las reasignaciones de las unidades, solo `ASIGNANDO_UNIDAD` hasta que un sereno acepta.

| `estado` | Mostrar |
|---|---|
| `ASIGNANDO_UNIDAD` | «Asignando unidad a tu alerta» + mapa con el incidente |
| `UNIDAD_ASIGNADA` | «Unidad asignada» (dura un instante) |
| `UNIDAD_EN_CAMINO` | «La unidad está en camino» · mapa con la unidad (`unidadLatitud/Longitud`), `distanciaM` y «Llegada estimada: N min» (`etaSegundos / 60`) |
| `UNIDAD_LLEGO` | «La unidad llegó» |
| `ATENCION_EN_PROCESO` | «Atención en proceso» |
| `ALERTA_ATENDIDA` | «Alerta atendida» + resumen (tipo, fecha, hora, resultado: `GET /ciudadano/alertas/{id}`) |
| `CANCELADA` | La alerta se canceló |

La unidad (`unidadCodigo`, posición) solo viene cuando un sereno ya **aceptó**.

**Cómo mantenerla al día:** al abrir la pantalla pide el seguimiento y escucha el WebSocket `/user/queue/seguimiento` (§4),
que envía este mismo objeto cada vez que algo cambia y cada vez que la unidad se mueve. Si no hay WebSocket (o se
cayó), consulta cada 3–5 segundos.

### Adjuntar evidencias (fotos, videos, notas)

- `POST /ciudadano/alertas/{id}/evidencias` — `multipart/form-data` con `archivo` (opcional) y `observacion` (opcional,
  hasta 500 caracteres); hay que enviar al menos uno. Solo mientras la alerta sigue en curso (`409` si ya terminó).
- Archivos admitidos: **foto JPG, PNG o WebP (hasta 8 MB)** y **video MP4 (hasta 40 MB)**. El servidor reconoce el tipo por el
  contenido, no por la extensión ni por el `Content-Type`. Las fotos de iPhone en HEIC **no** se aceptan: conviértelas a JPG
  antes de enviarlas. Se recomienda reducir la foto (p. ej. 1600 px de lado mayor) antes de subirla.
- Máximo 10 evidencias por alerta y por origen. Errores `422`: `EVIDENCIA_VACIA`, `ARCHIVO_NO_PERMITIDO`,
  `ARCHIVO_MUY_GRANDE`, `NOTA_MUY_LARGA`, `LIMITE_EVIDENCIAS`.
- `GET /ciudadano/alertas/{id}/evidencias` — lo ya enviado. Para ver una foto o video: `GET /evidencias/{id}/archivo`
  **con el token** (una vista de imagen sin cabecera `Authorization` no funciona: descarga y muestra desde memoria).

### Otras operaciones

- `GET /ciudadano/alertas` — historial (últimas 100).
- `GET /ciudadano/alertas/{id}` — detalle de una alerta propia.
- `POST /ciudadano/alertas/{id}/cancelar` — solo mientras la unidad no haya llegado (`409` si ya no se puede).

---

## 3. App del sereno

Un sereno opera **una unidad** que le asigna el administrador desde la web. Si no tiene (`409 SIN_UNIDAD_ASIGNADA`), muestra
«Contacta a la central».

**Todas las acciones del sereno devuelven el mismo objeto** (`EstadoSerenoResponse`): el estado de la unidad y su asignación
vigente. La app siempre puede refrescar toda la pantalla con la respuesta de lo que acaba de hacer.

```json
{
  "unidadId": 1, "unidadCodigo": "SV-001", "estado": "DISPONIBLE",
  "latitud": -6.8272, "longitud": -79.8693, "ubicacionEn": "2026-10-15T21:20:00Z",
  "asignacion": {
    "id": 88, "alertaId": 152, "estado": "PENDIENTE_RESPUESTA", "orden": 1,
    "distanciaM": 1200, "etaSegundos": 260, "venceEn": "2026-10-15T21:20:15Z", "segundosRestantes": 12,
    "tipo": "ROBO", "tipoNombre": "Robo", "descripcion": null,
    "latitud": -6.8262, "longitud": -79.8693, "referencia": "Frente a la losa deportiva",
    "alertaEstado": "ASIGNADA", "llegadaEn": null
  }
}
```

`asignacion` es `null` cuando no tienes ninguna alerta.

### Ciclo completo

```
 (1) DISPONIBLE ─ llega una alerta ─▶ asignacion.estado = PENDIENTE_RESPUESTA  (cuenta regresiva: segundosRestantes)
        │
        ├─ POST /sereno/asignaciones/{id}/aceptar ─▶ estado EN_DESPLAZAMIENTO · alertaEstado EN_CAMINO
        │        │  enviar posición cada 1–3 s (POST /sereno/posicion)
        │        │  a < 30 m el servidor marca la llegada solo (o POST …/llegada)
        │        ▼
        │   alertaEstado LLEGO · estado EN_ATENCION
        │        │  POST …/iniciar-atencion (opcional) ─▶ alertaEstado EN_ATENCION
        │        ▼
        │   POST …/finalizar { resultado, observacion } ─▶ alerta FINALIZADA · asignacion = null
        │        ▼
        │   «¿Continuar operando?»  POST /sereno/estado { "DISPONIBLE" }  ó  { "FUERA_DE_SERVICIO" } (finalizar sesión)
        │
        ├─ POST …/rechazar { motivo } ─▶ el sistema reasigna al instante a otra unidad (la alerta no se pierde)
        │
        └─ no responder en 15 s ─▶ el sistema reasigna y tu unidad queda FUERA_DE_SERVICIO (vuelve con POST /estado DISPONIBLE)
```

### Operaciones

| Operación | Cuándo |
|---|---|
| `GET /sereno/estado` | Al abrir la app y al reconectar |
| `POST /sereno/estado` `{estado}` | `DISPONIBLE` (inicia o continúa) · `FUERA_DE_SERVICIO` (cierra sesión). No se puede con una alerta en curso (`409`) |
| `POST /sereno/posicion` `{latitud, longitud, velocidadKmh?}` | **Cada 1–3 s** mientras la app esté abierta y operando |
| `POST /sereno/asignaciones/{id}/aceptar` | «ACEPTAR ALERTA» |
| `POST /sereno/asignaciones/{id}/rechazar` `{motivo, detalle?}` | «NO PUEDO ATENDER» |
| `POST /sereno/asignaciones/{id}/llegada` | Respaldo manual si el GPS no la detecta |
| `POST /sereno/asignaciones/{id}/iniciar-atencion` | «REGISTRAR ATENCIÓN» (opcional) |
| `POST /sereno/asignaciones/{id}/finalizar` `{resultado, observacion?}` | «FINALIZAR ATENCIÓN» |

`{id}` es **`asignacion.id`** (no el `alertaId`).

**Evidencias del sereno:** `POST /sereno/alertas/{alertaId}/evidencias` (aquí `{id}` **sí es el `alertaId`**), mismo formato y
límites que el ciudadano. Se puede mientras tu unidad tenga la alerta aceptada y también después de finalizarla; antes de
aceptar responde `404`. Para ver lo que se envió: `GET /evidencias/{id}/archivo`.

- **Motivos de rechazo:** `OTRA_INCIDENCIA`, `EMERGENCIA`, `UNIDAD_OCUPADA`, `FUERA_DE_SERVICIO`, `SIN_DESPLAZAMIENTO`,
  `SIN_DISPONIBILIDAD`, `OTRO` (este exige `detalle`). Según el motivo tu unidad queda «ocupada» (`EN_ATENCION`) o
  `FUERA_DE_SERVICIO`: la app debe ofrecer volver a `DISPONIBLE` cuando el sereno pueda.
- **Resultados:** `ATENDIDA`, `SIN_NOVEDAD`, `FALSA_ALARMA`, `DERIVADA`, `REQUIERE_APOYO`, `PENDIENTE`, `OTRO`.
- **Estados de la unidad** (colores de la app): `DISPONIBLE` 🟢 · `EN_DESPLAZAMIENTO` 🟠 · `EN_ATENCION` 🔴 · `FUERA_DE_SERVICIO` ⚫.

### Detectar una alerta nueva

Dos formas, usa las dos: el WebSocket `/user/queue/estado` (§4) empuja el estado en el instante; y la respuesta de
`POST /sereno/posicion` (que ya envías cada pocos segundos) también trae la `asignacion`. Así funciona aunque se caiga el WebSocket.

**Importante:** el sereno tiene solo **15 segundos** para responder (`segundosRestantes`). Haz la cuenta regresiva con ese
valor, no con tu propio reloj, y muestra la pantalla de «NUEVA ALERTA» de inmediato (alta prioridad, sonido/vibración).
Si respondes tarde: `409 ASIGNACION_VENCIDA` (aceptar) o `409 ASIGNACION_NO_VIGENTE`: vuelve a leer `GET /sereno/estado`.

### La navegación y la voz son de la app

El servidor da el destino (`asignacion.latitud/longitud`) y una distancia en línea recta, **no una ruta por calles**. La app puede
abrir su propio navegador o usar un SDK de mapas. El asistente de voz («enciende las sirenas», etc.) y el control de las sirenas
no pasan por el servidor; lo que sí debe llamar a la API es aceptar, finalizar, cancelar/rechazar y continuar operando.

---

## 4. Tiempo real (WebSocket)

El WebSocket **empuja** los cambios para no tener que consultar todo el tiempo. REST sigue siendo la fuente de verdad.

- Protocolo **STOMP 1.2 sobre WebSocket**, URL `ws://localhost:8080/ws` (sin SockJS).
- **Autenticación:** el token va en el frame `CONNECT`, en la cabecera `Authorization: Bearer <token>`. Un token ausente o
  inválido hace que el servidor responda con un frame `ERROR` y cierre.
- El canal es **solo de lectura**: el cliente no envía mensajes (se rechazan). Las acciones siempre son REST.
- Sin latidos (`heart-beat:0,0`). Configura reconexión automática en el cliente (p. ej. cada 3 s).

| Rol | Suscríbete a | Mensaje (JSON) |
|---|---|---|
| `CIUDADANO` | `/user/queue/seguimiento` | Igual que `GET /ciudadano/alertas/{id}/seguimiento` |
| `SERENO` | `/user/queue/estado` | Igual que `EstadoSerenoResponse` (`GET /sereno/estado`) |

Cada mensaje trae **el estado actual completo**, no un cambio parcial: reemplaza lo que muestras.

```
CONNECT
accept-version:1.2
host:localhost
Authorization:Bearer eyJhbGciOi…

SUBSCRIBE
id:sub-0
destination:/user/queue/seguimiento
```

**Qué hacer al reconectar:** los mensajes que ocurrieron mientras estuviste desconectado **no se reenvían**. Al reconectar,
vuelve a pedir el estado por REST (`GET …/seguimiento` o `GET /sereno/estado`) y después sigue con el WebSocket.

Librerías STOMP habituales: Android (Krossbow, `StompProtocolAndroid`), Flutter (`stomp_dart_client`), React Native
(`@stomp/stompjs`). Con `@stomp/stompjs`: `new Client({ brokerURL, connectHeaders: { Authorization: 'Bearer …' }, reconnectDelay: 3000 })`.

Las **notificaciones push** (app cerrada) todavía no existen; el WebSocket solo funciona con la app abierta (§6).

---

## 5. Errores

HTTP: `400` datos inválidos · `401` sin sesión o vencida · `403` rol sin permiso · `404` no existe · `409` conflicto de
estado · `422` regla de negocio.

| Código | HTTP | Dónde | Significado |
|---|---|---|---|
| `VALIDACION` | 400 | cualquiera | Revisa `campos` |
| `NO_AUTORIZADO` | 401 | login | Credenciales inválidas o usuario inactivo |
| `CONFLICTO` | 409 | registro, cancelar | Ya existe la cuenta / ya no se puede cancelar |
| `ALERTA_ACTIVA_EXISTENTE` | 409 | crear alerta | Ya tiene una alerta en curso |
| `FUERA_DE_COBERTURA` | 422 | crear alerta | Fuera del distrito |
| `TIPO_ALERTA_INVALIDO` | 422 | crear alerta | Tipo desconocido |
| `NO_ENCONTRADO` | 404 | detalle, seguimiento | No existe o no es suya |
| `SIN_UNIDAD_ASIGNADA` | 409 | sereno | El sereno no tiene unidad |
| `ASIGNACION_VENCIDA` | 409 | aceptar | Se acabó el tiempo |
| `ASIGNACION_NO_VIGENTE` | 409 | sereno | Ya fue reasignada, cancelada o respondida |
| `MOTIVO_INVALIDO` / `DETALLE_REQUERIDO` | 422 | rechazar | Motivo no válido / falta el detalle de «Otro» |
| `RESULTADO_INVALIDO` | 422 | finalizar | Resultado no válido |
| `ESTADO_INVALIDO` | 422 | cambiar estado | Solo `DISPONIBLE` o `FUERA_DE_SERVICIO` |
| `DEMASIADOS_INTENTOS` | 429 | login | 5 fallos seguidos: bloqueado 15 min |
| `CLAVE_ACTUAL_INCORRECTA` / `CLAVE_REPETIDA` | 422 | cambiar clave | La actual no coincide / la nueva es igual |
| `EVIDENCIA_VACIA` | 422 | evidencias | Falta el archivo y la nota |
| `ARCHIVO_NO_PERMITIDO` | 422 | evidencias | Solo JPG, PNG, WebP y MP4 |
| `ARCHIVO_MUY_GRANDE` | 422 / 413 | evidencias | Foto > 8 MB, video > 40 MB (413 si supera el tope absoluto) |
| `NOTA_MUY_LARGA` / `LIMITE_EVIDENCIAS` | 422 | evidencias | Más de 500 caracteres / más de 10 evidencias |

Sin conexión: las apps deben tolerar fallos de red. Reintenta las consultas; **no reintentes a ciegas** `POST /ciudadano/alertas`
(podrías duplicar: el servidor responde `409 ALERTA_ACTIVA_EXISTENTE` y te lleva a la existente) ni las acciones del sereno
(si recibes `409`, relee el estado).

---

## 6. Qué todavía no existe

Para que no lo esperes en el contrato:

- **Notificaciones push** (FCM/APNs): hoy solo hay WebSocket con la app abierta.
- **Validación de identidad real** (RENIEC): el registro solo comprueba formato y unicidad del DNI.
- **Recuperar acceso** si olvidó la contraseña: no hay endpoint (un administrador la reinicia desde la web). Cambiarla
  estando dentro sí se puede (`POST /auth/clave`).
- **Evidencias:** no se pueden borrar ni editar desde las apps, y no hay miniaturas ni compresión en el servidor.
- **Ruta por calles y ETA real:** el servidor da distancia en línea recta y un ETA estimado con velocidad promedio.
- **Alerta sin conexión / por SMS:** no hay.

## 7. Probar sin tener la otra app

### Conectarse al backend desde el celular o el emulador

El backend corre en la PC de la central, no en el celular: la app no puede usar `localhost`.

| Dónde corre la app | URL base de la API | WebSocket |
|---|---|---|
| Emulador de Android Studio | `http://10.0.2.2:8080/api` | `ws://10.0.2.2:8080/ws` |
| Simulador de iOS (en Mac) | `http://localhost:8080/api` (si el backend está en esa Mac) | `ws://localhost:8080/ws` |
| Celular físico | `http://<IP-de-la-PC>:8080/api` | `ws://<IP-de-la-PC>:8080/ws` |

Para el celular físico:
1. El celular y la PC deben estar en **la misma red Wi-Fi**.
2. La IP de la PC: en PowerShell, `ipconfig` → «Dirección IPv4» (por ejemplo `192.168.1.20`).
3. Windows debe dejar entrar al puerto 8080. Si no responde, en PowerShell **como administrador**:
   `New-NetFirewallRule -DisplayName "La Victoria Protege 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow`
4. Prueba primero desde el navegador del celular: `http://<IP>:8080/v3/api-docs/movil` debe mostrar un JSON.
5. El servidor usa **HTTP sin cifrar** (solo desarrollo). En Android hay que permitir tráfico HTTP
   (`android:usesCleartextTraffic="true"` en el manifiesto); en iOS, una excepción de App Transport Security.
6. CORS no afecta a las apps nativas (solo a navegadores). Si la app fuera web, hay que agregar su origen a
   `app.cors.origenes`.

El mapa y la ubicación necesitan permisos del sistema; si el GPS del emulador no se mueve, hay que simular la ubicación.

- **Usuarios de prueba** (DNI): `00000004` y `00000005` serenos (unidades `SV-001`/`SV-002`), `00000006` ciudadano. La clave la define
  `app.seed.password` en `backend/src/main/resources/application-local.properties` (no está en el repositorio: pídesela a quien
  corre el backend).
- **Simulador** (`simulador/`): crea unidades, serenos y ciudadanos de prueba y genera alertas; sirve para **ver tu app del
  ciudadano recibir seguimiento real** mientras la del sereno no existe (y al revés). Ver `simulador/README.md`.
- **Central web** (`http://localhost:4200`, DNI `00000003`): ves cada alerta y unidad y puedes asignar o cancelar a mano.
- **Swagger UI** permite probar los endpoints con el botón *Authorize* (pega el token de `/auth/login`).
- Regenerar los contratos tras un cambio de la API: `cd docs/api && npm run exportar` (con el backend corriendo).
- **El contrato se verifica con pruebas**: `npm run contrato` ejecuta el flujo real de las dos apps y valida cada
  respuesta contra el esquema publicado (si algo no coincide, falla), y `npm run lint` valida que el OpenAPI sea correcto.
  Los campos que pueden venir `null` están declarados así en el contrato: no asumas que un campo con `null` es un error.

Si algo del contrato cambia de forma que rompa a las apps (renombrar o quitar un campo, cambiar un código de error), se avisa y se
documenta aquí antes de hacerlo.
