package pe.gob.lavictoria.protege.admin;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Objects;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pe.gob.lavictoria.protege.auditoria.AuditoriaService;
import pe.gob.lavictoria.protege.common.ApiException;
import pe.gob.lavictoria.protege.tiemporeal.UnidadCambioEvent;

/**
 * Alta y mantenimiento de unidades y del sereno que las opera. Solo ADMIN.
 * Una unidad nace FUERA_DE_SERVICIO: pasa a DISPONIBLE cuando su sereno lo indica desde la app.
 */
@RestController
@RequestMapping("/api/admin/unidades")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Administración · unidades", description = "Solo ADMIN.")
public class UnidadAdminController {

    public record UnidadAdminResponse(Long id, String codigo, String placa, String tipo, boolean activo,
                                      String estado, Long serenoId, String sereno,
                                      Double latitud, Double longitud, Long zonaId, String zona) {
    }

    public record CrearUnidad(
            @NotBlank @Pattern(regexp = "^[A-Z0-9-]{3,20}$", message = "Usa 3 a 20 letras mayusculas, numeros o guiones") String codigo,
            @Size(max = 10) String placa,
            @Pattern(regexp = "CAMIONETA|MOTO|PATRULLERO|OTRO", message = "Tipo no valido") String tipo,
            Long serenoId,
            Long zonaId) {
    }

    public record ActualizarUnidad(
            @Size(max = 10) String placa,
            @Pattern(regexp = "CAMIONETA|MOTO|PATRULLERO|OTRO", message = "Tipo no valido") String tipo,
            Long serenoId,
            Long zonaId) {
    }

    public record CambioActivo(boolean activo) {
    }

    private static final String SELECT = """
            SELECT u.id, u.codigo, u.placa, u.tipo, u.activo, u.estado, sr.usuario_id AS sereno_id,
                   p.nombres || ' ' || p.apellidos AS sereno, ST_Y(u.ubicacion) AS lat, ST_X(u.ubicacion) AS lon,
                   u.zona_id, z.nombre AS zona
            FROM unidad u
            LEFT JOIN zona z ON z.id = u.zona_id
            LEFT JOIN sereno sr ON sr.unidad_id = u.id AND sr.activo
            LEFT JOIN usuario p ON p.id = sr.usuario_id
            """;

    private final JdbcClient jdbc;
    private final AuditoriaService auditoria;
    private final ApplicationEventPublisher eventos;

    public UnidadAdminController(JdbcClient jdbc, AuditoriaService auditoria, ApplicationEventPublisher eventos) {
        this.jdbc = jdbc;
        this.auditoria = auditoria;
        this.eventos = eventos;
    }

