package pe.gob.lavictoria.protege.asignacion;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** API del aplicativo del sereno. Cada accion devuelve el estado actualizado de la unidad. */
@RestController
@RequestMapping("/api/sereno")
@Tag(name = "Sereno", description = """
        Lo que hace la app del sereno. Rol requerido: `SERENO`. **Todas las acciones devuelven el mismo objeto**
        (`EstadoSerenoResponse`: la unidad y su asignación vigente), así la app siempre se actualiza con la respuesta.

        Un sereno opera la unidad que le asignó el administrador. Si no tiene unidad: `409 SIN_UNIDAD_ASIGNADA`.

        **Ciclo de una alerta:** (1) llega una asignación `PENDIENTE_RESPUESTA` con un temporizador
        (`segundosRestantes`, 15 s por defecto) → (2) `aceptar` o `rechazar` (si no responde, el sistema la reasigna y deja
        la unidad fuera de servicio) → (3) en camino: enviar la posición cada 1–3 s; la llegada se detecta sola por GPS
        (también se puede marcar con `llegada`) → (4) `iniciar-atencion` (opcional) → (5) `finalizar` con el resultado →
        (6) «continuar operando» = `POST /estado` con `DISPONIBLE`, o «finalizar sesión» = `FUERA_DE_SERVICIO`.

        Errores comunes de las acciones sobre una asignación: `409 ASIGNACION_NO_VIGENTE` (ya fue reasignada, cancelada
        o ya respondiste) y `409 ASIGNACION_VENCIDA` (se acabó el tiempo; al aceptar). Ante cualquiera, vuelve a leer
        el estado.""")
public class SerenoController {

    private final AsignacionService servicio;

    public SerenoController(AsignacionService servicio) {
        this.servicio = servicio;
    }

    @GetMapping("/estado")
    @Operation(summary = "Estado de mi unidad", description = "Estado actual y asignación vigente (si la hay). Úsalo al abrir la app.")
    public EstadoSerenoResponse estado(@AuthenticationPrincipal Jwt jwt) {
        return servicio.estado(id(jwt));
    }

    @PostMapping("/estado")
    @Operation(summary = "Cambiar mi estado (continuar operando / finalizar sesión)",
            description = """
                    Solo `DISPONIBLE` (empieza o continúa operando) o `FUERA_DE_SERVICIO` (finaliza la sesión). Los demás
                    estados (`EN_DESPLAZAMIENTO`, `EN_ATENCION`) los pone el sistema según la alerta.
                    Errores: `422 ESTADO_INVALIDO`; `409` si tienes una alerta en curso.""")
    public EstadoSerenoResponse cambiarEstado(@AuthenticationPrincipal Jwt jwt,
                                              @Valid @RequestBody SerenoRequests.CambiarEstado req) {
        return servicio.cambiarEstado(id(jwt), req.estado());
    }

    /** El movil la envia cada pocos segundos; la respuesta incluye la asignacion vigente (sondeo). */
    @PostMapping("/posicion")
    @Operation(summary = "Enviar mi posición GPS",
            description = """
                    Envíala **cada 1–3 s** mientras la app esté abierta y operando: la central la dibuja en el mapa y el
                    motor solo considera unidades con posición de los últimos 2 minutos. La respuesta incluye la
                    asignación vigente, así que sirve también para **detectar una alerta nueva** si no hay WebSocket.
                    Si vas en camino y llegas a menos de 30 m de la alerta, el sistema marca la llegada solo.
                    `velocidadKmh` es opcional.""")
    public EstadoSerenoResponse posicion(@AuthenticationPrincipal Jwt jwt,
                                         @Valid @RequestBody SerenoRequests.Posicion req) {
        return servicio.actualizarPosicion(id(jwt), req);
    }

    @PostMapping("/asignaciones/{id}/aceptar")
    @Operation(summary = "ACEPTAR ALERTA", description = "La unidad pasa a `EN_DESPLAZAMIENTO` y la alerta a `EN_CAMINO`. Errores: `409 ASIGNACION_VENCIDA`, `409 ASIGNACION_NO_VIGENTE`.")
    public EstadoSerenoResponse aceptar(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
        return servicio.aceptar(id(jwt), id);
    }

    @PostMapping("/asignaciones/{id}/rechazar")
    @Operation(summary = "NO PUEDO ATENDER",
            description = """
                    Rechaza con un motivo; el sistema **reasigna al instante** a otra unidad (la alerta no se pierde).
                    `motivo`: `OTRA_INCIDENCIA`, `EMERGENCIA`, `UNIDAD_OCUPADA`, `FUERA_DE_SERVICIO`,
                    `SIN_DESPLAZAMIENTO`, `SIN_DISPONIBILIDAD` u `OTRO` (este exige `detalle`).
                    Según el motivo, tu unidad queda `EN_ATENCION` (ocupada) o `FUERA_DE_SERVICIO`; cuando puedas volver,
                    usa `POST /estado` con `DISPONIBLE`.
                    Errores: `422 MOTIVO_INVALIDO`, `422 DETALLE_REQUERIDO`, `409 ASIGNACION_NO_VIGENTE`.""")
    public EstadoSerenoResponse rechazar(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                         @Valid @RequestBody SerenoRequests.Rechazo req) {
        return servicio.rechazar(id(jwt), id, req);
    }

    @PostMapping("/asignaciones/{id}/llegada")
    @Operation(summary = "HAS LLEGADO A LA ALERTA (manual)", description = "Normalmente la llegada se detecta sola por GPS; esto es un respaldo (por ejemplo, GPS impreciso). Unidad `EN_ATENCION`, alerta `LLEGO`.")
    public EstadoSerenoResponse llegada(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
        return servicio.registrarLlegada(id(jwt), id);
    }

    @PostMapping("/asignaciones/{id}/iniciar-atencion")
    @Operation(summary = "REGISTRAR ATENCIÓN", description = "Marca «atención en proceso» (el ciudadano lo ve). Opcional: se puede finalizar directamente.")
    public EstadoSerenoResponse iniciarAtencion(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
        return servicio.iniciarAtencion(id(jwt), id);
    }

    @PostMapping("/asignaciones/{id}/finalizar")
    @Operation(summary = "FINALIZAR ATENCIÓN",
            description = """
                    Cierra la alerta con un `resultado`: `ATENDIDA`, `SIN_NOVEDAD`, `FALSA_ALARMA`, `DERIVADA`,
                    `REQUIERE_APOYO`, `PENDIENTE` u `OTRO`, y una `observacion` opcional. La unidad queda `EN_ATENCION` hasta
                    que el sereno elija «continuar operando» (`POST /estado` con `DISPONIBLE`) o «finalizar sesión».
                    Error: `422 RESULTADO_INVALIDO`. (Las evidencias —fotos y videos— aún no están disponibles.)""")
    public EstadoSerenoResponse finalizar(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                          @Valid @RequestBody SerenoRequests.Finalizacion req) {
        return servicio.finalizar(id(jwt), id, req);
    }

    private static long id(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
