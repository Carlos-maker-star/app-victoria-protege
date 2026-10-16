package pe.gob.lavictoria.protege.alerta;

import java.util.List;

public record AlertaDetalleResponse(AlertaMonitoreoResponse alerta, List<EventoResponse> historial) {
}
