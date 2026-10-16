package pe.gob.lavictoria.protege.alerta;

import java.time.OffsetDateTime;

/**
 * Evento de la linea de tiempo. {@code usuario} es el personal que lo origino (operador, sereno...);
 * es null para eventos del sistema y del ciudadano (su identidad ya figura en la alerta).
 */
public record EventoResponse(String tipo, String detalle, String unidadCodigo, String usuario,
                             OffsetDateTime creadoEn) {
}
