package pe.gob.lavictoria.protege.reporte;

import java.time.LocalDate;
import java.util.List;

/**
 * Reporte de un rango de fechas (dia calendario en hora de Lima). Los tiempos son promedios en segundos
 * y son null cuando no hubo datos para calcularlos.
 */
public record ReporteResponse(LocalDate desde, LocalDate hasta, Indicadores indicadores,
                              List<PuntoDia> porDia, List<PuntoHora> porHora,
                              List<Conteo> porTipo, List<Conteo> porZona, List<Conteo> motivosReasignacion,
                              List<ActividadUnidad> unidades) {

    public record Indicadores(int total, int atendidas, int canceladas, int activas,
                              int escaladas, int reasignadas,
                              Double tiempoAsignacionSeg, Double tiempoAceptacionSeg,
                              Double tiempoLlegadaSeg, Double tiempoAtencionSeg) {
    }

    /** Alertas creadas ese dia y su tiempo medio de llegada. */
    public record PuntoDia(LocalDate fecha, int total, Double tiempoLlegadaSeg) {
    }

    public record PuntoHora(int hora, int total) {
    }

    public record Conteo(String codigo, String nombre, int total) {
    }

    public record ActividadUnidad(String codigo, String sereno, int asignaciones, int atendidas,
                                  int rechazadas, int sinRespuesta, Double tiempoTrasladoSeg) {
    }
}
