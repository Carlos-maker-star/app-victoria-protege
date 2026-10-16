package pe.gob.lavictoria.protege.tiemporeal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.gob.lavictoria.protege.alerta.AlertaMonitoreoResponse;
import pe.gob.lavictoria.protege.alerta.AlertaRepository;
import pe.gob.lavictoria.protege.alerta.AlertaService;
import pe.gob.lavictoria.protege.asignacion.AsignacionRepository;
import pe.gob.lavictoria.protege.unidad.UnidadRepository;

/**
 * Convierte los cambios confirmados en la base de datos en mensajes WebSocket.
 * Se ejecuta DESPUES del commit: nunca se anuncia algo que luego se revierte, y el estado que se envia
 * es siempre el final de la transaccion. Un fallo al notificar no afecta a la operacion ya guardada.
 */
@Component
public class TiempoRealListener {

    static final String TOPIC_ALERTAS = "/topic/monitoreo/alertas";
    static final String TOPIC_UNIDADES = "/topic/monitoreo/unidades";

    private static final Logger log = LoggerFactory.getLogger(TiempoRealListener.class);

    private final SimpMessagingTemplate ws;
    private final AlertaRepository alertas;
    private final AlertaService alertaService;
    private final AsignacionRepository asignaciones;
    private final UnidadRepository unidades;

    public TiempoRealListener(SimpMessagingTemplate ws, AlertaRepository alertas, AlertaService alertaService,
                              AsignacionRepository asignaciones, UnidadRepository unidades) {
        this.ws = ws;
        this.alertas = alertas;
        this.alertaService = alertaService;
        this.asignaciones = asignaciones;
        this.unidades = unidades;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void alEventoDeAlerta(EventoAlertaRegistrado e) {
        try {
            AlertaMonitoreoResponse alerta = alertas.buscarMonitoreo(e.alertaId()).orElse(null);
            if (alerta == null) {
                return;
            }
            // 1) Central
            String unidadCodigo = e.unidadId() == null ? null
                    : unidades.buscar(e.unidadId()).map(u -> u.codigo()).orElse(null);
            ws.convertAndSend(TOPIC_ALERTAS, new NotificacionCentral(e.tipo(), e.detalle(), unidadCodigo, alerta));

            // 2) Ciudadano dueno de la alerta
            alertas.ciudadanoDe(e.alertaId()).ifPresent(ciudadanoId -> {
                var seguimiento = alertaService.seguimiento(e.alertaId(), ciudadanoId);
                ws.convertAndSendToUser(String.valueOf(ciudadanoId), "/queue/seguimiento", seguimiento);
            });

            // 3) Serenos de las unidades que han tenido esta alerta (asignada, reasignada o cancelada)
            for (var s : asignaciones.serenosInvolucrados(e.alertaId())) {
                var estado = asignaciones.vistaUnidad(s.unidadId(),
                        asignaciones.asignacionVigente(s.unidadId()).orElse(null));
                ws.convertAndSendToUser(String.valueOf(s.usuarioId()), "/queue/estado", estado);
            }
        } catch (RuntimeException ex) {
            log.warn("No se pudo notificar en tiempo real el evento {} de la alerta {}", e.tipo(), e.alertaId(), ex);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void alCambioDeUnidad(UnidadCambioEvent e) {
        try {
            unidades.buscar(e.unidadId()).ifPresent(u -> {
                ws.convertAndSend(TOPIC_UNIDADES, u);
                // Si la unidad va en camino a una alerta, su ciudadano ve la posicion y el ETA actualizados.
                if (u.alertaActualId() != null) {
                    alertas.ciudadanoDe(u.alertaActualId()).ifPresent(ciudadanoId -> {
                        var seguimiento = alertaService.seguimiento(u.alertaActualId(), ciudadanoId);
                        if (seguimiento.unidadCodigo() != null) {   // solo tras aceptar: antes no ve la unidad
                            ws.convertAndSendToUser(String.valueOf(ciudadanoId), "/queue/seguimiento", seguimiento);
                        }
                    });
                }
            });
        } catch (RuntimeException ex) {
            log.warn("No se pudo notificar en tiempo real la unidad {}", e.unidadId(), ex);
        }
    }
}
