package pe.gob.lavictoria.protege.alerta;

/** Se publica al crear una alerta; el motor de asignacion reacciona despues del commit. */
public record AlertaCreadaEvent(long alertaId) {
}
