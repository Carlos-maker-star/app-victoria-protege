package pe.gob.lavictoria.protege.asignacion;

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
public class AsignacionRepository {

    public record ContextoSereno(long unidadId, String unidadCodigo) {
    }

    public record AlertaBloqueada(long id, String estado, double espera) {
    }

    public record AsignacionBloqueada(long id, long alertaId, long unidadId, String estado, boolean vencida) {
    }

    public record Candidata(long unidadId, String codigo, double distanciaM) {
    }

    private static final String SELECT_ASIGNACION = """
            SELECT s.id, s.alerta_id, s.estado, s.orden, s.distancia_m, s.eta_segundos, s.vence_en,
                   GREATEST(0, EXTRACT(EPOCH FROM (s.vence_en - now()))) AS restantes,
                   t.codigo AS tipo, t.nombre AS tipo_nombre, a.descripcion,
                   ST_Y(a.ubicacion) AS lat, ST_X(a.ubicacion) AS lon, a.direccion_referencia,
                   a.estado AS alerta_estado, s.llegada_en
            FROM asignacion s
            JOIN alerta a ON a.id = s.alerta_id
            JOIN tipo_alerta t ON t.id = a.tipo_alerta_id
            """;

    public record SerenoUnidad(long usuarioId, long unidadId) {
    }

    private final JdbcClient jdbc;
    private final ApplicationEventPublisher eventos;

    public AsignacionRepository(JdbcClient jdbc, ApplicationEventPublisher eventos) {
        this.jdbc = jdbc;
        this.eventos = eventos;
    }

    /** Serenos de todas las unidades que han tenido esta alerta asignada (vigente, rechazada o cancelada). */
    public List<SerenoUnidad> serenosInvolucrados(long alertaId) {
        return jdbc.sql("""
                        SELECT DISTINCT sr.usuario_id, sr.unidad_id
                        FROM asignacion s JOIN sereno sr ON sr.unidad_id = s.unidad_id AND sr.activo
                        WHERE s.alerta_id = :alerta
                        """)
                .param("alerta", alertaId)
                .query((rs, n) -> new SerenoUnidad(rs.getLong("usuario_id"), rs.getLong("unidad_id")))
                .list();
    }

    // ---------------------------------------------------------------- sereno / unidad

    public Optional<ContextoSereno> contextoSereno(long usuarioId) {
        return jdbc.sql("""
                        SELECT u.id, u.codigo
                        FROM sereno s JOIN unidad u ON u.id = s.unidad_id
                        WHERE s.usuario_id = :usuario AND s.activo AND u.activo
                        """)
                .param("usuario", usuarioId)
                .query((rs, n) -> new ContextoSereno(rs.getLong("id"), rs.getString("codigo")))
                .optional();
    }

    public EstadoSerenoResponse vistaUnidad(long unidadId, AsignacionResponse asignacion) {
        return jdbc.sql("""
                        SELECT id, codigo, estado, ST_Y(ubicacion) AS lat, ST_X(ubicacion) AS lon, ubicacion_en
                        FROM unidad WHERE id = :id
                        """)
                .param("id", unidadId)
                .query((rs, n) -> new EstadoSerenoResponse(rs.getLong("id"), rs.getString("codigo"),
                        rs.getString("estado"), rs.getObject("lat", Double.class),
                        rs.getObject("lon", Double.class),
                        rs.getObject("ubicacion_en", OffsetDateTime.class), asignacion))
                .single();
    }

    public void estadoUnidad(long unidadId, String estado) {
        jdbc.sql("UPDATE unidad SET estado = :estado WHERE id = :id")
                .param("estado", estado)
                .param("id", unidadId)
                .update();
        eventos.publishEvent(new UnidadCambioEvent(unidadId));
    }

    public void actualizarPosicion(long unidadId, double lat, double lon, Double velocidad) {
        jdbc.sql("""
                        UPDATE unidad
                        SET ubicacion = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), ubicacion_en = now(),
                            velocidad_kmh = :velocidad
                        WHERE id = :id
                        """)
                .param("lat", lat)
                .param("lon", lon)
                .param("velocidad", velocidad, Types.NUMERIC)
                .param("id", unidadId)
                .update();
        eventos.publishEvent(new UnidadCambioEvent(unidadId));
    }

    public void guardarRecorrido(long unidadId, long alertaId, double lat, double lon, Double velocidad) {
        jdbc.sql("""
                        INSERT INTO unidad_posicion (unidad_id, alerta_id, ubicacion, velocidad_kmh)
                        VALUES (:unidad, :alerta, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :velocidad)
                        """)
                .param("unidad", unidadId)
                .param("alerta", alertaId)
                .param("lat", lat)
                .param("lon", lon)
                .param("velocidad", velocidad, Types.NUMERIC)
                .update();
    }

