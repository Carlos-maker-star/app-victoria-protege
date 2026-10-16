package pe.gob.lavictoria.protege.admin;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pe.gob.lavictoria.protege.auditoria.AuditoriaService;
import pe.gob.lavictoria.protege.common.ApiException;
import pe.gob.lavictoria.protege.tiemporeal.UnidadCambioEvent;
import org.springframework.context.ApplicationEventPublisher;

/** Alta y mantenimiento de usuarios (personal y ciudadanos). Solo ADMIN. */
@RestController
@RequestMapping("/api/admin/usuarios")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Administración · usuarios", description = "Solo ADMIN.")
public class UsuarioAdminController {

    public record UsuarioAdminResponse(Long id, String dni, String nombres, String apellidos, String email,
                                       String telefono, String rol, boolean activo, String unidadCodigo,
                                       OffsetDateTime creadoEn) {
    }

    public record CrearUsuario(
            @NotBlank @Pattern(regexp = "\\d{8}", message = "El DNI debe tener 8 digitos") String dni,
            @NotBlank @Size(max = 100) String nombres,
            @NotBlank @Size(max = 100) String apellidos,
            @Email @Size(max = 150) String email,
            @Pattern(regexp = "\\d{9}", message = "El telefono debe tener 9 digitos") String telefono,
            @NotBlank String rol,
            @NotBlank @Size(min = 8, max = 72, message = "La clave debe tener entre 8 y 72 caracteres") String password) {
    }

    public record ActualizarUsuario(
            @NotBlank @Size(max = 100) String nombres,
            @NotBlank @Size(max = 100) String apellidos,
            @Email @Size(max = 150) String email,
            @Pattern(regexp = "\\d{9}", message = "El telefono debe tener 9 digitos") String telefono,
            @NotBlank String rol) {
    }

    public record CambioActivo(boolean activo) {
    }

    public record NuevaClave(
            @NotBlank @Size(min = 8, max = 72, message = "La clave debe tener entre 8 y 72 caracteres") String password) {
    }

    private static final String SELECT = """
            SELECT u.id, u.dni, u.nombres, u.apellidos, u.email, u.telefono, r.codigo AS rol, u.activo,
                   un.codigo AS unidad, u.creado_en
            FROM usuario u
            JOIN rol r ON r.id = u.rol_id
            LEFT JOIN sereno s ON s.usuario_id = u.id AND s.activo
            LEFT JOIN unidad un ON un.id = s.unidad_id
            """;

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final AuditoriaService auditoria;
    private final ApplicationEventPublisher eventos;

