package pe.gob.lavictoria.protege.asignacion;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.gob.lavictoria.protege.alerta.AlertaDetalleResponse;
import pe.gob.lavictoria.protege.alerta.AlertaService;
import pe.gob.lavictoria.protege.auditoria.AuditoriaService;

/** Intervencion manual de la central (OPERADOR, SUPERVISOR, ADMIN) sobre una alerta. */
@RestController
@RequestMapping("/api/monitoreo/alertas/{id}")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Central · intervención", description = "Asignación manual y cancelación por la central.")
public class IntervencionController {

    private final AsignacionService asignacion;
    private final AlertaService alertas;

    private final AuditoriaService auditoria;

    public IntervencionController(AsignacionService asignacion, AlertaService alertas, AuditoriaService auditoria) {
        this.asignacion = asignacion;
        this.alertas = alertas;
        this.auditoria = auditoria;
    }

    /** Unidades que se pueden elegir, ordenadas por distancia; las no asignables traen su motivo. */
    @GetMapping("/candidatas")
    public List<CandidataResponse> candidatas(@PathVariable long id) {
        return asignacion.candidatas(id);
    }

    @PostMapping("/asignar")
    public AlertaDetalleResponse asignar(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                         @Valid @RequestBody IntervencionRequests.AsignacionManual req) {
        long usuario = Long.parseLong(jwt.getSubject());
        asignacion.asignarManual(id, req.unidadId(), req.motivo(), usuario);
        auditoria.registrar(usuario, "ASIGNACION_MANUAL", "alerta", id, "Unidad " + req.unidadId() + ". Motivo: " + req.motivo());
        return alertas.detalleMonitoreo(id);
    }

    @PostMapping("/cancelar")
    public AlertaDetalleResponse cancelar(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                          @Valid @RequestBody IntervencionRequests.Cancelacion req) {
        long usuario = Long.parseLong(jwt.getSubject());
        alertas.cancelarPorCentral(id, req, usuario);
        auditoria.registrar(usuario, "ALERTA_CANCELADA", "alerta", id, req.motivo() + (req.observacion() == null ? "" : ": " + req.observacion()));
        return alertas.detalleMonitoreo(id);
    }
}
