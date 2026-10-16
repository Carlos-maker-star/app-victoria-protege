package pe.gob.lavictoria.protege.parametro;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/** Lee los parametros configurables (tabla parametro). */
@Service
public class ParametroService {

    private final JdbcClient jdbc;

    public ParametroService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public int entero(String clave) {
        return Integer.parseInt(valor(clave));
    }

    public boolean booleano(String clave) {
        return Boolean.parseBoolean(valor(clave));
    }

    public String valor(String clave) {
        return jdbc.sql("SELECT valor FROM parametro WHERE clave = :clave")
                .param("clave", clave)
                .query(String.class)
                .optional()
                .orElseThrow(() -> new IllegalStateException("Falta el parametro: " + clave));
    }
}
