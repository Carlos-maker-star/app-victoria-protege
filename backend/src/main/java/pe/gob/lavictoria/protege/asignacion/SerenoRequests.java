package pe.gob.lavictoria.protege.asignacion;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public final class SerenoRequests {

    private SerenoRequests() {
    }

    /** DISPONIBLE (continuar operando) o FUERA_DE_SERVICIO (finalizar sesion). */
    public record CambiarEstado(
            @Schema(description = "DISPONIBLE (continuar operando) o FUERA_DE_SERVICIO (finalizar sesión)",
                    allowableValues = {"DISPONIBLE", "FUERA_DE_SERVICIO"}, example = "DISPONIBLE")
            @NotBlank String estado) {
    }

    public record Posicion(
            @Schema(description = "Latitud GPS", example = "-6.8272") @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitud,
            @Schema(description = "Longitud GPS", example = "-79.8693") @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitud,
            @Schema(description = "Velocidad en km/h (opcional)", example = "32") @PositiveOrZero Double velocidadKmh) {
    }

    public record Rechazo(
            @Schema(description = "Motivo del rechazo",
                    allowableValues = {"OTRA_INCIDENCIA", "EMERGENCIA", "UNIDAD_OCUPADA", "FUERA_DE_SERVICIO",
                            "SIN_DESPLAZAMIENTO", "SIN_DISPONIBILIDAD", "OTRO"}, example = "UNIDAD_OCUPADA")
            @NotBlank String motivo,
            @Schema(description = "Obligatorio si el motivo es OTRO", maxLength = 200) @Size(max = 200) String detalle) {
    }

    public record Finalizacion(
            @Schema(description = "Resultado de la intervención",
                    allowableValues = {"ATENDIDA", "SIN_NOVEDAD", "FALSA_ALARMA", "DERIVADA", "REQUIERE_APOYO", "PENDIENTE", "OTRO"},
                    example = "ATENDIDA")
            @NotBlank String resultado,
            @Schema(description = "Observación del sereno (opcional)", maxLength = 500) @Size(max = 500) String observacion) {
    }
}
