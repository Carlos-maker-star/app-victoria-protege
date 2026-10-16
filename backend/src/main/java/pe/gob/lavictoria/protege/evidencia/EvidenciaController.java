package pe.gob.lavictoria.protege.evidencia;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Evidencias (fotos, videos y notas) de una alerta. Las rutas por rol las protege SecurityConfig. */
@RestController
@Tag(name = "Evidencias", description = """
        Fotos, videos y notas que el ciudadano y el sereno adjuntan a una alerta; la central las ve en el detalle.
        Se suben como `multipart/form-data` con `archivo` (opcional) y `observacion` (opcional, hasta 500 caracteres);
        hay que enviar al menos uno. Fotos JPG, PNG o WebP (hasta 8 MB) y video MP4 (hasta 40 MB); el tipo se
        reconoce por el contenido del archivo, no por su extensión. Máximo 10 evidencias por alerta y por origen.
        Para mostrar una foto o video hay que pedir `GET /api/evidencias/{id}/archivo` **con el token** (una etiqueta
        de imagen sin cabecera no sirve: descarga el archivo y muéstralo desde la memoria).""")
public class EvidenciaController {

    public record EvidenciaResponse(
            Long id,
            Long alertaId,
            @Schema(allowableValues = {"CIUDADANO", "SERENO"}) String origen,
            @Schema(description = "NOTA = solo texto, sin archivo", allowableValues = {"FOTO", "VIDEO", "NOTA"}) String tipo,
            @Schema(nullable = true) String observacion,
            @Schema(description = "Nombre de quien la subió", example = "Carla Soto") String autor,
            @Schema(description = "true si tiene archivo que descargar (foto o video)") boolean conArchivo,
            OffsetDateTime creadoEn) {

        static EvidenciaResponse de(EvidenciaService.Evidencia e) {
            return new EvidenciaResponse(e.id(), e.alertaId(), e.origen(), e.tipo(), e.observacion(), e.autor(), e.conArchivo(), e.creadoEn());
        }
    }

    private final EvidenciaService servicio;

    public EvidenciaController(EvidenciaService servicio) {
        this.servicio = servicio;
    }

    private static long id(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }

    @PostMapping(value = "/api/ciudadano/alertas/{id}/evidencias", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Adjuntar evidencia a mi alerta (ciudadano)",
            description = """
                    Solo mientras la alerta sigue en curso. Errores: `404 NO_ENCONTRADO` (no es tu alerta),
                    `409 CONFLICTO` (la alerta ya terminó), `422 EVIDENCIA_VACIA`, `422 ARCHIVO_NO_PERMITIDO`,
                    `422 ARCHIVO_MUY_GRANDE`, `422 NOTA_MUY_LARGA`, `422 LIMITE_EVIDENCIAS`.""")
    public EvidenciaResponse subirCiudadano(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                            @RequestParam(required = false) MultipartFile archivo,
                                            @RequestParam(required = false) String observacion) {
        return EvidenciaResponse.de(servicio.subirCiudadano(id, id(jwt), archivo, observacion));
    }

    @GetMapping("/api/ciudadano/alertas/{id}/evidencias")
    @Operation(summary = "Evidencias de mi alerta (ciudadano)", description = "Todas las evidencias de la alerta, la más antigua primero.")
    public List<EvidenciaResponse> listarCiudadano(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
        return servicio.listarCiudadano(id, id(jwt)).stream().map(EvidenciaResponse::de).toList();
    }

    @PostMapping(value = "/api/sereno/alertas/{id}/evidencias", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Adjuntar evidencia a una alerta atendida (sereno)",
            description = """
                    `{id}` es el **id de la alerta** (`alertaId` de la asignación). Sirve mientras tu unidad la tenga
                    aceptada y también después de finalizarla. Errores: `404 NO_ENCONTRADO` (no la tienes asignada),
                    `422 EVIDENCIA_VACIA`, `422 ARCHIVO_NO_PERMITIDO`, `422 ARCHIVO_MUY_GRANDE`, `422 NOTA_MUY_LARGA`,
                    `422 LIMITE_EVIDENCIAS`.""")
    public EvidenciaResponse subirSereno(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                         @RequestParam(required = false) MultipartFile archivo,
                                         @RequestParam(required = false) String observacion) {
        return EvidenciaResponse.de(servicio.subirSereno(id, id(jwt), archivo, observacion));
    }

    @GetMapping("/api/monitoreo/alertas/{id}/evidencias")
    @Operation(summary = "Evidencias de una alerta (central)", description = "Todas las evidencias, la más antigua primero.")
    public List<EvidenciaResponse> listarCentral(@PathVariable long id) {
        return servicio.listarCentral(id).stream().map(EvidenciaResponse::de).toList();
    }

    @GetMapping(value = "/api/evidencias/{id}/archivo", produces = {"image/jpeg", "image/png", "image/webp", "video/mp4", "application/json"})
    @Operation(summary = "Descargar la foto o el video de una evidencia",
            description = """
                    Devuelve el archivo (`image/jpeg`, `image/png`, `image/webp` o `video/mp4`). Requiere el token. Lo puede
                    pedir la central, el ciudadano dueño de la alerta y el sereno que la atendió; para cualquier otro
                    usuario, o si es una nota sin archivo, responde `404 NO_ENCONTRADO`.""")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "El archivo",
            content = @io.swagger.v3.oas.annotations.media.Content(mediaType = "*/*", schema = @Schema(type = "string", format = "binary")))
    public ResponseEntity<org.springframework.core.io.Resource> archivo(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
        var archivo = servicio.abrir(id, id(jwt), String.valueOf(jwt.getClaimAsString("rol")));
        return ResponseEntity.ok()
                .contentType(archivo.tipo())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Disposition", "inline")
                .cacheControl(CacheControl.noStore())
                .body(archivo.recurso());
    }
}
