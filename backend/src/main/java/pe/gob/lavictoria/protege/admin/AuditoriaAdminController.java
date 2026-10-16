package pe.gob.lavictoria.protege.admin;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.gob.lavictoria.protege.common.ApiException;

/** Consulta del registro de auditoria (solo ADMIN, por SecurityConfig). Solo lectura: nadie puede editarlo desde la API. */
@RestController
@RequestMapping("/api/admin/auditoria")
@Tag(name = "Administración · auditoría", description = "Quién hizo qué y cuándo. Solo lectura. Rol requerido: `ADMIN`.")
public class AuditoriaAdminController {

    private static final ZoneId LIMA = ZoneId.of("America/Lima");
    private static final int TAMANO_MAX = 100;

    public record RegistroAuditoriaResponse(
            Long id,
            @Schema(description = "Nombre de quien hizo la acción; null = el sistema o un intento sin sesión", nullable = true) String usuario,
            @Schema(description = "DNI de quien hizo la acción", nullable = true) String dni,
            @Schema(example = "ASIGNACION_MANUAL") String accion,
            @Schema(nullable = true) String entidad,
            @Schema(nullable = true) Long entidadId,
            @Schema(nullable = true) String detalle,
            @Schema(nullable = true) String ip,
            @Schema(nullable = true) String dispositivo,
            OffsetDateTime creadoEn) {
    }

    public record PaginaAuditoriaResponse(long total, int pagina, int tamano, List<RegistroAuditoriaResponse> items) {
    }

    private final JdbcClient jdbc;

    public AuditoriaAdminController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    @Operation(summary = "Listar la auditoría",
            description = "Más reciente primero. Filtros opcionales: `accion` (exacta), `q` (texto en el detalle, el nombre o el DNI) y "
                    + "`desde`/`hasta` (AAAA-MM-DD, hora de Lima, ambos incluidos). `pagina` empieza en 0; `tamano` máximo 100.")
    public PaginaAuditoriaResponse listar(
            @RequestParam(required = false) String accion,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) LocalDate desde,
            @RequestParam(required = false) LocalDate hasta,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "25") int tamano) {
        if (pagina < 0 || tamano < 1 || tamano > TAMANO_MAX) {
            throw ApiException.solicitudInvalida("PAGINACION_INVALIDA", "La página empieza en 0 y el tamaño va de 1 a " + TAMANO_MAX);
        }
        if (desde != null && hasta != null && hasta.isBefore(desde)) {
            throw ApiException.solicitudInvalida("RANGO_INVALIDO", "La fecha final es anterior a la inicial");
        }
        String filtro = """
                FROM auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id
                WHERE (CAST(:accion AS text) IS NULL OR a.accion = :accion)
                  AND (CAST(:q AS text) IS NULL OR a.detalle ILIKE '%' || :q || '%'
                       OR u.dni = :q OR (u.nombres || ' ' || u.apellidos) ILIKE '%' || :q || '%')
                  AND (CAST(:desde AS timestamptz) IS NULL OR a.creado_en >= :desde)
                  AND (CAST(:hasta AS timestamptz) IS NULL OR a.creado_en < :hasta)
                """;
        String texto = q == null || q.isBlank() ? null : q.trim();
        OffsetDateTime d = desde == null ? null : desde.atStartOfDay(LIMA).toOffsetDateTime();
        OffsetDateTime h = hasta == null ? null : hasta.plusDays(1).atStartOfDay(LIMA).toOffsetDateTime();
        String a = accion == null || accion.isBlank() ? null : accion.trim();

        long total = jdbc.sql("SELECT count(*) " + filtro)
                .param("accion", a, java.sql.Types.VARCHAR).param("q", texto, java.sql.Types.VARCHAR)
                .param("desde", d, java.sql.Types.TIMESTAMP_WITH_TIMEZONE).param("hasta", h, java.sql.Types.TIMESTAMP_WITH_TIMEZONE)
                .query(Long.class).single();
        List<RegistroAuditoriaResponse> items = jdbc.sql("""
                        SELECT a.id, u.nombres || ' ' || u.apellidos AS usuario, u.dni, a.accion, a.entidad, a.entidad_id,
                               a.detalle, a.ip, a.dispositivo, a.creado_en
                        """ + filtro + " ORDER BY a.creado_en DESC, a.id DESC LIMIT :limite OFFSET :salto")
                .param("accion", a, java.sql.Types.VARCHAR).param("q", texto, java.sql.Types.VARCHAR)
                .param("desde", d, java.sql.Types.TIMESTAMP_WITH_TIMEZONE).param("hasta", h, java.sql.Types.TIMESTAMP_WITH_TIMEZONE)
                .param("limite", tamano).param("salto", (long) pagina * tamano)
                .query((rs, n) -> new RegistroAuditoriaResponse(rs.getLong("id"), rs.getString("usuario"), rs.getString("dni"),
                        rs.getString("accion"), rs.getString("entidad"), (Long) rs.getObject("entidad_id"), rs.getString("detalle"),
                        rs.getString("ip"), rs.getString("dispositivo"), rs.getObject("creado_en", OffsetDateTime.class)))
                .list();
        return new PaginaAuditoriaResponse(total, pagina, tamano, items);
    }

    @GetMapping("/acciones")
    @Operation(summary = "Acciones registradas", description = "Códigos de acción distintos que hay en la auditoría, para armar el filtro.")
    public List<String> acciones() {
        return jdbc.sql("SELECT DISTINCT accion FROM auditoria ORDER BY accion").query(String.class).list();
    }
}
