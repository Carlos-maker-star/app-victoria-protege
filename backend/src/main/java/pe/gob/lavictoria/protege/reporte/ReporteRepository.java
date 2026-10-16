package pe.gob.lavictoria.protege.reporte;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import pe.gob.lavictoria.protege.reporte.ReporteResponse.ActividadUnidad;
import pe.gob.lavictoria.protege.reporte.ReporteResponse.Conteo;
import pe.gob.lavictoria.protege.reporte.ReporteResponse.Indicadores;
import pe.gob.lavictoria.protege.reporte.ReporteResponse.PuntoDia;
import pe.gob.lavictoria.protege.reporte.ReporteResponse.PuntoHora;

/**
 * Consultas agregadas. El rango es [desde 00:00, hasta + 1 dia 00:00) en hora de Lima (UTC-5, sin horario de
 * verano), para que "hoy" y las barras por hora coincidan con lo que ve el operador.
 */
@Repository
public class ReporteRepository {

    /** Alertas creadas dentro del rango. Se reutiliza como fragmento de las demas consultas. */
    private static final String RANGO_ALERTAS = """
            a.creada_en >= (CAST(:desde AS date)::timestamp AT TIME ZONE 'America/Lima')
            AND a.creada_en < ((CAST(:hasta AS date) + 1)::timestamp AT TIME ZONE 'America/Lima')
            """;

    private final JdbcClient jdbc;

    public ReporteRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Indicadores indicadores(LocalDate desde, LocalDate hasta) {
        return jdbc.sql("""
                        WITH al AS (SELECT a.* FROM alerta a WHERE %s),
                        primera AS (
                            SELECT DISTINCT ON (s.alerta_id) s.alerta_id, s.asignada_en
                            FROM asignacion s JOIN al ON al.id = s.alerta_id
                            ORDER BY s.alerta_id, s.orden),
                        aceptada AS (
                            SELECT DISTINCT ON (s.alerta_id) s.alerta_id, s.respondida_en
                            FROM asignacion s JOIN al ON al.id = s.alerta_id
                            WHERE s.estado IN ('ACEPTADA', 'COMPLETADA')
                            ORDER BY s.alerta_id, s.orden DESC),
                        llegada AS (
                            SELECT s.alerta_id, min(s.llegada_en) AS en
                            FROM asignacion s JOIN al ON al.id = s.alerta_id
                            WHERE s.llegada_en IS NOT NULL
                            GROUP BY s.alerta_id)
                        SELECT count(*) AS total,
                               count(*) FILTER (WHERE al.estado = 'FINALIZADA') AS atendidas,
                               count(*) FILTER (WHERE al.estado = 'CANCELADA') AS canceladas,
                               count(*) FILTER (WHERE al.estado NOT IN ('FINALIZADA', 'CANCELADA')) AS activas,
                               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM alerta_evento e
                                                              WHERE e.alerta_id = al.id AND e.tipo = 'ESCALADA_A_CENTRAL')) AS escaladas,
                               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM asignacion s
                                                              WHERE s.alerta_id = al.id AND s.orden > 1)) AS reasignadas,
                               avg(EXTRACT(EPOCH FROM (primera.asignada_en - al.creada_en))) AS t_asignacion,
                               avg(EXTRACT(EPOCH FROM (aceptada.respondida_en - primera.asignada_en))) AS t_aceptacion,
                               avg(EXTRACT(EPOCH FROM (llegada.en - al.creada_en))) AS t_llegada,
                               avg(EXTRACT(EPOCH FROM (al.finalizada_en - llegada.en)))
                                   FILTER (WHERE al.estado = 'FINALIZADA') AS t_atencion
                        FROM al
                        LEFT JOIN primera ON primera.alerta_id = al.id
                        LEFT JOIN aceptada ON aceptada.alerta_id = al.id
                        LEFT JOIN llegada ON llegada.alerta_id = al.id
                        """.formatted(RANGO_ALERTAS))
                .param("desde", desde)
                .param("hasta", hasta)
                .query((rs, n) -> new Indicadores(rs.getInt("total"), rs.getInt("atendidas"), rs.getInt("canceladas"),
                        rs.getInt("activas"), rs.getInt("escaladas"), rs.getInt("reasignadas"),
                        seg(rs.getBigDecimal("t_asignacion")), seg(rs.getBigDecimal("t_aceptacion")),
                        seg(rs.getBigDecimal("t_llegada")), seg(rs.getBigDecimal("t_atencion"))))
                .single();
    }

    /** Un punto por cada dia del rango (los dias sin alertas salen con 0). */
    public List<PuntoDia> porDia(LocalDate desde, LocalDate hasta) {
        return jdbc.sql("""
                        SELECT d::date AS dia, count(a.id) AS total,
                               avg(EXTRACT(EPOCH FROM (ll.en - a.creada_en))) AS t_llegada
                        FROM generate_series(CAST(:desde AS timestamp), CAST(:hasta AS timestamp), interval '1 day') d
                        LEFT JOIN alerta a ON (a.creada_en AT TIME ZONE 'America/Lima')::date = d::date
                        LEFT JOIN LATERAL (SELECT min(s.llegada_en) AS en FROM asignacion s
                                            WHERE s.alerta_id = a.id) ll ON TRUE
                        GROUP BY d ORDER BY d
                        """)
                .param("desde", desde)
                .param("hasta", hasta)
                .query((rs, n) -> new PuntoDia(rs.getObject("dia", LocalDate.class), rs.getInt("total"),
                        seg(rs.getBigDecimal("t_llegada"))))
                .list();
    }