    /** Asignacion de la unidad en la que el sereno esta trabajando: pendiente de respuesta o aceptada. */
    public Optional<AsignacionResponse> asignacionVigente(long unidadId) {
        return jdbc.sql(SELECT_ASIGNACION + """
                         WHERE s.unidad_id = :unidad AND s.estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA')
                         LIMIT 1
                        """)
                .param("unidad", unidadId)
                .query(AsignacionRepository::aAsignacion)
                .optional();
    }

    /** Si la unidad en ruta ya esta a distanciaMetros o menos de la alerta, devuelve esa asignacion. */
    public Optional<Long> asignacionEnLlegada(long unidadId, double distanciaMetros) {
        return jdbc.sql("""
                        SELECT s.id
                        FROM asignacion s
                        JOIN alerta a ON a.id = s.alerta_id
                        JOIN unidad u ON u.id = s.unidad_id
                        WHERE s.unidad_id = :unidad AND s.estado = 'ACEPTADA' AND a.estado = 'EN_CAMINO'
                          AND ST_DWithin(u.ubicacion::geography, a.ubicacion::geography, :distancia)
                        """)
                .param("unidad", unidadId)
                .param("distancia", distanciaMetros)
                .query(Long.class)
                .optional();
    }

    // ---------------------------------------------------------------- motor

    /** Bloquea la fila de la alerta. Siempre se bloquea la alerta antes que la asignacion. */
    public Optional<AlertaBloqueada> bloquearAlerta(long alertaId) {
        return jdbc.sql("""
                        SELECT id, estado, EXTRACT(EPOCH FROM (now() - creada_en)) AS espera
                        FROM alerta WHERE id = :id FOR UPDATE
                        """)
                .param("id", alertaId)
                .query((rs, n) -> new AlertaBloqueada(rs.getLong("id"), rs.getString("estado"),
                        rs.getDouble("espera")))
                .optional();
    }

