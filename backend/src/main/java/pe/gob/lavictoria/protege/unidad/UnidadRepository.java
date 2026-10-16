package pe.gob.lavictoria.protege.unidad;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UnidadRepository {

    private static final String SELECT = """
            SELECT u.id, u.codigo, u.placa, u.tipo, u.estado,
                   p.nombres || ' ' || p.apellidos AS sereno,
                   ST_Y(u.ubicacion) AS lat, ST_X(u.ubicacion) AS lon,
                   u.ubicacion_en, u.velocidad_kmh, s.alerta_id, u.activo
            FROM unidad u
            LEFT JOIN sereno sr ON sr.unidad_id = u.id AND sr.activo
            LEFT JOIN usuario p ON p.id = sr.usuario_id
            LEFT JOIN asignacion s ON s.unidad_id = u.id
                                  AND s.estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA')
            """;

    private final JdbcClient jdbc;

    public UnidadRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<UnidadMonitoreoResponse> listar(String estado) {
        return jdbc.sql(SELECT + """
                         WHERE u.activo AND (CAST(:estado AS varchar) IS NULL OR u.estado = :estado)
                         ORDER BY u.codigo
                        """)
                .param("estado", estado == null || estado.isBlank() ? null : estado.toUpperCase(), Types.VARCHAR)
                .query(UnidadRepository::mapear)
                .list();
    }

    public Optional<UnidadMonitoreoResponse> buscar(long id) {
        return jdbc.sql(SELECT + " WHERE u.id = :id")
                .param("id", id)
                .query(UnidadRepository::mapear)
                .optional();
    }

    private static UnidadMonitoreoResponse mapear(ResultSet rs, int n) throws SQLException {
        var velocidad = rs.getBigDecimal("velocidad_kmh");
        return new UnidadMonitoreoResponse(rs.getLong("id"), rs.getString("codigo"), rs.getString("placa"),
                rs.getString("tipo"), rs.getString("estado"), rs.getString("sereno"),
                rs.getObject("lat", Double.class), rs.getObject("lon", Double.class),
                rs.getObject("ubicacion_en", OffsetDateTime.class),
                velocidad == null ? null : velocidad.doubleValue(), rs.getObject("alerta_id", Long.class),
                rs.getBoolean("activo"));
    }
}