    public UsuarioAdminController(JdbcClient jdbc, PasswordEncoder encoder, AuditoriaService auditoria,
                                  ApplicationEventPublisher eventos) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.auditoria = auditoria;
        this.eventos = eventos;
    }

    /** Filtros opcionales: rol, texto (nombre, DNI o correo) y sinUnidad (serenos sin unidad). */
    @GetMapping
    public List<UsuarioAdminResponse> listar(@RequestParam(required = false) String rol,
                                             @RequestParam(required = false) String q,
                                             @RequestParam(defaultValue = "false") boolean sinUnidad,
                                             @RequestParam(defaultValue = "200") int limite) {
        String texto = q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase() + "%";
        return jdbc.sql(SELECT + """
                         WHERE (CAST(:rol AS varchar) IS NULL OR r.codigo = :rol)
                           AND (CAST(:texto AS varchar) IS NULL OR lower(u.nombres || ' ' || u.apellidos) LIKE :texto
                                OR u.dni LIKE :texto OR lower(COALESCE(u.email, '')) LIKE :texto)
                           AND (NOT :sinUnidad OR (r.codigo = 'SERENO' AND u.activo AND un.id IS NULL))
                         ORDER BY u.activo DESC,
                                  CASE r.codigo WHEN 'ADMIN' THEN 1 WHEN 'SUPERVISOR' THEN 2 WHEN 'OPERADOR' THEN 3
                                                WHEN 'SERENO' THEN 4 ELSE 5 END,
                                  u.apellidos, u.nombres
                         LIMIT :limite
                        """)
                .param("rol", rol == null || rol.isBlank() ? null : rol.toUpperCase(), java.sql.Types.VARCHAR)
                .param("texto", texto, java.sql.Types.VARCHAR)
                .param("sinUnidad", sinUnidad)
                .param("limite", Math.min(Math.max(limite, 1), 500))
                .query(UsuarioAdminController::mapear)
                .list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public UsuarioAdminResponse crear(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CrearUsuario req) {
        short rolId = rolId(req.rol());
        String email = vacioANulo(req.email());
        try {
            long id = jdbc.sql("""
                            INSERT INTO usuario (rol_id, dni, nombres, apellidos, email, telefono, password_hash)
                            VALUES (:rol, :dni, :nombres, :apellidos, :email, :telefono, :clave) RETURNING id
                            """)
                    .param("rol", rolId)
                    .param("dni", req.dni())
                    .param("nombres", req.nombres().trim())
                    .param("apellidos", req.apellidos().trim())
                    .param("email", email, java.sql.Types.VARCHAR)
                    .param("telefono", req.telefono(), java.sql.Types.VARCHAR)
                    .param("clave", encoder.encode(req.password()))
                    .query(Long.class).single();
            auditoria.registrar(admin(jwt), "USUARIO_CREADO", "usuario", id, req.rol().toUpperCase() + " " + req.dni());
            return buscar(id);
        } catch (DuplicateKeyException e) {
            throw ApiException.conflicto("Ya existe un usuario con ese DNI o correo");
        }
    }

    @PutMapping("/{id}")
    @Transactional
    public UsuarioAdminResponse actualizar(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                           @Valid @RequestBody ActualizarUsuario req) {
        UsuarioAdminResponse actual = buscar(id);
        String rolNuevo = req.rol().trim().toUpperCase();
        if (!rolNuevo.equals(actual.rol())) {
            if (id == admin(jwt)) {
                throw ApiException.conflicto("No puedes cambiar tu propio rol");
            }
            if ("SERENO".equals(actual.rol()) && actual.unidadCodigo() != null) {
                throw ApiException.conflicto("Quita primero la unidad " + actual.unidadCodigo() + " a este sereno");
            }
        }
        try {
            jdbc.sql("""
                            UPDATE usuario SET rol_id = :rol, nombres = :nombres, apellidos = :apellidos,
                                               email = :email, telefono = :telefono
                            WHERE id = :id
                            """)
                    .param("rol", rolId(rolNuevo))
                    .param("nombres", req.nombres().trim())
                    .param("apellidos", req.apellidos().trim())
                    .param("email", vacioANulo(req.email()), java.sql.Types.VARCHAR)
                    .param("telefono", req.telefono(), java.sql.Types.VARCHAR)
                    .param("id", id)
                    .update();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflicto("Ya existe un usuario con ese correo");
        }
        auditoria.registrar(admin(jwt), "USUARIO_ACTUALIZADO", "usuario", id,
                rolNuevo.equals(actual.rol()) ? "datos" : "rol " + actual.rol() + " -> " + rolNuevo);
        return buscar(id);
    }

    /**
     * Activar o desactivar el acceso. Un sereno desactivado deja de recibir alertas; no se puede
     * desactivar mientras tiene una alerta en curso, ni a uno mismo.
     */
    @PatchMapping("/{id}/activo")
    @Transactional
    public UsuarioAdminResponse cambiarActivo(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                              @RequestBody CambioActivo req) {
        UsuarioAdminResponse actual = buscar(id);
        if (!req.activo()) {
            if (id == admin(jwt)) {
                throw ApiException.conflicto("No puedes desactivar tu propio usuario");
            }
            if ("SERENO".equals(actual.rol())) {
                boolean enCurso = jdbc.sql("""
                                SELECT EXISTS (SELECT 1 FROM asignacion a JOIN sereno s ON s.unidad_id = a.unidad_id
                                                WHERE s.usuario_id = :id AND a.estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA'))
                                """)
                        .param("id", id).query(Boolean.class).single();
                if (enCurso) {
                    throw ApiException.conflicto("El sereno tiene una alerta en curso");
                }
            }
        }
        jdbc.sql("UPDATE usuario SET activo = :activo WHERE id = :id").param("activo", req.activo()).param("id", id).update();
        // El sereno desactivado deja de ser candidato y su unidad pasa a fuera de servicio
        jdbc.sql("UPDATE sereno SET activo = :activo WHERE usuario_id = :id").param("activo", req.activo()).param("id", id).update();
        if (!req.activo()) {
            jdbc.sql("""
                            UPDATE unidad SET estado = 'FUERA_DE_SERVICIO'
                            WHERE id IN (SELECT unidad_id FROM sereno WHERE usuario_id = :id) AND estado <> 'FUERA_DE_SERVICIO'
                            RETURNING id
                            """)
                    .param("id", id).query(Long.class).list()
                    .forEach(u -> eventos.publishEvent(new UnidadCambioEvent(u)));
        }
        auditoria.registrar(admin(jwt), req.activo() ? "USUARIO_ACTIVADO" : "USUARIO_DESACTIVADO", "usuario", id, actual.dni());
        return buscar(id);
    }

    /** El administrador fija una clave nueva (por ejemplo, si el usuario la olvidó). */
    @PostMapping("/{id}/clave")
    @Transactional
    public UsuarioAdminResponse reiniciarClave(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                               @Valid @RequestBody NuevaClave req) {
        UsuarioAdminResponse actual = buscar(id);
        jdbc.sql("UPDATE usuario SET password_hash = :clave WHERE id = :id")
                .param("clave", encoder.encode(req.password())).param("id", id).update();
        auditoria.registrar(admin(jwt), "CLAVE_REINICIADA", "usuario", id, actual.dni());
        return actual;
    }

    private UsuarioAdminResponse buscar(long id) {
        return jdbc.sql(SELECT + " WHERE u.id = :id").param("id", id)
                .query(UsuarioAdminController::mapear).optional()
                .orElseThrow(() -> ApiException.noEncontrado("Usuario no encontrado"));
    }

    private short rolId(String codigo) {
        return jdbc.sql("SELECT id FROM rol WHERE codigo = :codigo").param("codigo", codigo.trim().toUpperCase())
                .query(Short.class).optional()
                .orElseThrow(() -> ApiException.solicitudInvalida("ROL_INVALIDO", "El rol no existe"));
    }

    private static long admin(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }

    private static String vacioANulo(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static UsuarioAdminResponse mapear(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new UsuarioAdminResponse(rs.getLong("id"), rs.getString("dni"), rs.getString("nombres"),
                rs.getString("apellidos"), rs.getString("email"), rs.getString("telefono"), rs.getString("rol"),
                rs.getBoolean("activo"), rs.getString("unidad"), rs.getObject("creado_en", OffsetDateTime.class));
    }
}
