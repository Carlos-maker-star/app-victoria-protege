package pe.gob.lavictoria.protege.tiemporeal;

import pe.gob.lavictoria.protege.alerta.AlertaMonitoreoResponse;

/**
 * Mensaje para /topic/monitoreo/alertas: el evento que ocurrio (para notificaciones y linea de tiempo)
 * y el estado actual de la alerta (para actualizar mapa y tabla).
 * tipo: ALERTA_CREADA, UNIDAD_ASIGNADA, ALERTA_ACEPTADA, ALERTA_RECHAZADA, SIN_RESPUESTA,
 * ESCALADA_A_CENTRAL, UNIDAD_LLEGO, ATENCION_FINALIZADA, ALERTA_CANCELADA, ...
 */
public record NotificacionCentral(String tipo, String detalle, String unidadCodigo, AlertaMonitoreoResponse alerta) {
}
