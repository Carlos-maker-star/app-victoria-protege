package pe.gob.lavictoria.protege.asignacion;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/**
 * Estado de la unidad del sereno y su asignacion vigente (si la hay).
 * Es el mismo objeto que llega por WebSocket en /user/queue/estado.
 */
public record EstadoSerenoResponse(
        Long unidadId,
        @Schema(description = "Código de la unidad", example = "SV-001") String unidadCodigo,
        @Schema(description = "Estado de la unidad. DISPONIBLE = recibe alertas; EN_DESPLAZAMIENTO = va en camino; "
                + "EN_ATENCION = en el lugar u ocupada; FUERA_DE_SERVICIO = no recibe alertas",
                allowableValues = {"DISPONIBLE", "EN_DESPLAZAMIENTO", "EN_ATENCION", "FUERA_DE_SERVICIO"})
        String estado,
        @Schema(description = "Última latitud enviada", nullable = true) Double latitud,
        @Schema(description = "Última longitud enviada", nullable = true) Double longitud,
        @Schema(description = "Hora de la última posición", nullable = true) OffsetDateTime ubicacionEn,
        @Schema(description = "Alerta vigente: pendiente de responder o en curso. null si no tienes ninguna", nullable = true)
        AsignacionResponse asignacion) {
}
