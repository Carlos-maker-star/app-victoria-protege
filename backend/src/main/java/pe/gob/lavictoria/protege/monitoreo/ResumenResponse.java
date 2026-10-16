package pe.gob.lavictoria.protege.monitoreo;

/** Indicadores del centro de monitoreo. Los tiempos son promedios de hoy, en segundos (null si no hay datos). */
public record ResumenResponse(int alertasActivas, int alertasSinUnidad,
                              int unidadesDisponibles, int unidadesEnRuta, int unidadesEnAtencion,
                              int unidadesFueraDeServicio, int unidadesTotal,
                              int atendidasHoy, int reasignadasHoy,
                              Double tiempoRespuestaSeg, Double tiempoLlegadaSeg) {
}
