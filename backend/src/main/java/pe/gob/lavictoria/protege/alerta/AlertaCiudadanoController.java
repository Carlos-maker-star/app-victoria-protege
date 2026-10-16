package pe.gob.lavictoria.protege.alerta;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ciudadano/alertas")
@Tag(name = "Ciudadano · alertas", description = "Lo que hace la app del vecino. Rol requerido: `CIUDADANO`.")
public class AlertaCiudadanoController {

    private final AlertaService alertas;

    public AlertaCiudadanoController(AlertaService alertas) {
        this.alertas = alertas;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Reportar una alerta",
            description = """
                    Crea la alerta y el sistema empieza a buscar una unidad **de inmediato**; la respuesta ya puede
                    traer el estado `ASIGNADA`. Para saber qué pasa después usa `GET …/{id}/seguimiento` o el WebSocket
                    `/user/queue/seguimiento`.

                    `tipo` es uno de: `ROBO`, `INCENDIO`, `ACCIDENTE`, `DISTURBIOS`, `SOSPECHOSA`, `EMERGENCIA`,
                    `DESASTRE`, `OTRO`. `latitud`/`longitud` es el punto **del incidente** (el que el vecino confirma en el
                    mapa); `latitudCiudadano`/`longitudCiudadano` es su GPS (opcional).

                    Errores: `422 FUERA_DE_COBERTURA` (el punto está fuera del distrito de La Victoria, con 50 m de
                    tolerancia; muestra `mensaje`, que sugiere llamar a la PNP 105), `422 TIPO_ALERTA_INVALIDO`,
                    `409 ALERTA_ACTIVA_EXISTENTE` (solo se permite una alerta activa por ciudadano), `400 VALIDACION`.""")
    public AlertaResponse crear(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CrearAlertaRequest req) {
        return alertas.crear(usuarioId(jwt), req);
    }

    @GetMapping
    @Operation(summary = "Mi historial de alertas", description = "Las últimas 100 alertas del ciudadano, la más reciente primero.")
    public List<AlertaResponse> historial(@AuthenticationPrincipal Jwt jwt) {
        return alertas.listarDelCiudadano(usuarioId(jwt));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Detalle de una alerta mía", description = "Error: `404 NO_ENCONTRADO` si no existe o no es del ciudadano.")
    public AlertaResponse obtener(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
        return alertas.obtenerDelCiudadano(id, usuarioId(jwt));
    }

    @GetMapping("/{id}/seguimiento")
    @Operation(summary = "Seguimiento de la alerta (pantalla de espera)",
            description = """
                    Lo que debe mostrar la pantalla del ciudadano. `estado` ya está simplificado: las reasignaciones y
                    los rechazos de las unidades **no se ven**; el ciudadano solo ve `ASIGNANDO_UNIDAD` hasta que un
                    sereno acepta.

                    | estado | Qué mostrar |
                    |---|---|
                    | `ASIGNANDO_UNIDAD` | «Asignando unidad a tu alerta» |
                    | `UNIDAD_ASIGNADA` | «Unidad asignada» (dura un instante) |
                    | `UNIDAD_EN_CAMINO` | «La unidad está en camino» + mapa con `unidadLatitud/Longitud`, `distanciaM` y `etaSegundos` |
                    | `UNIDAD_LLEGO` | «La unidad llegó» |
                    | `ATENCION_EN_PROCESO` | «Atención en proceso» |
                    | `ALERTA_ATENDIDA` | «Alerta atendida» |
                    | `CANCELADA` | La alerta se canceló |

                    Cuándo consultarlo: al abrir la pantalla y, mientras haya conexión, escucha el WebSocket
                    `/user/queue/seguimiento` (llega este mismo objeto). Si no hay WebSocket, consulta cada 3–5 s.
                    La unidad (`unidadCodigo` y posición) solo aparece cuando un sereno ya aceptó.""")
    public SeguimientoResponse seguimiento(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
        return alertas.seguimiento(id, usuarioId(jwt));
    }

    @PostMapping("/{id}/cancelar")
    @Operation(summary = "Cancelar mi alerta",
            description = "Solo mientras la unidad no haya llegado. Libera la unidad. Error: `409 CONFLICTO` si ya no se puede cancelar.")
    public AlertaResponse cancelar(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
        return alertas.cancelar(id, usuarioId(jwt));
    }

    private static long usuarioId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
