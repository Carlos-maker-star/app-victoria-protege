package pe.gob.lavictoria.protege.asignacion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Tareas que mantienen la regla fundamental: ninguna alerta queda sin asignacion o sin respuesta. */
@Component
public class AsignacionScheduler {

    private static final Logger log = LoggerFactory.getLogger(AsignacionScheduler.class);

    private final AsignacionRepository repo;
    private final AsignacionService servicio;

    public AsignacionScheduler(AsignacionRepository repo, AsignacionService servicio) {
        this.repo = repo;
        this.servicio = servicio;
    }

    /** Reasigna las alertas cuya unidad no respondio en el tiempo limite. */
    @Scheduled(fixedDelay = 2000, initialDelay = 5000)
    public void vencerRespuestas() {
        for (Long id : repo.asignacionesVencidas()) {
            try {
                servicio.vencer(id);
            } catch (RuntimeException e) {
                log.error("Error al vencer la asignacion {}", id, e);
            }
        }
    }

    /** Reintenta las alertas que esperan unidad (por ejemplo, cuando una unidad vuelve a estar disponible). */
    @Scheduled(fixedDelay = 5000, initialDelay = 7000)
    public void reintentarBusquedas() {
        for (Long id : repo.alertasPorAsignar()) {
            try {
                servicio.asignar(id);
            } catch (RuntimeException e) {
                log.error("Error al asignar la alerta {}", id, e);
            }
        }
    }
}
