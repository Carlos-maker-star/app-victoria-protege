package pe.gob.lavictoria.protege.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Genera alertas historicas de DEMOSTRACION para ver los reportes con varios dias de datos.
 * Solo perfil local y apagado por defecto. Para activarlo, una vez:
 *
 *   ./mvnw spring-boot:run "-Dspring-boot.run.arguments=--app.seed.historico=140"
 *
 * Crea esa cantidad de alertas finalizadas o canceladas repartidas en los ultimos 14 dias, con sus
 * asignaciones (algunas con rechazo o sin respuesta y reasignadas), tiempos realistas y linea de tiempo.
 * Las alertas se reconocen por su descripcion "Alerta de demostración". Para borrarlas ver CLAUDE.md.
 * No se ejecuta si ya existen datos de demostracion.
 */
@Component
@Profile("local")
@Order(10)
public class DatosHistoricos implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DatosHistoricos.class);
    static final String MARCA = "Alerta de demostración";

    private final JdbcClient jdbc;
    private final int cantidad;

    public DatosHistoricos(JdbcClient jdbc, @Value("${app.seed.historico:0}") int cantidad) {
        this.jdbc = jdbc;
        this.cantidad = cantidad;
    }

    @Override
    public void run(String... args) {
        if (cantidad <= 0) {
            return;
        }
        Integer existentes = jdbc.sql("SELECT count(*) FROM alerta WHERE descripcion = :marca")
                .param("marca", MARCA).query(Integer.class).single();
        if (existentes > 0) {
            log.info("Ya hay {} alertas de demostracion; no se generan mas", existentes);
            return;
        }
        jdbc.sql(SQL).param("n", cantidad).update();
        log.info("Se generaron {} alertas historicas de demostracion", cantidad);
    }

    /**
     * Una sola sentencia: genera los datos aleatorios una vez (MATERIALIZED) y los reparte entre
     * alerta, asignacion y alerta_evento, para que los tres sean coherentes entre si.
     * Horas (Lima): picos de 17 a 23 h y de 6 a 9 h. 88 % finalizadas, 12 % canceladas,
     * 17 % reasignadas (rechazo o sin respuesta), 4 % escaladas a la central.
     */
    private static final String SQL = """
            WITH hoy AS (SELECT (now() AT TIME ZONE 'America/Lima')::date AS d),
            ids AS (
                SELECT (SELECT id FROM usuario WHERE dni = '00000006') AS ciudadano,
                       (SELECT id FROM unidad WHERE codigo = 'SV-001') AS u1,
                       (SELECT id FROM unidad WHERE codigo = 'SV-002') AS u2),
            base AS MATERIALIZED (
                SELECT g AS i,
                       (SELECT d FROM hoy) - (1 + floor(random() * 14))::int AS dia,
                       random() AS r_hora, random() AS r_tipo, random() AS r_res, random() AS r_estado,
                       random() AS r_reas, random() AS r_motivo, random() AS r_esc, random() AS r_u,
                       (random() * 3599)::int AS seg
                FROM generate_series(1, :n) g),
            calc AS MATERIALIZED (
                SELECT b.i, b.r_u,
                       (b.dia + (CASE WHEN b.r_hora < 0.12 THEN 6 + floor(random() * 4)
                                      WHEN b.r_hora < 0.30 THEN 10 + floor(random() * 6)
                                      WHEN b.r_hora < 0.82 THEN 17 + floor(random() * 6)
                                      ELSE floor(random() * 6) END)::int * interval '1 hour'
                              + b.seg * interval '1 second')::timestamp AT TIME ZONE 'America/Lima' AS creada,
                       CASE WHEN b.r_tipo < 0.42 THEN 'ROBO' WHEN b.r_tipo < 0.64 THEN 'SOSPECHOSA'
                            WHEN b.r_tipo < 0.78 THEN 'DISTURBIOS' WHEN b.r_tipo < 0.88 THEN 'ACCIDENTE'
                            WHEN b.r_tipo < 0.93 THEN 'EMERGENCIA' WHEN b.r_tipo < 0.96 THEN 'INCENDIO'
                            ELSE 'OTRO' END AS tipo,
                       CASE WHEN b.r_res < 0.70 THEN 'ATENDIDA' WHEN b.r_res < 0.85 THEN 'SIN_NOVEDAD'
                            WHEN b.r_res < 0.93 THEN 'FALSA_ALARMA' WHEN b.r_res < 0.97 THEN 'DERIVADA'
                            ELSE 'REQUIERE_APOYO' END AS resultado,
                       (b.r_estado >= 0.88) AS cancelada,
                       (b.r_estado < 0.88 AND b.r_esc < 0.04) AS escalada,
                       (b.r_estado < 0.88 AND b.r_esc >= 0.04 AND b.r_reas < 0.17) AS reasignada,
                       (b.r_motivo > 0.65) AS sin_resp,
                       (1 + floor(b.r_motivo * 100)::int % 7)::smallint AS motivo_id,
                       CASE WHEN b.r_esc < 0.04 THEN 150 + floor(random() * 100) ELSE 1 + floor(random() * 8) END::int AS t_asig,
                       (2 + floor(random() * 12))::int AS t_resp,
                       (90 + floor(random() * 390))::int AS t_lleg,
                       (240 + floor(random() * 1260))::int AS t_aten,
                       (20 + floor(random() * 100))::int AS t_cancel
                FROM base b),
            tiempos AS MATERIALIZED (
                SELECT c.*,
                       c.creada + c.t_asig * interval '1 second' AS a1,
                       c.creada + c.t_asig * interval '1 second'
                           + (CASE WHEN c.sin_resp THEN 15 ELSE 3 + floor(random() * 7)::int END) * interval '1 second' AS r1
                FROM calc c),
            t2 AS MATERIALIZED (
                SELECT t.*,
                       t.r1 + interval '1 second' AS a2,
                       (CASE WHEN t.reasignada THEN t.r1 + interval '1 second' ELSE t.a1 END)
                           + t.t_resp * interval '1 second' AS rr
                FROM tiempos t),
            t3 AS MATERIALIZED (
                SELECT t.*, t.rr + t.t_lleg * interval '1 second' AS ll,
                       t.rr + t.t_lleg * interval '1 second' + t.t_aten * interval '1 second' AS fin,
                       t.a1 + t.t_cancel * interval '1 second' AS cancel_fin
                FROM t2 t),
            ins AS (
                INSERT INTO alerta (ciudadano_id, tipo_alerta_id, descripcion, ubicacion, direccion_referencia,
                                    estado, resultado, creada_en, finalizada_en)
                SELECT ids.ciudadano, ta.id, 'Alerta de demostración', pt.p, 'Demo ' || t.i,
                       CASE WHEN t.cancelada THEN 'CANCELADA' ELSE 'FINALIZADA' END,
                       CASE WHEN t.cancelada THEN NULL ELSE t.resultado END,
                       t.creada,
                       CASE WHEN t.cancelada THEN t.cancel_fin ELSE t.fin END
                FROM t3 t
                CROSS JOIN ids
                JOIN tipo_alerta ta ON ta.codigo = t.tipo
                CROSS JOIN LATERAL (
                    SELECT ST_SetSRID(ST_GeometryN(ST_GeneratePoints(z.geom, 1 + t.i * 0), 1), 4326) AS p
                    FROM zona z WHERE z.tipo = 'DISTRITO' LIMIT 1) pt
                RETURNING id, direccion_referencia),
            m AS (
                SELECT ins.id AS alerta_id, t.*,
                       CASE WHEN t.r_u < 0.5 THEN ids.u1 ELSE ids.u2 END AS ua,
                       CASE WHEN t.r_u < 0.5 THEN ids.u2 ELSE ids.u1 END AS ub
                FROM ins JOIN t3 t ON 'Demo ' || t.i = ins.direccion_referencia CROSS JOIN ids),
            asg1 AS (
                INSERT INTO asignacion (alerta_id, unidad_id, orden, estado, motivo_rechazo_id, distancia_m, eta_segundos,
                                        asignada_en, vence_en, respondida_en, llegada_en, finalizada_en)
                SELECT m.alerta_id, m.ua, 1,
                       CASE WHEN m.cancelada THEN 'CANCELADA'
                            WHEN m.reasignada THEN CASE WHEN m.sin_resp THEN 'SIN_RESPUESTA' ELSE 'RECHAZADA' END
                            ELSE 'COMPLETADA' END,
                       CASE WHEN m.reasignada AND NOT m.sin_resp THEN m.motivo_id END,
                       (200 + floor(random() * 2500))::int, (100 + floor(random() * 400))::int,
                       m.a1, m.a1 + interval '15 seconds',
                       CASE WHEN m.cancelada THEN NULL WHEN m.reasignada THEN m.r1 ELSE m.rr END,
                       CASE WHEN m.cancelada OR m.reasignada THEN NULL ELSE m.ll END,
                       CASE WHEN m.cancelada THEN m.cancel_fin WHEN m.reasignada THEN m.r1 ELSE m.fin END
                FROM m),
            asg2 AS (
                INSERT INTO asignacion (alerta_id, unidad_id, orden, estado, distancia_m, eta_segundos,
                                        asignada_en, vence_en, respondida_en, llegada_en, finalizada_en)
                SELECT m.alerta_id, m.ub, 2, 'COMPLETADA',
                       (200 + floor(random() * 2500))::int, (100 + floor(random() * 400))::int,
                       m.a2, m.a2 + interval '15 seconds', m.rr, m.ll, m.fin
                FROM m WHERE m.reasignada)
            INSERT INTO alerta_evento (alerta_id, tipo, detalle, unidad_id, creado_en)
            SELECT e.alerta_id, e.tipo, e.detalle, e.unidad_id, e.en FROM (
                SELECT m.alerta_id, 'ALERTA_CREADA' AS tipo, 'Alerta creada por el ciudadano' AS detalle, NULL::bigint AS unidad_id, m.creada AS en FROM m
                UNION ALL
                SELECT m.alerta_id, 'ESCALADA_A_CENTRAL', 'No hubo unidades disponibles en el tiempo maximo de espera', NULL, m.creada + interval '120 seconds'
                  FROM m WHERE m.escalada
                UNION ALL
                SELECT m.alerta_id, 'UNIDAD_ASIGNADA', 'Asignada automaticamente (datos de demostracion)', m.ua, m.a1 FROM m
                UNION ALL
                SELECT m.alerta_id, CASE WHEN m.sin_resp THEN 'SIN_RESPUESTA' ELSE 'ALERTA_RECHAZADA' END,
                       CASE WHEN m.sin_resp THEN 'La unidad no respondio en el tiempo limite' ELSE 'La unidad no pudo atender' END, m.ua, m.r1
                  FROM m WHERE m.reasignada
                UNION ALL
                SELECT m.alerta_id, 'UNIDAD_ASIGNADA', 'Reasignada (datos de demostracion)', m.ub, m.a2 FROM m WHERE m.reasignada
                UNION ALL
                SELECT m.alerta_id, 'ALERTA_ACEPTADA', 'La unidad acepto la alerta', CASE WHEN m.reasignada THEN m.ub ELSE m.ua END, m.rr
                  FROM m WHERE NOT m.cancelada
                UNION ALL
                SELECT m.alerta_id, 'RUTA_INICIADA', 'La unidad se dirige al lugar', CASE WHEN m.reasignada THEN m.ub ELSE m.ua END, m.rr
                  FROM m WHERE NOT m.cancelada
                UNION ALL
                SELECT m.alerta_id, 'UNIDAD_LLEGO', 'Llegada detectada por GPS', CASE WHEN m.reasignada THEN m.ub ELSE m.ua END, m.ll
                  FROM m WHERE NOT m.cancelada
                UNION ALL
                SELECT m.alerta_id, 'ATENCION_FINALIZADA', 'Resultado: ' || m.resultado, CASE WHEN m.reasignada THEN m.ub ELSE m.ua END, m.fin
                  FROM m WHERE NOT m.cancelada
                UNION ALL
                SELECT m.alerta_id, 'ALERTA_CANCELADA', 'Cancelada (datos de demostracion)', NULL, m.cancel_fin
                  FROM m WHERE m.cancelada
            ) e
            """;
}