    public boolean existeAlerta(long alertaId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM alerta WHERE id = :id)")
                .param("id", alertaId)
                .query(Boolean.class)
                .single();
    }

    public int contarAsignaciones(long alertaId) {
        return jdbc.sql("SELECT count(*) FROM asignacion WHERE alerta_id = :id")
                .param("id", alertaId)
                .query(Integer.class)
                .single();
    }

    /**
     * Unidad disponible mas cercana (linea recta) que no haya sido intentada para esta alerta,
     * con posicion reciente y sin otra asignacion vigente. SKIP LOCKED evita que dos
     * alertas simultaneas tomen la misma unidad.
     */
    public Optional<Candidata> mejorCandidata(long alertaId, int radioMetros, int obsoletaSegundos) {
        return jdbc.sql("""
                        SELECT u.id, u.codigo, ST_Distance(u.ubicacion::geography, a.ubicacion::geography) AS dist
                        FROM unidad u
                        JOIN sereno sr ON sr.unidad_id = u.id AND sr.activo,
                             alerta a
                        WHERE a.id = :alerta
                          AND u.activo AND u.estado = 'DISPONIBLE'
                          AND u.ubicacion IS NOT NULL
                          AND u.ubicacion_en > now() - (:obsoleta * interval '1 second')
                          AND ST_DWithin(u.ubicacion::geography, a.ubicacion::geography, :radio)
                          AND NOT EXISTS (SELECT 1 FROM asignacion x
                                           WHERE x.unidad_id = u.id
                                             AND x.estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA'))
                          AND NOT EXISTS (SELECT 1 FROM asignacion x
                                           WHERE x.alerta_id = a.id AND x.unidad_id = u.id)
                        ORDER BY dist
                        LIMIT 1
                        FOR UPDATE OF u SKIP LOCKED
                        """)
                .param("alerta", alertaId)
                .param("obsoleta", obsoletaSegundos)
                .param("radio", radioMetros)
                .query((rs, n) -> new Candidata(rs.getLong("id"), rs.getString("codigo"), rs.getDouble("dist")))
                .optional();
    }

    /** distanciaM y etaSegundos pueden ser null (asignacion manual de una unidad sin posicion conocida). */
    public long insertarAsignacion(long alertaId, long unidadId, int orden, Integer distanciaM, Integer etaSegundos,
                                   int segundosRespuesta) {
        return jdbc.sql("""
                        INSERT INTO asignacion (alerta_id, unidad_id, orden, distancia_m, eta_segundos, vence_en)
                        VALUES (:alerta, :unidad, :orden, :distancia, :eta, now() + (:respuesta * interval '1 second'))
                        RETURNING id
                        """)
                .param("alerta", alertaId)
                .param("unidad", unidadId)
                .param("orden", orden)
                .param("distancia", distanciaM, Types.INTEGER)
                .param("eta", etaSegundos, Types.INTEGER)
                .param("respuesta", segundosRespuesta)
                .query(Long.class)
                .single();
    }

    public record UnidadManual(long unidadId, String codigo, Double distanciaM) {
    }

    /**
     * Bloquea la unidad solo si puede recibir la alerta: activa, DISPONIBLE, con sereno y sin otra
     * asignacion vigente. A diferencia del motor, NO exige posicion reciente ni descarta las unidades
     * ya intentadas: la central decide.
     */
    public Optional<UnidadManual> bloquearUnidadAsignable(long unidadId, long alertaId) {
        return jdbc.sql("""
                        SELECT u.id, u.codigo,
                               ST_Distance(u.ubicacion::geography, a.ubicacion::geography) AS dist
                        FROM unidad u
                        JOIN sereno sr ON sr.unidad_id = u.id AND sr.activo,
                             alerta a
                        WHERE u.id = :unidad AND a.id = :alerta
                          AND u.activo AND u.estado = 'DISPONIBLE'
                          AND NOT EXISTS (SELECT 1 FROM asignacion x
                                           WHERE x.unidad_id = u.id
                                             AND x.estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA'))
                        FOR UPDATE OF u
                        """)
                .param("unidad", unidadId)
                .param("alerta", alertaId)
                .query((rs, n) -> new UnidadManual(rs.getLong("id"), rs.getString("codigo"),
                        rs.getObject("dist", Double.class)))
                .optional();
    }

    /** Retira la asignacion que esperaba respuesta (la central la reemplaza). Devuelve el codigo de la unidad. */
    public Optional<String> cancelarPendiente(long alertaId) {
        return jdbc.sql("""
                        UPDATE asignacion s SET estado = 'CANCELADA', finalizada_en = now()
                        FROM unidad u
                        WHERE s.alerta_id = :alerta AND s.estado = 'PENDIENTE_RESPUESTA' AND u.id = s.unidad_id
                        RETURNING u.codigo
                        """)
                .param("alerta", alertaId)
                .query(String.class)
                .optional();
    }

    public record FilaCandidata(long unidadId, String codigo, String sereno, String estado, Double distanciaM,
                                OffsetDateTime ubicacionEn, Long alertaActualId, boolean tieneSereno) {
    }

    /** Todas las unidades activas con su distancia a la alerta, para que la central elija. */
    public List<FilaCandidata> candidatas(long alertaId) {
        return jdbc.sql("""
                        SELECT u.id, u.codigo, p.nombres || ' ' || p.apellidos AS sereno, u.estado, u.ubicacion_en,
                               ST_Distance(u.ubicacion::geography, a.ubicacion::geography) AS dist,
                               s.alerta_id AS alerta_actual, (sr.id IS NOT NULL) AS tiene_sereno
                        FROM unidad u
                        CROSS JOIN alerta a
                        LEFT JOIN sereno sr ON sr.unidad_id = u.id AND sr.activo
                        LEFT JOIN usuario p ON p.id = sr.usuario_id
                        LEFT JOIN asignacion s ON s.unidad_id = u.id AND s.estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA')
                        WHERE a.id = :alerta AND u.activo
                        ORDER BY dist NULLS LAST, u.codigo
                        """)
                .param("alerta", alertaId)
                .query((rs, n) -> new FilaCandidata(rs.getLong("id"), rs.getString("codigo"), rs.getString("sereno"),
                        rs.getString("estado"), rs.getObject("dist", Double.class),
                        rs.getObject("ubicacion_en", OffsetDateTime.class),
                        rs.getObject("alerta_actual", Long.class), rs.getBoolean("tiene_sereno")))
                .list();
    }

    public void estadoAlerta(long alertaId, String estado) {
        jdbc.sql("UPDATE alerta SET estado = :estado WHERE id = :id")
                .param("estado", estado)
                .param("id", alertaId)
                .update();
    }

    public void finalizarAlerta(long alertaId, String resultado) {
        jdbc.sql("""
                        UPDATE alerta SET estado = 'FINALIZADA', resultado = :resultado, finalizada_en = now()
                        WHERE id = :id
                        """)
                .param("resultado", resultado)
                .param("id", alertaId)
                .update();
    }

    public Optional<Long> alertaDe(long asignacionId) {
        return jdbc.sql("SELECT alerta_id FROM asignacion WHERE id = :id")
                .param("id", asignacionId)
                .query(Long.class)
                .optional();
    }

    public Optional<AsignacionBloqueada> bloquearAsignacion(long asignacionId) {
        return jdbc.sql("""
                        SELECT id, alerta_id, unidad_id, estado, vence_en < now() AS vencida
                        FROM asignacion WHERE id = :id FOR UPDATE
                        """)
                .param("id", asignacionId)
                .query((rs, n) -> new AsignacionBloqueada(rs.getLong("id"), rs.getLong("alerta_id"),
                        rs.getLong("unidad_id"), rs.getString("estado"), rs.getBoolean("vencida")))
                .optional();
    }

    public void aceptarAsignacion(long id) {
        jdbc.sql("UPDATE asignacion SET estado = 'ACEPTADA', respondida_en = now() WHERE id = :id")
                .param("id", id).update();
    }

    public void rechazarAsignacion(long id, short motivoId, String detalle) {
        jdbc.sql("""
                        UPDATE asignacion
                        SET estado = 'RECHAZADA', respondida_en = now(),
                            motivo_rechazo_id = :motivo, motivo_detalle = :detalle
                        WHERE id = :id
                        """)
                .param("motivo", motivoId)
                .param("detalle", detalle, Types.VARCHAR)
                .param("id", id)
                .update();
    }

    public void asignacionSinRespuesta(long id) {
        jdbc.sql("UPDATE asignacion SET estado = 'SIN_RESPUESTA', respondida_en = now() WHERE id = :id")
                .param("id", id).update();
    }

    public void asignacionLlegada(long id) {
        jdbc.sql("UPDATE asignacion SET llegada_en = now() WHERE id = :id").param("id", id).update();
    }

    public void asignacionCompletada(long id) {
        jdbc.sql("UPDATE asignacion SET estado = 'COMPLETADA', finalizada_en = now() WHERE id = :id")
                .param("id", id).update();
    }

    public record Motivo(short id, String nombre) {
    }

    public Optional<Motivo> motivoActivo(String codigo) {
        return jdbc.sql("SELECT id, nombre FROM motivo_rechazo WHERE codigo = :codigo AND activo")
                .param("codigo", codigo)
                .query((rs, n) -> new Motivo(rs.getShort("id"), rs.getString("nombre")))
                .optional();
    }

    public void evento(long alertaId, String tipo, String detalle, Long unidadId, Long usuarioId) {
        jdbc.sql("""
                        INSERT INTO alerta_evento (alerta_id, tipo, detalle, unidad_id, usuario_id)
                        VALUES (:alerta, :tipo, :detalle, :unidad, :usuario)
                        """)
                .param("alerta", alertaId)
                .param("tipo", tipo)
                .param("detalle", detalle, Types.VARCHAR)
                .param("unidad", unidadId, Types.BIGINT)
                .param("usuario", usuarioId, Types.BIGINT)
                .update();
        eventos.publishEvent(new EventoAlertaRegistrado(alertaId, tipo, detalle, unidadId));
    }

    // ---------------------------------------------------------------- tareas programadas

    public List<Long> asignacionesVencidas() {
        return jdbc.sql("""
                        SELECT id FROM asignacion
                        WHERE estado = 'PENDIENTE_RESPUESTA' AND vence_en < now()
                        ORDER BY vence_en LIMIT 50
                        """)
                .query(Long.class)
                .list();
    }

    /** Alertas sin unidad vigente, de la mas urgente a la menos urgente. */
    public List<Long> alertasPorAsignar() {
        return jdbc.sql("""
                        SELECT a.id
                        FROM alerta a JOIN tipo_alerta t ON t.id = a.tipo_alerta_id
                        WHERE a.estado IN ('CREADA', 'BUSCANDO_UNIDAD', 'SIN_UNIDAD')
                        ORDER BY t.prioridad, a.creada_en LIMIT 50
                        """)
                .query(Long.class)
                .list();
    }

    private static AsignacionResponse aAsignacion(ResultSet rs, int n) throws SQLException {
        return new AsignacionResponse(rs.getLong("id"), rs.getLong("alerta_id"), rs.getString("estado"),
                rs.getInt("orden"), rs.getObject("distancia_m", Integer.class),
                rs.getObject("eta_segundos", Integer.class),
                rs.getObject("vence_en", OffsetDateTime.class), (long) Math.ceil(rs.getDouble("restantes")),
                rs.getString("tipo"), rs.getString("tipo_nombre"), rs.getString("descripcion"),
                rs.getDouble("lat"), rs.getDouble("lon"), rs.getString("direccion_referencia"),
                rs.getString("alerta_estado"), rs.getObject("llegada_en", OffsetDateTime.class));
    }
}
