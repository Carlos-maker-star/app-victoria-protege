package pe.gob.lavictoria.protege.unidad;

import java.time.OffsetDateTime;

public record UnidadMonitoreoResponse(Long id, String codigo, String placa, String tipo, String estado,
                                      String sereno, Double latitud, Double longitud,
                                      OffsetDateTime ubicacionEn, Double velocidadKmh, Long alertaActualId,
                                      boolean activo) {
}
