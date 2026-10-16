# La Victoria Protege

Sistema de seguridad ciudadana para el distrito de La Victoria (Chiclayo). Proyecto de tesis.

- `backend/`: API REST + WebSocket (Spring Boot, PostgreSQL + PostGIS).
- `web/`: plataforma web de la central de monitoreo (Angular).
- `simulador/`: simula ciudadanos y serenos para probar sin las apps.
- `docs/api/`: **contrato de la API para las apps móviles**.

## ¿Vas a hacer las apps móviles (ciudadano y sereno)?

Lee solo esto, en orden:

1. **[`docs/api/GUIA-MOVILES.md`](docs/api/GUIA-MOVILES.md)**: flujos de cada app, estados, WebSocket, errores, evidencias y cómo conectarte al backend desde el celular.
2. **[`docs/api/openapi-movil.json`](docs/api/openapi-movil.json)**: contrato OpenAPI 3.1. Úsalo para generar el cliente HTTP (por ejemplo con openapi-generator) o para consultar cada endpoint.

No necesitas leer el backend ni la web para hacer las apps.

### Probar tu app contra el backend

El backend corre en la PC de quien lo tiene instalado. Para correrlo (JDK 21 y PostgreSQL con PostGIS):

1. Crea la base `victoria_protege` y ejecuta `CREATE EXTENSION postgis;`.
2. Copia `backend/src/main/resources/application-local.properties.example` a `application-local.properties` (no se sube a git) y completa tu clave de PostgreSQL, un `app.jwt.secret` aleatorio de al menos 32 caracteres y `app.seed.password` (la clave de los usuarios de prueba).
3. `cd backend && ./mvnw spring-boot:run` → http://localhost:8080 (Swagger UI en `/swagger-ui.html`).

Usuarios de prueba (DNI): `00000004` y `00000005` serenos, `00000006` ciudadano. Con el simulador (`simulador/README.md`) puedes ver tu app recibir alertas reales sin la otra app.

Más detalle técnico del proyecto: [`CLAUDE.md`](CLAUDE.md).
