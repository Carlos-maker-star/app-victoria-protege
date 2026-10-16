package pe.gob.lavictoria.protege.auditoria;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Registra en la tabla auditoria quien hizo que y desde donde. Se llama dentro de la misma transaccion
 * de la accion auditada: si la accion se revierte, el registro tambien.
 */
@Service
public class AuditoriaService {

    private final JdbcClient jdbc;

    public AuditoriaService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** usuarioId null = accion del sistema. */
    public void registrar(Long usuarioId, String accion, String entidad, Long entidadId, String detalle) {
        String ip = null;
        String dispositivo = null;
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes atributos) {
            HttpServletRequest req = atributos.getRequest();
            ip = req.getRemoteAddr();
            dispositivo = recortar(req.getHeader("User-Agent"), 150);
        }
        jdbc.sql("""
                        INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, ip, dispositivo)
                        VALUES (:usuario, :accion, :entidad, :entidadId, :detalle, :ip, :dispositivo)
                        """)
                .param("usuario", usuarioId, java.sql.Types.BIGINT)
                .param("accion", accion)
                .param("entidad", entidad, java.sql.Types.VARCHAR)
                .param("entidadId", entidadId, java.sql.Types.BIGINT)
                .param("detalle", recortar(detalle, 500), java.sql.Types.VARCHAR)
                .param("ip", ip, java.sql.Types.VARCHAR)
                .param("dispositivo", dispositivo, java.sql.Types.VARCHAR)
                .update();
    }

    private static String recortar(String texto, int max) {
        return texto == null || texto.length() <= max ? texto : texto.substring(0, max);
    }
}
