package pe.gob.lavictoria.protege.monitoreo;

import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Resumen de indicadores y zonas del mapa para la central (OPERADOR, SUPERVISOR, ADMIN). */
@RestController
@RequestMapping("/api/monitoreo")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Central · resumen y zonas", description = "Indicadores del día y polígonos del mapa.")
public class MonitoreoGeneralController {

    private final JdbcClient jdbc;

    public MonitoreoGeneralController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/resumen")
    public ResumenResponse resumen() {
        return jdbc.sql("""
                        SELECT
                          (SELECT count(*) FROM alerta WHERE estado NOT IN ('FINALIZADA', 'CANCELADA')) AS activas,
                          (SELECT count(*) FROM alerta WHERE estado = 'SIN_UNIDAD') AS sin_unidad,
                          (SELECT count(*) FROM unidad WHERE activo AND estado = 'DISPONIBLE') AS disponibles,
                          (SELECT count(*) FROM unidad WHERE activo AND estado = 'EN_DESPLAZAMIENTO') AS en_ruta,
                          (SELECT count(*) FROM unidad WHERE activo AND estado = 'EN_ATENCION') AS en_atencion,
                          (SELECT count(*) FROM unidad WHERE activo AND estado = 'FUERA_DE_SERVICIO') AS fuera,
                          (SELECT count(*) FROM unidad WHERE activo) AS total,
                          (SELECT count(*) FROM alerta
                            WHERE estado = 'FINALIZADA' AND finalizada_en >= date_trunc('day', now())) AS atendidas,
                          (SELECT count(DISTINCT alerta_id) FROM asignacion
                            WHERE orden > 1 AND asignada_en >= date_trunc('day', now())) AS reasignadas,
                          (SELECT avg(EXTRACT(EPOCH FROM (respondida_en - asignada_en))) FROM asignacion
                            WHERE estado IN ('ACEPTADA', 'COMPLETADA')
                              AND asignada_en >= date_trunc('day', now())) AS t_respuesta,
                          (SELECT avg(EXTRACT(EPOCH FROM (s.llegada_en - a.creada_en)))
                             FROM asignacion s JOIN alerta a ON a.id = s.alerta_id
                            WHERE s.llegada_en IS NOT NULL
                              AND s.llegada_en >= date_trunc('day', now())) AS t_llegada
                        """)
                .query((rs, n) -> new ResumenResponse(rs.getInt("activas"), rs.getInt("sin_unidad"),
                        rs.getInt("disponibles"), rs.getInt("en_ruta"), rs.getInt("en_atencion"),
                        rs.getInt("fuera"), rs.getInt("total"), rs.getInt("atendidas"), rs.getInt("reasignadas"),
                        segundos(rs.getBigDecimal("t_respuesta")), segundos(rs.getBigDecimal("t_llegada"))))
                .single();
    }

    @GetMapping("/zonas")
    public List<ZonaResponse> zonas() {
        return jdbc.sql("""
                        SELECT id, nombre, tipo, ST_AsGeoJSON(geom) AS geojson
                        FROM zona WHERE activo ORDER BY tipo, nombre
                        """)
                .query((rs, n) -> new ZonaResponse(rs.getLong("id"), rs.getString("nombre"),
                        rs.getString("tipo"), rs.getString("geojson")))
                .list();
    }

    private static Double segundos(java.math.BigDecimal valor) {
        return valor == null ? null : Math.round(valor.doubleValue() * 10) / 10.0;
    }
}
