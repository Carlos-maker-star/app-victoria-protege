package pe.gob.lavictoria.protege.admin;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.gob.lavictoria.protege.auditoria.AuditoriaService;
import pe.gob.lavictoria.protege.common.ApiException;

/** Parametros del motor (tiempos, radios, modo de asignacion). Solo ADMIN. */
@RestController
@RequestMapping("/api/admin/parametros")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Administración · parámetros", description = "Solo ADMIN.")
public class ParametroAdminController {

    public record ParametroResponse(String clave, String valor, String descripcion) {
    }

    public record CambioParametro(@NotBlank String valor) {
    }

    /** Rango permitido de cada parametro numerico: [minimo, maximo]. */
    private static final Map<String, int[]> NUMERICOS = Map.of(
            "tiempo_respuesta_segundos", new int[]{5, 120},
            "tolerancia_borde_metros", new int[]{0, 500},
            "max_reasignaciones", new int[]{0, 20},
            "radio_busqueda_metros", new int[]{100, 20000},
            "distancia_llegada_metros", new int[]{5, 500},
            "ubicacion_obsoleta_segundos", new int[]{10, 3600},
            "velocidad_promedio_kmh", new int[]{5, 120},
            "espera_maxima_segundos", new int[]{10, 3600});

    private static final String MODO_AUTOMATICO = "asignacion_automatica";

    private final JdbcClient jdbc;
    private final AuditoriaService auditoria;

    public ParametroAdminController(JdbcClient jdbc, AuditoriaService auditoria) {
        this.jdbc = jdbc;
        this.auditoria = auditoria;
    }

    @GetMapping
    public List<ParametroResponse> listar() {
        return jdbc.sql("SELECT clave, valor, descripcion FROM parametro ORDER BY clave")
                .query((rs, n) -> new ParametroResponse(rs.getString("clave"), rs.getString("valor"),
                        rs.getString("descripcion")))
                .list();
    }

    @PutMapping("/{clave}")
    @Transactional
    public ParametroResponse cambiar(@AuthenticationPrincipal Jwt jwt, @PathVariable String clave,
                                     @Valid @RequestBody CambioParametro req) {
        String valor = req.valor().trim();
        validar(clave, valor);
        String anterior = jdbc.sql("SELECT valor FROM parametro WHERE clave = :clave")
                .param("clave", clave).query(String.class).optional()
                .orElseThrow(() -> ApiException.noEncontrado("El parámetro no existe"));
        jdbc.sql("UPDATE parametro SET valor = :valor WHERE clave = :clave")
                .param("valor", valor).param("clave", clave).update();
        auditoria.registrar(Long.parseLong(jwt.getSubject()), "PARAMETRO_CAMBIADO", "parametro", null,
                clave + ": " + anterior + " -> " + valor);
        return jdbc.sql("SELECT clave, valor, descripcion FROM parametro WHERE clave = :clave")
                .param("clave", clave)
                .query((rs, n) -> new ParametroResponse(rs.getString("clave"), rs.getString("valor"),
                        rs.getString("descripcion")))
                .single();
    }

    private static void validar(String clave, String valor) {
        if (MODO_AUTOMATICO.equals(clave)) {
            if (!valor.equals("true") && !valor.equals("false")) {
                throw ApiException.solicitudInvalida("VALOR_INVALIDO", "Debe ser true o false");
            }
            return;
        }
        int[] rango = NUMERICOS.get(clave);
        if (rango == null) {
            throw ApiException.noEncontrado("El parámetro no existe");
        }
        int numero;
        try {
            numero = Integer.parseInt(valor);
        } catch (NumberFormatException e) {
            throw ApiException.solicitudInvalida("VALOR_INVALIDO", "Debe ser un número entero");
        }
        if (numero < rango[0] || numero > rango[1]) {
            throw ApiException.solicitudInvalida("VALOR_INVALIDO",
                    "Debe estar entre " + rango[0] + " y " + rango[1]);
        }
    }
}
