package pe.gob.lavictoria.protege.alerta;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/**
 * Seguimiento para el ciudadano. La unidad solo aparece cuando un sereno acepto la alerta.
 * Es el mismo objeto que llega por WebSocket en /user/queue/seguimiento.
 */
public record SeguimientoResponse(
        Long alertaId,
        @Schema(description = "Estado simplificado para la pantalla del ciudadano",
                allowableValues = {"ASIGNANDO_UNIDAD", "UNIDAD_ASIGNADA", "UNIDAD_EN_CAMINO", "UNIDAD_LLEGO",
                        "ATENCION_EN_PROCESO", "ALERTA_ATENDIDA", "CANCELADA"})
        String estado,
        @Schema(description = "Código de la unidad que atiende (solo tras aceptar)", example = "SV-001", nullable = true)
        String unidadCodigo,
        @Schema(description = "Latitud actual de la unidad (solo tras aceptar)", nullable = true) Double unidadLatitud,
        @Schema(description = "Longitud actual de la unidad (solo tras aceptar)", nullable = true) Double unidadLongitud,
        @Schema(description = "Hora de la última posición de la unidad", nullable = true) OffsetDateTime ubicacionEn,
        @Schema(description = "Distancia en línea recta de la unidad al incidente, en metros", example = "1200", nullable = true)
        Integer distanciaM,
        @Schema(description = "Tiempo estimado de llegada en segundos (distancia / velocidad promedio)", example = "260", nullable = true)
        Integer etaSegundos) {
}
