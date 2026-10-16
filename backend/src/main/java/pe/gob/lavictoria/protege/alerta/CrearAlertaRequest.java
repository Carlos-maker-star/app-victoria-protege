package pe.gob.lavictoria.protege.alerta;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * latitud/longitud es el punto del incidente (el que el ciudadano confirma en el mapa).
 * latitudCiudadano/longitudCiudadano es el GPS del ciudadano al reportar (opcional).
 */
public record CrearAlertaRequest(
        @Schema(description = "Tipo de alerta", example = "ROBO",
                allowableValues = {"ROBO", "INCENDIO", "ACCIDENTE", "DISTURBIOS", "SOSPECHOSA", "EMERGENCIA", "DESASTRE", "OTRO"})
        @NotBlank String tipo,
        @Schema(description = "Qué está pasando (opcional)", example = "Dos sujetos arrebataron un celular", maxLength = 500)
        @Size(max = 500) String descripcion,
        @Schema(description = "Latitud del INCIDENTE (el punto que el vecino confirma en el mapa)", example = "-6.8262")
        @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitud,
        @Schema(description = "Longitud del INCIDENTE", example = "-79.8693")
        @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitud,
        @Schema(description = "Latitud del GPS del ciudadano (opcional; puede diferir del incidente)", example = "-6.8263")
        @DecimalMin("-90") @DecimalMax("90") Double latitudCiudadano,
        @Schema(description = "Longitud del GPS del ciudadano (opcional)", example = "-79.8694")
        @DecimalMin("-180") @DecimalMax("180") Double longitudCiudadano,
        @Schema(description = "Referencia escrita del lugar (opcional)", example = "Frente a la losa deportiva", maxLength = 200)
        @Size(max = 200) String referencia) {
}
