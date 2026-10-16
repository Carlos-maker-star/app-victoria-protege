package pe.gob.lavictoria.protege.alerta;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import pe.gob.lavictoria.protege.tiemporeal.EventoAlertaRegistrado;
import pe.gob.lavictoria.protege.tiemporeal.UnidadCambioEvent;

@Repository
public class AlertaRepository {

    /** Alertas que todavia requieren atencion. Debe coincidir con el indice uq_alerta_activa_ciudadano. */
    static final String ESTADOS_FINALES = "('FINALIZADA', 'CANCELADA')";

    private static final String SELECT_CIUDADANO = """
            SELECT a.id, t.codigo AS tipo, t.nombre AS tipo_nombre, a.descripcion,
                   ST_Y(a.ubicacion) AS lat, ST_X(a.ubicacion) AS lon, a.direccion_referencia,
                   a.estado, a.resultado, a.creada_en, a.finalizada_en
            FROM alerta a
            JOIN tipo_alerta t ON t.id = a.tipo_alerta_id
            """;

    private static final String SELECT_MONITOREO = """
            SELECT a.id, t.codigo AS tipo, t.nombre AS tipo_nombre, t.prioridad, a.descripcion,
                   ST_Y(a.ubicacion) AS lat, ST_X(a.ubicacion) AS lon, a.direccion_referencia,
                   a.estado, a.resultado,
                   c.nombres || ' ' || c.apellidos AS ciudadano, c.telefono AS ciudadano_telefono,
                   u.codigo AS unidad_codigo, a.creada_en, a.finalizada_en
            FROM alerta a
            JOIN tipo_alerta t ON t.id = a.tipo_alerta_id
            JOIN usuario c ON c.id = a.ciudadano_id
            LEFT JOIN asignacion s ON s.alerta_id = a.id AND s.estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA')
            LEFT JOIN unidad u ON u.id = s.unidad_id
            """;

    private final JdbcClient jdbc;
    private final ApplicationEventPublisher eventos;

    public AlertaRepository(JdbcClient jdbc, ApplicationEventPublisher eventos) {
        this.jdbc = jdbc;
        this.eventos = eventos;
    }

    public Optional<Long> ciudadanoDe(long alertaId) {
        return jdbc.sql("SELECT ciudadano_id FROM alerta WHERE id = :id")
                .param("id", alertaId)
                .query(Long.class)
                .optional();
    }

    /** Id del tipo de alerta activo con ese codigo. */
    public Optional<Short> tipoActivo(String codigo) {
        return jdbc.sql("SELECT id FROM tipo_alerta WHERE codigo = :codigo AND activo")
                .param("codigo", codigo)
                .query(Short.class)
                .optional();
    }

    /**
     * El punto esta dentro del distrito, o a lo sumo a toleranciaMetros de su limite
     * (el margen absorbe el error del GPS).
     */
    public boolean dentroDelDistrito(double lat, double lon, double toleranciaMetros) {
        return Boolean.TRUE.equals(jdbc.sql("""
                        SELECT EXISTS (
                            SELECT 1 FROM zona
                            WHERE tipo = 'DISTRITO' AND activo
                              AND ST_DWithin(geom::geography,
                                             ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                                             :tolerancia))
                        """)
                .param("lat", lat)
                .param("lon", lon)
                .param("tolerancia", toleranciaMetros)
                .query(Boolean.class)
                .single());
    }

    public long insertar(long ciudadanoId, short tipoId, CrearAlertaRequest r) {
        return jdbc.sql("""
                        INSERT INTO alerta (ciudadano_id, tipo_alerta_id, descripcion, ubicacion,
                                            ubicacion_ciudadano, direccion_referencia, zona_id)
                        VALUES (:ciudadano, :tipo, :descripcion,
                                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                                ST_SetSRID(ST_MakePoint(:lonC, :latC), 4326),
                                :referencia,
                                (SELECT z.id FROM zona z
                                  WHERE z.tipo = 'SECTOR' AND z.activo
                                    AND ST_Covers(z.geom, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
                                  LIMIT 1))
                        RETURNING id
                        """)
                .param("ciudadano", ciudadanoId)
                .param("tipo", tipoId)
                .param("descripcion", vacioANulo(r.descripcion()), Types.VARCHAR)
                .param("lat", r.latitud())
                .param("lon", r.longitud())
                .param("latC", r.latitudCiudadano(), Types.DOUBLE)
                .param("lonC", r.longitudCiudadano(), Types.DOUBLE)
                .param("referencia", vacioANulo(r.referencia()), Types.VARCHAR)
                .query(Long.class)
                .single();
    }

