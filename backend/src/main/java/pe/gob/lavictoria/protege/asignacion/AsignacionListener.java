package pe.gob.lavictoria.protege.asignacion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.gob.lavictoria.protege.alerta.AlertaCreadaEvent;

@Component
public class AsignacionListener {

    private static final Logger log = LoggerFactory.getLogger(AsignacionListener.class);

    private final AsignacionService asignacion;

    public AsignacionListener(AsignacionService asignacion) {
        this.asignacion = asignacion;
    }

    /**
     * La alerta ya esta guardada. Si la asignacion fallara, la alerta no se pierde:
     * el planificador la reintenta en pocos segundos.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCrearAlerta(AlertaCreadaEvent evento) {
        try {
            asignacion.asignarNueva(evento.alertaId());
        } catch (RuntimeException e) {
            log.error("No se pudo asignar la alerta {} de inmediato; se reintentara", evento.alertaId(), e);
        }
    }
}
