package pe.gob.lavictoria.protege.asignacion;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/** Alerta asignada a la unidad del sereno, con lo necesario para mostrarla y navegar. */
public record AsignacionResponse(
        @Schema(description = "Id de la asignación: es el {id} de aceptar, rechazar, llegada y finalizar", example = "88") Long id,
        @Schema(description = "Id de la alerta", example = "152") Long alertaId,
        @Schema(description = "PENDIENTE_RESPUESTA = hay que aceptar o rechazar antes de `venceEn`; ACEPTADA = en curso",
                allowableValues = {"PENDIENTE_RESPUESTA", "ACEPTADA"})
        String estado,
        @Schema(description = "1 = primera unidad asignada; 2 o más = la alerta ya se reasignó") int orden,
        @Schema(description = "Distancia en línea recta de tu unidad al incidente, en metros", nullable = true) Integer distanciaM,
        @Schema(description = "Tiempo estimado de llegada, en segundos", nullable = true) Integer etaSegundos,
        @Schema(description = "Momento en que se acaba el tiempo para responder") OffsetDateTime venceEn,
        @Schema(description = "Segundos que quedan para responder (usa esto para la cuenta regresiva)", example = "12") long segundosRestantes,
        @Schema(description = "Código del tipo de alerta", example = "ROBO") String tipo,
        @Schema(description = "Nombre del tipo para mostrar", example = "Robo") String tipoNombre,
        @Schema(nullable = true) String descripcion,
        @Schema(description = "Latitud del incidente (destino)") double latitud,
        @Schema(description = "Longitud del incidente (destino)") double longitud,
        @Schema(nullable = true) String referencia,
        @Schema(description = "Estado de la alerta: EN_CAMINO tras aceptar, LLEGO al llegar, EN_ATENCION al registrar la atención")
        String alertaEstado,
        @Schema(description = "Cuándo llegó la unidad (null si aún no)", nullable = true) OffsetDateTime llegadaEn) {
}