    public void registrarEvento(long alertaId, String tipo, String detalle, Long usuarioId) {
        jdbc.sql("""
                        INSERT INTO alerta_evento (alerta_id, tipo, detalle, usuario_id)
                        VALUES (:alerta, :tipo, :detalle, :usuario)
                        """)
                .param("alerta", alertaId)
                .param("tipo", tipo)
                .param("detalle", detalle, Types.VARCHAR)
                .param("usuario", usuarioId, Types.BIGINT)
                .update();
        eventos.publishEvent(new EventoAlertaRegistrado(alertaId, tipo, detalle, null));
    }

    // ---- consultas del ciudadano ----

    public Optional<AlertaResponse> buscarDelCiudadano(long alertaId, long ciudadanoId) {
        return jdbc.sql(SELECT_CIUDADANO + " WHERE a.id = :id AND a.ciudadano_id = :ciudadano")
                .param("id", alertaId)
                .param("ciudadano", ciudadanoId)
                .query(AlertaRepository::aCiudadano)
                .optional();
    }

    public List<AlertaResponse> listarDelCiudadano(long ciudadanoId) {
        return jdbc.sql(SELECT_CIUDADANO + " WHERE a.ciudadano_id = :ciudadano ORDER BY a.creada_en DESC LIMIT 100")
                .param("ciudadano", ciudadanoId)
                .query(AlertaRepository::aCiudadano)
                .list();
    }

    /** Cancelacion del ciudadano: solo mientras la unidad no ha llegado. */
    public boolean cancelar(long alertaId) {
        return cancelar(alertaId, false);
    }

    /**
     * Cancela y libera la asignacion vigente. La central ({@code central = true}) puede cancelar
     * tambien cuando la unidad ya llego o esta atendiendo (p. ej. falsa alarma confirmada en el lugar).
     * Devuelve false si la alerta ya no era cancelable.
     */
    public boolean cancelar(long alertaId, boolean central) {
        int filas = jdbc.sql("""
                        UPDATE alerta SET estado = 'CANCELADA', finalizada_en = now()
                        WHERE id = :id AND (estado IN ('CREADA', 'BUSCANDO_UNIDAD', 'ASIGNADA',
                                                       'ACEPTADA', 'EN_CAMINO', 'SIN_UNIDAD')
                                            OR (:central AND estado IN ('LLEGO', 'EN_ATENCION')))
                        """)
                .param("id", alertaId)
                .param("central", central)
                .update();
        if (filas == 0) {
            return false;
        }
        // Si una unidad ya iba en camino, queda libre para otra alerta.
        jdbc.sql("""
                        UPDATE unidad SET estado = 'DISPONIBLE'
                        WHERE estado IN ('EN_DESPLAZAMIENTO', 'EN_ATENCION')
                          AND id IN (SELECT unidad_id FROM asignacion
                                      WHERE alerta_id = :id AND estado = 'ACEPTADA')
                        RETURNING id
                        """)
                .param("id", alertaId)
                .query(Long.class)
                .list()
                .forEach(unidadId -> eventos.publishEvent(new UnidadCambioEvent(unidadId)));
        jdbc.sql("""
                        UPDATE asignacion SET estado = 'CANCELADA', finalizada_en = now()
                        WHERE alerta_id = :id AND estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA')
                        """)
                .param("id", alertaId)
                .update();
        return true;
    }

    public record FilaSeguimiento(String estado, String unidadCodigo, Double unidadLat, Double unidadLon,
                                  OffsetDateTime ubicacionEn, Double distanciaM) {
    }