    /** Las 24 horas del dia (hora de Lima), sumando todos los dias del rango. */
    public List<PuntoHora> porHora(LocalDate desde, LocalDate hasta) {
        return jdbc.sql("""
                        SELECT h, count(a.id) AS total
                        FROM generate_series(0, 23) h
                        LEFT JOIN alerta a ON EXTRACT(HOUR FROM a.creada_en AT TIME ZONE 'America/Lima') = h
                                          AND %s
                        GROUP BY h ORDER BY h
                        """.formatted(RANGO_ALERTAS))
                .param("desde", desde)
                .param("hasta", hasta)
                .query((rs, n) -> new PuntoHora(rs.getInt("h"), rs.getInt("total")))
                .list();
    }

    public List<Conteo> porTipo(LocalDate desde, LocalDate hasta) {
        return jdbc.sql("""
                        SELECT t.codigo, t.nombre, count(a.id) AS total
                        FROM tipo_alerta t
                        JOIN alerta a ON a.tipo_alerta_id = t.id AND %s
                        GROUP BY t.id ORDER BY total DESC, t.nombre
                        """.formatted(RANGO_ALERTAS))
                .param("desde", desde)
                .param("hasta", hasta)
                .query(ReporteRepository::conteo)
                .list();
    }

    /** Por sector. Las alertas sin sector (por ejemplo, si aun no se definieron sectores) salen juntas. */
    public List<Conteo> porZona(LocalDate desde, LocalDate hasta) {
        return jdbc.sql("""
                        SELECT COALESCE(z.id::text, 'SIN_SECTOR') AS codigo,
                               COALESCE(z.nombre, 'Sin sector asignado') AS nombre, count(a.id) AS total
                        FROM alerta a
                        LEFT JOIN zona z ON z.id = a.zona_id AND z.tipo = 'SECTOR'
                        WHERE %s
                        GROUP BY z.id, z.nombre ORDER BY total DESC, nombre
                        """.formatted(RANGO_ALERTAS))
                .param("desde", desde)
                .param("hasta", hasta)
                .query(ReporteRepository::conteo)
                .list();
    }

    /** Por que una alerta tuvo que reasignarse: rechazos con su motivo y falta de respuesta. */
    public List<Conteo> motivosReasignacion(LocalDate desde, LocalDate hasta) {
        return jdbc.sql("""
                        SELECT COALESCE(m.codigo, 'SIN_RESPUESTA') AS codigo,
                               COALESCE(m.nombre, 'Sin respuesta en el tiempo límite') AS nombre, count(*) AS total
                        FROM asignacion s
                        JOIN alerta a ON a.id = s.alerta_id
                        LEFT JOIN motivo_rechazo m ON m.id = s.motivo_rechazo_id
                        WHERE s.estado IN ('RECHAZADA', 'SIN_RESPUESTA') AND %s
                        GROUP BY m.codigo, m.nombre ORDER BY total DESC, nombre
                        """.formatted(RANGO_ALERTAS))
                .param("desde", desde)
                .param("hasta", hasta)
                .query(ReporteRepository::conteo)
                .list();
    }

    /** Desempeño de cada unidad sobre las alertas del rango. tiempoTraslado = desde que acepta hasta que llega. */
    public List<ActividadUnidad> unidades(LocalDate desde, LocalDate hasta) {
        return jdbc.sql("""
                        SELECT u.codigo, p.nombres || ' ' || p.apellidos AS sereno,
                               count(s.id) AS asignaciones,
                               count(s.id) FILTER (WHERE s.estado = 'COMPLETADA') AS atendidas,
                               count(s.id) FILTER (WHERE s.estado = 'RECHAZADA') AS rechazadas,
                               count(s.id) FILTER (WHERE s.estado = 'SIN_RESPUESTA') AS sin_respuesta,
                               avg(EXTRACT(EPOCH FROM (s.llegada_en - s.respondida_en))) AS t_traslado
                        FROM unidad u
                        LEFT JOIN sereno sr ON sr.unidad_id = u.id AND sr.activo
                        LEFT JOIN usuario p ON p.id = sr.usuario_id
                        LEFT JOIN (SELECT s2.* FROM asignacion s2 JOIN alerta a ON a.id = s2.alerta_id
                                    WHERE %s) s ON s.unidad_id = u.id
                        WHERE u.activo
                        GROUP BY u.id, p.nombres, p.apellidos ORDER BY u.codigo
                        """.formatted(RANGO_ALERTAS))
                .param("desde", desde)
                .param("hasta", hasta)
                .query((rs, n) -> new ActividadUnidad(rs.getString("codigo"), rs.getString("sereno"),
                        rs.getInt("asignaciones"), rs.getInt("atendidas"), rs.getInt("rechazadas"),
                        rs.getInt("sin_respuesta"), seg(rs.getBigDecimal("t_traslado"))))
                .list();
    }

    private static Conteo conteo(ResultSet rs, int n) throws SQLException {
        return new Conteo(rs.getString("codigo"), rs.getString("nombre"), rs.getInt("total"));
    }

    /** Segundos con un decimal; null si no hubo datos. */
    private static Double seg(BigDecimal valor) {
        return valor == null ? null : Math.round(valor.doubleValue() * 10) / 10.0;
    }
}
