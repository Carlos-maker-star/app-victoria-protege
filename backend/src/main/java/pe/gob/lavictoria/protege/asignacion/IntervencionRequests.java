package pe.gob.lavictoria.protege.asignacion;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Cuerpos de las intervenciones manuales de la central. */
public final class IntervencionRequests {

    private IntervencionRequests() {
    }

    public record AsignacionManual(@NotNull Long unidadId,
                                   @NotBlank(message = "Indica el motivo de la asignacion manual")
                                   @Size(max = 200) String motivo) {
    }

    public record Cancelacion(@NotBlank(message = "Selecciona el motivo") String motivo,
                              @Size(max = 300) String observacion) {
    }
}