    /** Alerta del ciudadano y la unidad que la acepto (si existe), con su distancia actual al incidente. */
    public Optional<FilaSeguimiento> seguimiento(long alertaId, long ciudadanoId) {
        return jdbc.sql("""
                        SELECT a.estado, u.codigo, ST_Y(u.ubicacion) AS ulat, ST_X(u.ubicacion) AS ulon,
                               u.ubicacion_en, ST_Distance(u.ubicacion::geography, a.ubicacion::geography) AS dist
                        FROM alerta a
                        LEFT JOIN LATERAL (SELECT s.unidad_id FROM asignacion s
                                            WHERE s.alerta_id = a.id AND s.estado IN ('ACEPTADA', 'COMPLETADA')
                                            ORDER BY s.orden DESC LIMIT 1) x ON TRUE
                        LEFT JOIN unidad u ON u.id = x.unidad_id
                        WHERE a.id = :id AND a.ciudadano_id = :ciudadano
                        """)
                .param("id", alertaId)
                .param("ciudadano", ciudadanoId)
                .query((rs, n) -> new FilaSeguimiento(rs.getString("estado"), rs.getString("codigo"),
                        rs.getObject("ulat", Double.class), rs.getObject("ulon", Double.class),
                        rs.getObject("ubicacion_en", OffsetDateTime.class), rs.getObject("dist", Double.class)))
                .optional();
    }

    // ---- consultas de la central ----

    public List<AlertaMonitoreoResponse> listarMonitoreo(String estado, boolean soloActivas, int limite) {
        String filtro = estado != null
                ? " WHERE a.estado = :estado"
                : soloActivas ? " WHERE a.estado NOT IN " + ESTADOS_FINALES : "";
        JdbcClient.StatementSpec q = jdbc.sql(SELECT_MONITOREO + filtro
                + " ORDER BY t.prioridad, a.creada_en DESC LIMIT :limite");
        if (estado != null) {
            q = q.param("estado", estado);
        }
        return q.param("limite", limite).query(AlertaRepository::aMonitoreo).list();
    }

    public Optional<AlertaMonitoreoResponse> buscarMonitoreo(long alertaId) {
        return jdbc.sql(SELECT_MONITOREO + " WHERE a.id = :id")
                .param("id", alertaId)
                .query(AlertaRepository::aMonitoreo)
                .optional();
    }

    public List<EventoResponse> historial(long alertaId) {
        return jdbc.sql("""
                        SELECT e.tipo, e.detalle, u.codigo AS unidad_codigo, e.creado_en,
                               CASE WHEN p.rol_id = (SELECT id FROM rol WHERE codigo = 'CIUDADANO') THEN NULL
                                    ELSE p.nombres || ' ' || p.apellidos END AS usuario
                        FROM alerta_evento e
                        LEFT JOIN unidad u ON u.id = e.unidad_id
                        LEFT JOIN usuario p ON p.id = e.usuario_id
                        WHERE e.alerta_id = :id
                        ORDER BY e.creado_en, e.id
                        """)
                .param("id", alertaId)
                .query((rs, n) -> new EventoResponse(rs.getString("tipo"), rs.getString("detalle"),
                        rs.getString("unidad_codigo"), rs.getString("usuario"),
                        rs.getObject("creado_en", OffsetDateTime.class)))
                .list();
    }

    // ---- mapeo de filas ----

    private static AlertaResponse aCiudadano(ResultSet rs, int n) throws SQLException {
        return new AlertaResponse(rs.getLong("id"), rs.getString("tipo"), rs.getString("tipo_nombre"),
                rs.getString("descripcion"), rs.getDouble("lat"), rs.getDouble("lon"),
                rs.getString("direccion_referencia"), rs.getString("estado"), rs.getString("resultado"),
                rs.getObject("creada_en", OffsetDateTime.class),
                rs.getObject("finalizada_en", OffsetDateTime.class));
    }

    private static AlertaMonitoreoResponse aMonitoreo(ResultSet rs, int n) throws SQLException {
        return new AlertaMonitoreoResponse(rs.getLong("id"), rs.getString("tipo"), rs.getString("tipo_nombre"),
                rs.getInt("prioridad"), rs.getString("descripcion"), rs.getDouble("lat"), rs.getDouble("lon"),
                rs.getString("direccion_referencia"), rs.getString("estado"), rs.getString("resultado"),
                rs.getString("ciudadano"), rs.getString("ciudadano_telefono"), rs.getString("unidad_codigo"),
                rs.getObject("creada_en", OffsetDateTime.class),
                rs.getObject("finalizada_en", OffsetDateTime.class));
    }

    private static String vacioANulo(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
