package pe.gob.lavictoria.protege.alerta;

import java.time.OffsetDateTime;

/** Vista de la central: incluye ciudadano, prioridad y unidad vigente. */
public record AlertaMonitoreoResponse(Long id, String tipo, String tipoNombre, int prioridad,
                                      String descripcion, double latitud, double longitud,
                                      String referencia, String estado, String resultado,
                                      String ciudadano, String ciudadanoTelefono,
                                      String unidadCodigo,
                                      OffsetDateTime creadaEn, OffsetDateTime finalizadaEn) {
}