    /** Todas las unidades, activas e inactivas. */
    @GetMapping
    public List<UnidadAdminResponse> listar() {
        return jdbc.sql(SELECT + " ORDER BY u.activo DESC, u.codigo")
                .query(UnidadAdminController::mapear).list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public UnidadAdminResponse crear(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CrearUnidad req) {
        long id;
        try {
            id = jdbc.sql("""
                            INSERT INTO unidad (codigo, placa, tipo, estado, zona_id) VALUES (:codigo, :placa, :tipo, 'FUERA_DE_SERVICIO', :zona)
                            RETURNING id
                            """)
                    .param("codigo", req.codigo())
                    .param("placa", vacioANulo(req.placa()), java.sql.Types.VARCHAR)
                    .param("tipo", req.tipo() == null ? "CAMIONETA" : req.tipo())
                    .param("zona", exigirSector(req.zonaId()), java.sql.Types.BIGINT)
                    .query(Long.class).single();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflicto("Ya existe una unidad con el código " + req.codigo());
        }
        ponerSereno(id, req.serenoId());
        auditoria.registrar(adminId(jwt), "UNIDAD_CREADA", "unidad", id, req.codigo());
        eventos.publishEvent(new UnidadCambioEvent(id));
        return buscar(id);
    }

    @PutMapping("/{id}")
    @Transactional
    public UnidadAdminResponse actualizar(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                          @Valid @RequestBody ActualizarUnidad req) {
        UnidadAdminResponse actual = buscar(id);
        jdbc.sql("UPDATE unidad SET placa = :placa, tipo = :tipo, zona_id = :zona WHERE id = :id")
                .param("placa", vacioANulo(req.placa()), java.sql.Types.VARCHAR)
                .param("tipo", req.tipo() == null ? actual.tipo() : req.tipo())
                .param("zona", exigirSector(req.zonaId()), java.sql.Types.BIGINT)
                .param("id", id).update();
        if (!Objects.equals(actual.serenoId(), req.serenoId())) {
            ponerSereno(id, req.serenoId());
        }
        auditoria.registrar(adminId(jwt), "UNIDAD_ACTUALIZADA", "unidad", id, actual.codigo());
        eventos.publishEvent(new UnidadCambioEvent(id));
        return buscar(id);
    }

    /** Una unidad inactiva no recibe alertas ni aparece en el mapa. No se puede desactivar con una alerta en curso. */
    @PatchMapping("/{id}/activo")
    @Transactional
    public UnidadAdminResponse cambiarActivo(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                             @RequestBody CambioActivo req) {
        UnidadAdminResponse actual = buscar(id);
        if (!req.activo()) {
            exigirSinAlertaEnCurso(id);
        }
        jdbc.sql("UPDATE unidad SET activo = :activo, estado = CASE WHEN :activo THEN estado ELSE 'FUERA_DE_SERVICIO' END WHERE id = :id")
                .param("activo", req.activo()).param("id", id).update();
        auditoria.registrar(adminId(jwt), req.activo() ? "UNIDAD_ACTIVADA" : "UNIDAD_DESACTIVADA", "unidad", id, actual.codigo());
        eventos.publishEvent(new UnidadCambioEvent(id));
        return buscar(id);
    }

    /** Asigna (o quita, con null) el sereno de la unidad. Un sereno opera una sola unidad. */
    private void ponerSereno(long unidadId, Long serenoId) {
        Long actual = jdbc.sql("SELECT usuario_id FROM sereno WHERE unidad_id = :u AND activo")
                .param("u", unidadId).query(Long.class).optional().orElse(null);
        if (Objects.equals(actual, serenoId)) {
            return;
        }
        exigirSinAlertaEnCurso(unidadId);
        if (actual != null) {
            jdbc.sql("UPDATE sereno SET unidad_id = NULL WHERE usuario_id = :id").param("id", actual).update();
        }
        if (serenoId == null) {
            return;
        }
        boolean valido = jdbc.sql("""
                        SELECT EXISTS (SELECT 1 FROM usuario u JOIN rol r ON r.id = u.rol_id
                                        WHERE u.id = :id AND r.codigo = 'SERENO' AND u.activo)
                        """)
                .param("id", serenoId).query(Boolean.class).single();
        if (!valido) {
            throw ApiException.solicitudInvalida("SERENO_INVALIDO", "El usuario no existe, no es sereno o está inactivo");
        }
        String otra = jdbc.sql("""
                        SELECT un.codigo FROM sereno s JOIN unidad un ON un.id = s.unidad_id
                        WHERE s.usuario_id = :id AND s.activo AND s.unidad_id IS NOT NULL
                        """)
                .param("id", serenoId).query(String.class).optional().orElse(null);
        if (otra != null) {
            throw ApiException.conflicto("Ese sereno ya opera la unidad " + otra);
        }
        jdbc.sql("""
                        INSERT INTO sereno (usuario_id, unidad_id, activo) VALUES (:id, :u, TRUE)
                        ON CONFLICT (usuario_id) DO UPDATE SET unidad_id = EXCLUDED.unidad_id, activo = TRUE
                        """)
                .param("id", serenoId).param("u", unidadId).update();
    }

    /** La zona base de una unidad debe ser un sector activo (o null = sin zona base). */
    private Long exigirSector(Long zonaId) {
        if (zonaId == null) {
            return null;
        }
        boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM zona WHERE id = :id AND tipo = 'SECTOR' AND activo)")
                .param("id", zonaId).query(Boolean.class).single();
        if (!ok) {
            throw ApiException.solicitudInvalida("ZONA_INVALIDA", "La zona base debe ser un sector activo");
        }
        return zonaId;
    }

    private void exigirSinAlertaEnCurso(long unidadId) {
        boolean enCurso = jdbc.sql("""
                        SELECT EXISTS (SELECT 1 FROM asignacion WHERE unidad_id = :u
                                        AND estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA'))
                        """)
                .param("u", unidadId).query(Boolean.class).single();
        if (enCurso) {
            throw ApiException.conflicto("La unidad tiene una alerta en curso");
        }
    }

    private UnidadAdminResponse buscar(long id) {
        return jdbc.sql(SELECT + " WHERE u.id = :id").param("id", id)
                .query(UnidadAdminController::mapear).optional()
                .orElseThrow(() -> ApiException.noEncontrado("Unidad no encontrada"));
    }

    private static long adminId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }

    private static String vacioANulo(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static UnidadAdminResponse mapear(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new UnidadAdminResponse(rs.getLong("id"), rs.getString("codigo"), rs.getString("placa"),
                rs.getString("tipo"), rs.getBoolean("activo"), rs.getString("estado"),
                rs.getObject("sereno_id", Long.class), rs.getString("sereno"),
                rs.getObject("lat", Double.class), rs.getObject("lon", Double.class),
                rs.getObject("zona_id", Long.class), rs.getString("zona"));
    }
}
