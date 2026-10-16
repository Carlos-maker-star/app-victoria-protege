package pe.gob.lavictoria.protege.alerta;

import java.util.List;
import java.util.Map;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.gob.lavictoria.protege.asignacion.IntervencionRequests;
import pe.gob.lavictoria.protege.common.ApiException;
import pe.gob.lavictoria.protege.parametro.ParametroService;

@Service
public class AlertaService {

    private final AlertaRepository alertas;
    private final ParametroService parametros;
    private final ApplicationEventPublisher eventos;

    public AlertaService(AlertaRepository alertas, ParametroService parametros,
                         ApplicationEventPublisher eventos) {
        this.alertas = alertas;
        this.parametros = parametros;
        this.eventos = eventos;
    }

    @Transactional
    public AlertaResponse crear(long ciudadanoId, CrearAlertaRequest req) {
        short tipoId = alertas.tipoActivo(req.tipo().trim().toUpperCase())
                .orElseThrow(() -> ApiException.solicitudInvalida("TIPO_ALERTA_INVALIDO",
                        "El tipo de alerta no existe o esta inactivo"));

        double tolerancia = parametros.entero("tolerancia_borde_metros");
        if (!alertas.dentroDelDistrito(req.latitud(), req.longitud(), tolerancia)) {
            throw ApiException.solicitudInvalida("FUERA_DE_COBERTURA",
                    "El punto del incidente esta fuera del distrito de La Victoria. "
                            + "Para emergencias fuera del distrito llame a la Policia Nacional (105).");
        }

        long id;
        try {
            id = alertas.insertar(ciudadanoId, tipoId, req);
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "ALERTA_ACTIVA_EXISTENTE",
                    "Ya tienes una alerta en curso. Espera a que se atienda o cancelala antes de crear otra.");
        }
        alertas.registrarEvento(id, "ALERTA_CREADA", "Alerta creada por el ciudadano", ciudadanoId);
        eventos.publishEvent(new AlertaCreadaEvent(id));   // el motor asigna despues del commit
        return alertas.buscarDelCiudadano(id, ciudadanoId).orElseThrow();
    }

    /** Lo que ve el ciudadano: estado simplificado y, cuando hay unidad aceptada, su posicion y ETA. */
    @Transactional(readOnly = true)
    public SeguimientoResponse seguimiento(long alertaId, long ciudadanoId) {
        AlertaRepository.FilaSeguimiento f = alertas.seguimiento(alertaId, ciudadanoId)
                .orElseThrow(() -> ApiException.noEncontrado("Alerta no encontrada"));
        Integer eta = null;
        Integer distancia = null;
        if (f.unidadCodigo() != null && f.distanciaM() != null) {
            distancia = (int) Math.round(f.distanciaM());
            eta = (int) Math.round(f.distanciaM() / (parametros.entero("velocidad_promedio_kmh") / 3.6));
        }
        return new SeguimientoResponse(alertaId, estadoParaCiudadano(f.estado()), f.unidadCodigo(),
                f.unidadLat(), f.unidadLon(), f.ubicacionEn(), distancia, eta);
    }

    /** El ciudadano no ve la complejidad operativa: las reasignaciones le aparecen como "asignando". */
    static String estadoParaCiudadano(String estado) {
        return switch (estado) {
            case "CREADA", "BUSCANDO_UNIDAD", "ASIGNADA", "SIN_UNIDAD" -> "ASIGNANDO_UNIDAD";
            case "ACEPTADA" -> "UNIDAD_ASIGNADA";
            case "EN_CAMINO" -> "UNIDAD_EN_CAMINO";
            case "LLEGO" -> "UNIDAD_LLEGO";
            case "EN_ATENCION" -> "ATENCION_EN_PROCESO";
            case "FINALIZADA" -> "ALERTA_ATENDIDA";
            default -> estado;
        };
    }

    @Transactional(readOnly = true)
    public AlertaResponse obtenerDelCiudadano(long alertaId, long ciudadanoId) {
        return alertas.buscarDelCiudadano(alertaId, ciudadanoId)
                .orElseThrow(() -> ApiException.noEncontrado("Alerta no encontrada"));
    }

    @Transactional(readOnly = true)
    public List<AlertaResponse> listarDelCiudadano(long ciudadanoId) {
        return alertas.listarDelCiudadano(ciudadanoId);
    }

    @Transactional
    public AlertaResponse cancelar(long alertaId, long ciudadanoId) {
        obtenerDelCiudadano(alertaId, ciudadanoId);
        if (!alertas.cancelar(alertaId)) {
            throw ApiException.conflicto("La alerta ya no se puede cancelar");
        }
        alertas.registrarEvento(alertaId, "ALERTA_CANCELADA", "Cancelada por el ciudadano", ciudadanoId);
        return obtenerDelCiudadano(alertaId, ciudadanoId);
    }

    /** Motivos con los que la central puede cancelar una alerta. */
    static final Map<String, String> MOTIVOS_CANCELACION = Map.of(
            "FALSA_ALARMA", "Falsa alarma confirmada",
            "DUPLICADA", "Alerta duplicada",
            "RESUELTA_POR_LLAMADA", "Resuelta por llamada",
            "SOLICITUD_CIUDADANO", "A solicitud del ciudadano",
            "OTRO", "Otro motivo");

    /**
     * Cancelacion por la central: se libera la unidad, el ciudadano y el sereno reciben el aviso por
     * WebSocket y el motivo queda en la linea de tiempo con el nombre de quien la hizo.
     */
    @Transactional
    public void cancelarPorCentral(long alertaId, IntervencionRequests.Cancelacion req, long usuarioId) {
        String codigo = req.motivo().trim().toUpperCase();
        String nombre = MOTIVOS_CANCELACION.get(codigo);
        if (nombre == null) {
            throw ApiException.solicitudInvalida("MOTIVO_INVALIDO", "Motivo de cancelación no válido");
        }
        String observacion = req.observacion() == null || req.observacion().isBlank() ? null : req.observacion().trim();
        if ("OTRO".equals(codigo) && observacion == null) {
            throw ApiException.solicitudInvalida("DETALLE_REQUERIDO", "Describe brevemente el motivo");
        }
        alertas.buscarMonitoreo(alertaId).orElseThrow(() -> ApiException.noEncontrado("Alerta no encontrada"));
        if (!alertas.cancelar(alertaId, true)) {
            throw ApiException.conflicto("La alerta ya terminó y no se puede cancelar");
        }
        alertas.registrarEvento(alertaId, "ALERTA_CANCELADA",
                "Cancelada por la central: " + nombre + (observacion != null ? ". " + observacion : ""), usuarioId);
    }

    @Transactional(readOnly = true)
    public List<AlertaMonitoreoResponse> listarMonitoreo(String estado, boolean soloActivas, int limite) {
        return alertas.listarMonitoreo(estado == null || estado.isBlank() ? null : estado.toUpperCase(),
                soloActivas, Math.min(Math.max(limite, 1), 200));
    }

    @Transactional(readOnly = true)
    public AlertaDetalleResponse detalleMonitoreo(long alertaId) {
        AlertaMonitoreoResponse alerta = alertas.buscarMonitoreo(alertaId)
                .orElseThrow(() -> ApiException.noEncontrado("Alerta no encontrada"));
        return new AlertaDetalleResponse(alerta, alertas.historial(alertaId));
    }
}
