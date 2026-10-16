package pe.gob.lavictoria.protege.alerta;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/** Vista del ciudadano: sin informacion operativa. */
public record AlertaResponse(
        @Schema(description = "Identificador de la alerta", example = "152") Long id,
        @Schema(description = "Código del tipo", example = "ROBO") String tipo,
        @Schema(description = "Nombre del tipo para mostrar", example = "Robo") String tipoNombre,
        @Schema(nullable = true) String descripcion,
        @Schema(description = "Latitud del incidente") double latitud,
        @Schema(description = "Longitud del incidente") double longitud,
        @Schema(nullable = true) String referencia,
        @Schema(description = """
                Estado interno. Para la pantalla del ciudadano usa mejor `GET …/seguimiento`, que ya lo simplifica.""",
                allowableValues = {"CREADA", "BUSCANDO_UNIDAD", "ASIGNADA", "ACEPTADA", "EN_CAMINO", "LLEGO",
                        "EN_ATENCION", "FINALIZADA", "SIN_UNIDAD", "CANCELADA"})
        String estado,
        @Schema(description = "Resultado final (solo si la alerta terminó)", nullable = true,
                allowableValues = {"ATENDIDA", "SIN_NOVEDAD", "FALSA_ALARMA", "DERIVADA", "REQUIERE_APOYO", "PENDIENTE", "OTRO"})
        String resultado,
        @Schema(description = "Fecha y hora de creación (ISO 8601, UTC)") OffsetDateTime creadaEn,
        @Schema(description = "Fecha y hora de cierre (null si sigue activa)", nullable = true) OffsetDateTime finalizadaEn) {
}
