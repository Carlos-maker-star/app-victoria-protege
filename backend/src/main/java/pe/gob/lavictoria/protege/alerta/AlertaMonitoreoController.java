package pe.gob.lavictoria.protege.alerta;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/monitoreo/alertas")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Central · alertas", description = "Consulta de alertas para la plataforma web. Roles: OPERADOR, SUPERVISOR, ADMIN.")
public class AlertaMonitoreoController {

    private final AlertaService alertas;

    public AlertaMonitoreoController(AlertaService alertas) {
        this.alertas = alertas;
    }

    /** Sin filtros devuelve solo las alertas activas. Con estado=... filtra por ese estado. */
    @GetMapping
    public List<AlertaMonitoreoResponse> listar(@RequestParam(required = false) String estado,
                                                @RequestParam(defaultValue = "false") boolean todas,
                                                @RequestParam(defaultValue = "100") int limite) {
        return alertas.listarMonitoreo(estado, !todas, limite);
    }

    @GetMapping("/{id}")
    public AlertaDetalleResponse detalle(@PathVariable long id) {
        return alertas.detalleMonitoreo(id);
    }
}
