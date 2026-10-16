package pe.gob.lavictoria.protege.unidad;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Unidades para la central (mapa y tabla). El estado inicial se carga por REST; los cambios llegan por WebSocket. */
@RestController
@RequestMapping("/api/monitoreo/unidades")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Central · unidades", description = "Unidades activas en tiempo real.")
public class UnidadMonitoreoController {

    private final UnidadRepository unidades;

    public UnidadMonitoreoController(UnidadRepository unidades) {
        this.unidades = unidades;
    }

    @GetMapping
    public List<UnidadMonitoreoResponse> listar(@RequestParam(required = false) String estado) {
        return unidades.listar(estado);
    }
}
