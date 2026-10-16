package pe.gob.lavictoria.protege.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.ArraySchema;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import java.util.Map;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Documentacion OpenAPI. Dos grupos: "movil" (lo que usan las apps del ciudadano y del sereno) y "web"
 * (la plataforma de la central). La guia con los flujos y el WebSocket esta en docs/api/GUIA-MOVILES.md.
 */
@Configuration
public class OpenApiConfig {

    private static final String JWT = "jwt";

    private static Schema<?> esquemaError() {
        return new ObjectSchema()
                .description("Error de la API. 'campos' solo aparece en errores de validacion (HTTP 400).")
                .addProperty("codigo", new StringSchema().description("Codigo estable para que la app decida qué mostrar")
                        .example("FUERA_DE_COBERTURA"))
                .addProperty("mensaje", new StringSchema().description("Texto listo para mostrar al usuario"))
                .addProperty("campos", new ObjectSchema()
                        .description("Objeto { nombreDelCampo: mensaje } (solo en HTTP 400). Ej.: { \"dni\": \"El DNI debe tener 8 digitos\" }")
                        .additionalProperties(Boolean.TRUE));
    }

    @Bean
    OpenAPI openApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("La Victoria Protege · API")
                        .version("1.0")
                        .description("""
                                Sistema de seguridad ciudadana del distrito de La Victoria (Chiclayo).

                                **Autenticación:** `POST /api/auth/login` devuelve un token JWT. Envíalo en cada petición como
                                `Authorization: Bearer <token>`. Dura 12 horas.

                                **Tiempo real:** además de esta API REST hay un WebSocket (STOMP) en `/ws`; no forma parte de
                                OpenAPI y está descrito en la guía `docs/api/GUIA-MOVILES.md`.

                                **Errores:** todos los errores tienen la forma `{ codigo, mensaje, campos }`. Muestra `mensaje`
                                al usuario y decide la lógica con `codigo`.
                                """))
                .components(new Components()
                        .addSecuritySchemes(JWT, new SecurityScheme().type(SecurityScheme.Type.HTTP)
                                .scheme("bearer").bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList(JWT));
    }

    /** Toda operacion documenta los errores comunes con el esquema ErrorApi. */
    @Bean
    OpenApiCustomizer erroresComunes() {
        return openApi -> {
            // El esquema se agrega aqui (y no en el bean OpenAPI) porque springdoc reconstruye los esquemas
            openApi.getComponents().addSchemas("ErrorApi", esquemaError());
            corregirNulos(openApi);
            aplicarErrores(openApi);
        };
    }

    /**
     * Ajustes para que el contrato diga la verdad sobre los nulos (OpenAPI 3.1):
     * un enum que admite null debe incluir null; un objeto que admite null se expresa con oneOf (springdoc lo
     * emite como type:null junto a $ref, que ningun valor cumple); y en las respuestas todo campo no nulo es
     * obligatorio, para que los clientes generados no lo traten como opcional.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private static void corregirNulos(OpenAPI openApi) {
        openApi.getComponents().getSchemas().forEach((nombre, esquema) -> {
            if (esquema.getProperties() == null) {
                return;
            }
            java.util.List<String> obligatorios = new java.util.ArrayList<>();
            ((Map<String, Schema>) esquema.getProperties()).forEach((campo, p) -> {
                boolean admiteNulo = p.getTypes() != null && p.getTypes().contains("null");
                if (admiteNulo && p.getEnum() != null && !p.getEnum().contains(null)) {
                    java.util.List valores = new java.util.ArrayList<>(p.getEnum()); // la lista original es inmutable
                    valores.add(null);
                    p.setEnum(valores);
                }
                if (admiteNulo && p.get$ref() != null) {
                    Schema referencia = new Schema<>().$ref(p.get$ref());
                    Schema nulo = new Schema<>().types(java.util.Set.of("null"));
                    p.set$ref(null);
                    p.setTypes(null);
                    p.setOneOf(java.util.List.of(referencia, nulo));
                }
                if (!admiteNulo) {
                    obligatorios.add(campo);
                }
            });
            if (nombre.endsWith("Response")) {
                esquema.setRequired(obligatorios);
            }
        });
    }

    /** Resumen de las operaciones de la web (las de las apps llevan su @Operation propio). */
    private static final Map<String, String> RESUMENES_WEB = Map.ofEntries(
            Map.entry("GET /api/monitoreo/alertas", "Listar alertas (activas por defecto; ?todas=true incluye las cerradas)"),
            Map.entry("GET /api/monitoreo/alertas/{id}", "Detalle de una alerta con su historial"),
            Map.entry("GET /api/monitoreo/alertas/{id}/candidatas", "Unidades que la central puede elegir para una alerta"),
            Map.entry("POST /api/monitoreo/alertas/{id}/asignar", "Asignar una unidad a mano"),
            Map.entry("POST /api/monitoreo/alertas/{id}/cancelar", "Cancelar una alerta desde la central"),
            Map.entry("GET /api/monitoreo/unidades", "Unidades activas en tiempo real"),
            Map.entry("GET /api/monitoreo/resumen", "Indicadores del día para el centro de monitoreo"),
            Map.entry("GET /api/monitoreo/zonas", "Zonas del mapa (límite del distrito y sectores) en GeoJSON"),
            Map.entry("GET /api/monitoreo/reportes", "Reporte de un rango de fechas"),
            Map.entry("GET /api/admin/parametros", "Listar los parámetros del motor"),
            Map.entry("PUT /api/admin/parametros/{clave}", "Cambiar un parámetro del motor"),
            Map.entry("GET /api/admin/usuarios", "Listar usuarios (filtros: rol, q, sinUnidad)"),
            Map.entry("POST /api/admin/usuarios", "Crear un usuario"),
            Map.entry("PUT /api/admin/usuarios/{id}", "Actualizar los datos y el rol de un usuario"),
            Map.entry("PATCH /api/admin/usuarios/{id}/activo", "Activar o desactivar un usuario"),
            Map.entry("POST /api/admin/usuarios/{id}/clave", "Reiniciar la contraseña de un usuario"),
            Map.entry("GET /api/admin/unidades", "Listar unidades (activas e inactivas)"),
            Map.entry("POST /api/admin/unidades", "Crear una unidad"),
            Map.entry("PUT /api/admin/unidades/{id}", "Actualizar una unidad y su sereno"),
            Map.entry("PATCH /api/admin/unidades/{id}/activo", "Activar o desactivar una unidad"),
            Map.entry("GET /api/admin/zonas", "Listar distrito y sectores (activos e inactivos)"),
            Map.entry("POST /api/admin/zonas", "Crear un sector dibujando su polígono (GeoJSON)"),
            Map.entry("PUT /api/admin/zonas/{id}", "Renombrar un sector"),
            Map.entry("PUT /api/admin/zonas/distrito", "Redefinir el límite del distrito (polígono GeoJSON)"),
            Map.entry("PATCH /api/admin/zonas/{id}/activo", "Activar o desactivar un sector"),
            Map.entry("POST /api/admin/zonas/cuadricula", "Generar sectores dividiendo el distrito en una cuadrícula"),
            Map.entry("POST /api/admin/zonas/recalcular", "Recalcular el sector de todas las alertas"));

    private static void aplicarErrores(OpenAPI openApi) {
        openApi.getPaths().forEach((ruta, item) -> item.readOperationsMap().forEach((metodo, op) -> {
            if (op.getSummary() == null) {
                op.setSummary(RESUMENES_WEB.getOrDefault(metodo + " " + ruta, op.getOperationId()));
            }
            boolean publica = ruta.equals("/api/auth/login") || ruta.equals("/api/auth/registro");
            boolean conCuerpo = op.getRequestBody() != null;
            if (conCuerpo) {
                op.getResponses().addApiResponse("400", respuesta("Datos inválidos. `campos` indica cuáles."));
            }
            if (!publica) {
                op.getResponses().addApiResponse("401", respuesta("Sin sesión o token vencido: vuelve a iniciar sesión."));
                op.getResponses().addApiResponse("403", respuesta("Tu rol no tiene permiso para esta operación."));
            } else {
                op.setSecurity(java.util.List.of()); // no requiere token
            }
            if (ruta.endsWith("/login")) {
                op.getResponses().addApiResponse("401", respuesta("Credenciales inválidas o usuario inactivo (`NO_AUTORIZADO`)."));
                op.getResponses().addApiResponse("429", respuesta("Demasiados intentos fallidos: la cuenta queda bloqueada unos minutos (`DEMASIADOS_INTENTOS`)."));
            }
            if (metodo == PathItem.HttpMethod.POST && ruta.endsWith("/evidencias")) {
                op.getResponses().addApiResponse("413", respuesta("El archivo supera el tope absoluto de subida (`ARCHIVO_MUY_GRANDE`)."));
            }
            if (ruta.endsWith("/auth/clave")) {
                op.getResponses().addApiResponse("422", respuesta("Clave actual incorrecta (`CLAVE_ACTUAL_INCORRECTA`) o clave nueva igual a la actual (`CLAVE_REPETIDA`)."));
            }
            if (ruta.endsWith("/registro")) {
                op.getResponses().addApiResponse("409", respuesta("Ya existe una cuenta con ese DNI o correo (`CONFLICTO`)."));
            }
            boolean escribe = metodo == PathItem.HttpMethod.POST || metodo == PathItem.HttpMethod.PUT
                    || metodo == PathItem.HttpMethod.PATCH;
            boolean auth = ruta.startsWith("/api/auth");
            if (escribe && !auth) {
                op.getResponses().addApiResponse("409", respuesta("Conflicto con el estado actual (revisa `codigo`)."));
                op.getResponses().addApiResponse("422", respuesta("No cumple una regla de negocio (revisa `codigo` y `mensaje`)."));
            }
            if (ruta.startsWith("/api/sereno")) {
                op.getResponses().addApiResponse("409", respuesta("Conflicto con el estado actual o el sereno no tiene unidad (revisa `codigo`)."));
            }
            if (ruta.contains("{")) {
                op.getResponses().addApiResponse("404", respuesta("No existe (`NO_ENCONTRADO`)."));
            }
        }));
    }

    private static ApiResponse respuesta(String descripcion) {
        return new ApiResponse().description(descripcion)
                .content(new io.swagger.v3.oas.models.media.Content().addMediaType("application/json",
                        new io.swagger.v3.oas.models.media.MediaType().schema(new Schema<>().$ref("#/components/schemas/ErrorApi"))));
    }

    @Bean
    GroupedOpenApi grupoMovil(OpenApiCustomizer erroresComunes) {
        return GroupedOpenApi.builder().group("movil").displayName("Apps móviles (ciudadano y sereno)")
                .pathsToMatch("/api/auth/**", "/api/ciudadano/**", "/api/sereno/**", "/api/evidencias/**")
                .addOpenApiCustomizer(erroresComunes).build();
    }

    @Bean
    GroupedOpenApi grupoWeb(OpenApiCustomizer erroresComunes) {
        return GroupedOpenApi.builder().group("web").displayName("Plataforma web (central y administración)")
                .pathsToMatch("/api/monitoreo/**", "/api/admin/**", "/api/auth/**", "/api/evidencias/**")
                .addOpenApiCustomizer(erroresComunes).build();
    }

    // Evita avisos de importaciones sin uso si se amplian los esquemas
    @SuppressWarnings("unused")
    private static final Class<?>[] REFERENCIAS = {ArraySchema.class, Map.class};
}
