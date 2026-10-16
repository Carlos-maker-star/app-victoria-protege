package pe.gob.lavictoria.protege.tiemporeal;

/** Se publica cada vez que se agrega un evento a la linea de tiempo de una alerta. */
public record EventoAlertaRegistrado(long alertaId, String tipo, String detalle, Long unidadId) {
}
