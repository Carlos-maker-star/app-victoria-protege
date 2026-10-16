package pe.gob.lavictoria.protege.asignacion;

import java.time.OffsetDateTime;

/**
 * Unidad que la central puede elegir para una alerta. Las no asignables se devuelven igual,
 * con el motivo, para que el operador vea por que no puede elegirlas.
 */
public record CandidataResponse(Long id, String codigo, String sereno, String estado,
                                Integer distanciaM, Integer etaSegundos, OffsetDateTime ubicacionEn,
                                boolean asignable, String motivoNoDisponible) {
}
