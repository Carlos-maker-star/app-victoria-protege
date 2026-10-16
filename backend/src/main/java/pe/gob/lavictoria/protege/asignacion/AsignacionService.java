package pe.gob.lavictoria.protege.asignacion;

import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import pe.gob.lavictoria.protege.asignacion.AsignacionRepository.AlertaBloqueada;
import pe.gob.lavictoria.protege.asignacion.AsignacionRepository.AsignacionBloqueada;
import pe.gob.lavictoria.protege.asignacion.AsignacionRepository.Candidata;
import pe.gob.lavictoria.protege.asignacion.AsignacionRepository.ContextoSereno;
import pe.gob.lavictoria.protege.asignacion.AsignacionRepository.Motivo;
import pe.gob.lavictoria.protege.common.ApiException;
import pe.gob.lavictoria.protege.parametro.ParametroService;

/**
 * Motor de asignacion. Regla fundamental: una alerta nunca se pierde.
 * Toda alerta pasa por asignacion -> respuesta -> atencion o reasignacion.
 * Si no hay forma de asignarla, se escala a la central (SIN_UNIDAD) en vez de descartarse.
 */
@Service
public class AsignacionService {

    private static final Logger log = LoggerFactory.getLogger(AsignacionService.class);

    private static final Set<String> ESTADOS_ASIGNABLES = Set.of("CREADA", "BUSCANDO_UNIDAD", "SIN_UNIDAD");
    private static final Set<String> RESULTADOS = Set.of("ATENDIDA", "SIN_NOVEDAD", "FALSA_ALARMA",
            "DERIVADA", "REQUIERE_APOYO", "PENDIENTE", "OTRO");

    /** Estado en que queda la unidad segun el motivo por el que rechazo la alerta. */
    private static final Map<String, String> ESTADO_POR_MOTIVO = Map.of(
            "FUERA_DE_SERVICIO", "FUERA_DE_SERVICIO",
            "SIN_DESPLAZAMIENTO", "FUERA_DE_SERVICIO",
            "OTRA_INCIDENCIA", "EN_ATENCION",
            "EMERGENCIA", "EN_ATENCION",
            "UNIDAD_OCUPADA", "EN_ATENCION");

    private final AsignacionRepository repo;
    private final ParametroService parametros;

    public AsignacionService(AsignacionRepository repo, ParametroService parametros) {
        this.repo = repo;
        this.parametros = parametros;
    }

    // ================================================================ motor

    /** Punto de entrada tras crear la alerta: corre en su propia transaccion. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void asignarNueva(long alertaId) {
        asignar(alertaId);
    }

    /** Busca la unidad mas cercana y le asigna la alerta; si no puede, deja la alerta buscando o la escala. */
    @Transactional
    public void asignar(long alertaId) {
        // Modo manual (metodo base): el motor no elige; la central asigna con asignarManual()
        if (!parametros.booleano("asignacion_automatica")) {
            return;
        }
        AlertaBloqueada alerta = repo.bloquearAlerta(alertaId).orElse(null);
        if (alerta == null || !ESTADOS_ASIGNABLES.contains(alerta.estado())) {
            return;
        }

        int intentos = repo.contarAsignaciones(alertaId);
        if (intentos > parametros.entero("max_reasignaciones")) {
            escalar(alerta, "Se agotaron los intentos de asignacion");
            return;
        }

        Candidata c = repo.mejorCandidata(alertaId, parametros.entero("radio_busqueda_metros"),
                parametros.entero("ubicacion_obsoleta_segundos")).orElse(null);
        if (c == null) {
            if (alerta.espera() > parametros.entero("espera_maxima_segundos")) {
                escalar(alerta, "No hubo unidades disponibles en el tiempo maximo de espera");
            } else if ("CREADA".equals(alerta.estado())) {
                repo.estadoAlerta(alertaId, "BUSCANDO_UNIDAD");
                repo.evento(alertaId, "BUSCANDO_UNIDAD", "Buscando unidad disponible", null, null);
            }
            return;
        }

        int distancia = (int) Math.round(c.distanciaM());
        int eta = (int) Math.round(c.distanciaM() / (parametros.entero("velocidad_promedio_kmh") / 3.6));
        repo.insertarAsignacion(alertaId, c.unidadId(), intentos + 1, distancia, eta,
                parametros.entero("tiempo_respuesta_segundos"));
        repo.estadoAlerta(alertaId, "ASIGNADA");
        repo.evento(alertaId, "UNIDAD_ASIGNADA",
                "Asignada a " + c.codigo() + " (" + distancia + " m, intento " + (intentos + 1) + ")",
                c.unidadId(), null);
        log.info("Alerta {} asignada a {} ({} m)", alertaId, c.codigo(), distancia);
    }

    // ================================================================ intervencion de la central

    private static final Set<String> ESTADOS_ASIGNABLES_MANUAL = Set.of("CREADA", "BUSCANDO_UNIDAD", "SIN_UNIDAD", "ASIGNADA");

    /**
     * La central elige la unidad. Sirve para las alertas escaladas (SIN_UNIDAD) y tambien para
     * reemplazar una asignacion que aun espera respuesta. El sereno elegido conserva su ventana
     * normal para aceptar o rechazar, y si rechaza el motor sigue su curso.
     */
    @Transactional
    public void asignarManual(long alertaId, long unidadId, String motivo, long usuarioId) {
        AlertaBloqueada alerta = repo.bloquearAlerta(alertaId)
                .orElseThrow(() -> ApiException.noEncontrado("Alerta no encontrada"));
        if (!ESTADOS_ASIGNABLES_MANUAL.contains(alerta.estado())) {
            throw ApiException.conflicto("La alerta ya tiene una unidad en camino o terminó: no se puede asignar de nuevo");
        }
        var unidad = repo.bloquearUnidadAsignable(unidadId, alertaId)
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "UNIDAD_NO_DISPONIBLE",
                        "La unidad ya no está disponible: tomó otra alerta, está fuera de servicio o no tiene sereno"));

        String reemplazada = repo.cancelarPendiente(alertaId).orElse(null);
        int intentos = repo.contarAsignaciones(alertaId);
        Integer distancia = unidad.distanciaM() == null ? null : (int) Math.round(unidad.distanciaM());
        Integer eta = unidad.distanciaM() == null ? null
                : (int) Math.round(unidad.distanciaM() / (parametros.entero("velocidad_promedio_kmh") / 3.6));
        repo.insertarAsignacion(alertaId, unidadId, intentos + 1, distancia, eta,
                parametros.entero("tiempo_respuesta_segundos"));
        repo.estadoAlerta(alertaId, "ASIGNADA");
        repo.evento(alertaId, "ASIGNACION_MANUAL",
                "Asignada manualmente a " + unidad.codigo() + (distancia != null ? " (" + distancia + " m)" : "")
                        + (reemplazada != null ? ". Reemplaza la asignación pendiente de " + reemplazada : "")
                        + ". Motivo: " + motivo.trim(),
                unidadId, usuarioId);
        log.info("Alerta {} asignada manualmente a {} por el usuario {}", alertaId, unidad.codigo(), usuarioId);
    }

    @Transactional(readOnly = true)
    public List<CandidataResponse> candidatas(long alertaId) {
        if (!repo.existeAlerta(alertaId)) {
            throw ApiException.noEncontrado("Alerta no encontrada");
        }
        double velocidadMs = parametros.entero("velocidad_promedio_kmh") / 3.6;
        return repo.candidatas(alertaId).stream().map(f -> {
            boolean asignable = f.tieneSereno() && "DISPONIBLE".equals(f.estado()) && f.alertaActualId() == null;
            String motivo = asignable ? null
                    : !f.tieneSereno() ? "Sin sereno asignado"
                    : f.alertaActualId() != null ? "Atiende ALR-" + String.format("%06d", f.alertaActualId())
                    : switch (f.estado()) {
                        case "EN_DESPLAZAMIENTO" -> "En desplazamiento";
                        case "EN_ATENCION" -> "En atención";
                        default -> "Fuera de servicio";
                    };
            Integer distancia = f.distanciaM() == null ? null : (int) Math.round(f.distanciaM());
            Integer eta = f.distanciaM() == null ? null : (int) Math.round(f.distanciaM() / velocidadMs);
            return new CandidataResponse(f.unidadId(), f.codigo(), f.sereno(), f.estado(), distancia, eta,
                    f.ubicacionEn(), asignable, motivo);
        }).toList();
    }

    private void escalar(AlertaBloqueada alerta, String motivo) {
        if (!"SIN_UNIDAD".equals(alerta.estado())) {
            repo.estadoAlerta(alerta.id(), "SIN_UNIDAD");
            repo.evento(alerta.id(), "ESCALADA_A_CENTRAL", motivo, null, null);
            log.warn("Alerta {} escalada a la central: {}", alerta.id(), motivo);
        }
    }

    /** Tarea programada: la unidad no respondio a tiempo, se reasigna. */
    @Transactional
    public void vencer(long asignacionId) {
        long alertaId = repo.alertaDe(asignacionId).orElse(-1L);
        if (repo.bloquearAlerta(alertaId).isEmpty()) {
            return;
        }
        AsignacionBloqueada a = repo.bloquearAsignacion(asignacionId).orElse(null);
        if (a == null || !"PENDIENTE_RESPUESTA".equals(a.estado()) || !a.vencida()) {
            return;
        }
        repo.asignacionSinRespuesta(a.id());
        repo.estadoAlerta(alertaId, "BUSCANDO_UNIDAD");
        // Una unidad que no responde se marca fuera de servicio hasta que el sereno la reactive.
        repo.estadoUnidad(a.unidadId(), "FUERA_DE_SERVICIO");
        repo.evento(alertaId, "SIN_RESPUESTA", "La unidad no respondio en el tiempo limite", a.unidadId(), null);
        asignar(alertaId);
    }

    // ================================================================ acciones del sereno

    @Transactional(readOnly = true)
    public EstadoSerenoResponse estado(long usuarioId) {
        ContextoSereno ctx = contexto(usuarioId);
        return repo.vistaUnidad(ctx.unidadId(), repo.asignacionVigente(ctx.unidadId()).orElse(null));
    }

    /** DISPONIBLE = continuar operando. FUERA_DE_SERVICIO = finalizar sesion. */
    @Transactional
    public EstadoSerenoResponse cambiarEstado(long usuarioId, String estado) {
        ContextoSereno ctx = contexto(usuarioId);
        String nuevo = estado.trim().toUpperCase();
        if (!nuevo.equals("DISPONIBLE") && !nuevo.equals("FUERA_DE_SERVICIO")) {
            throw ApiException.solicitudInvalida("ESTADO_INVALIDO",
                    "Solo puedes cambiar a DISPONIBLE o FUERA_DE_SERVICIO");
        }
        if (repo.asignacionVigente(ctx.unidadId()).isPresent()) {
            throw ApiException.conflicto("Tienes una alerta en curso. Finalizala antes de cambiar de estado");
        }
        repo.estadoUnidad(ctx.unidadId(), nuevo);
        return repo.vistaUnidad(ctx.unidadId(), null);
    }

    /** Actualiza la posicion GPS. Si la unidad esta en ruta y llega a la alerta, registra la llegada. */
    @Transactional
    public EstadoSerenoResponse actualizarPosicion(long usuarioId, SerenoRequests.Posicion p) {
        ContextoSereno ctx = contexto(usuarioId);
        repo.actualizarPosicion(ctx.unidadId(), p.latitud(), p.longitud(), p.velocidadKmh());

        repo.asignacionVigente(ctx.unidadId()).filter(a -> "ACEPTADA".equals(a.estado())).ifPresent(a -> {
            repo.guardarRecorrido(ctx.unidadId(), a.alertaId(), p.latitud(), p.longitud(), p.velocidadKmh());
            repo.asignacionEnLlegada(ctx.unidadId(), parametros.entero("distancia_llegada_metros"))
                    .ifPresent(id -> llegada(id, ctx, null, "Llegada detectada por GPS"));
        });
        return repo.vistaUnidad(ctx.unidadId(), repo.asignacionVigente(ctx.unidadId()).orElse(null));
    }

    @Transactional
    public EstadoSerenoResponse aceptar(long usuarioId, long asignacionId) {
        ContextoSereno ctx = contexto(usuarioId);
        AsignacionBloqueada a = bloquear(asignacionId, ctx);
        exigirEstado(a, "PENDIENTE_RESPUESTA");
        if (a.vencida()) {
            throw new ApiException(HttpStatus.CONFLICT, "ASIGNACION_VENCIDA",
                    "El tiempo para responder la alerta termino");
        }
        repo.aceptarAsignacion(a.id());
        repo.estadoAlerta(a.alertaId(), "EN_CAMINO");
        repo.estadoUnidad(ctx.unidadId(), "EN_DESPLAZAMIENTO");
        repo.evento(a.alertaId(), "ALERTA_ACEPTADA", ctx.unidadCodigo() + " acepto la alerta",
                ctx.unidadId(), usuarioId);
        repo.evento(a.alertaId(), "RUTA_INICIADA", "La unidad se dirige al lugar", ctx.unidadId(), usuarioId);
        return estado(usuarioId);
    }

    /** "No puedo atender": registra el motivo y reasigna de inmediato. La alerta no se pierde. */
    @Transactional
    public EstadoSerenoResponse rechazar(long usuarioId, long asignacionId, SerenoRequests.Rechazo r) {
        ContextoSereno ctx = contexto(usuarioId);
        Motivo motivo = repo.motivoActivo(r.motivo().trim().toUpperCase())
                .orElseThrow(() -> ApiException.solicitudInvalida("MOTIVO_INVALIDO", "Motivo de rechazo no valido"));
        String detalle = r.detalle() == null || r.detalle().isBlank() ? null : r.detalle().trim();
        if ("OTRO".equals(r.motivo().trim().toUpperCase()) && detalle == null) {
            throw ApiException.solicitudInvalida("DETALLE_REQUERIDO", "Describe brevemente el motivo");
        }

        AsignacionBloqueada a = bloquear(asignacionId, ctx);
        exigirEstado(a, "PENDIENTE_RESPUESTA");
        repo.rechazarAsignacion(a.id(), motivo.id(), detalle);
        repo.estadoAlerta(a.alertaId(), "BUSCANDO_UNIDAD");
        repo.evento(a.alertaId(), "ALERTA_RECHAZADA",
                ctx.unidadCodigo() + ": " + motivo.nombre() + (detalle != null ? " - " + detalle : ""),
                ctx.unidadId(), usuarioId);
        String nuevoEstado = ESTADO_POR_MOTIVO.get(r.motivo().trim().toUpperCase());
        if (nuevoEstado != null) {
            repo.estadoUnidad(ctx.unidadId(), nuevoEstado);
        }
        asignar(a.alertaId());
        return estado(usuarioId);
    }

    @Transactional
    public EstadoSerenoResponse registrarLlegada(long usuarioId, long asignacionId) {
        ContextoSereno ctx = contexto(usuarioId);
        AsignacionBloqueada a = bloquear(asignacionId, ctx);
        exigirEstado(a, "ACEPTADA");
        llegada(a.id(), ctx, usuarioId, "El sereno registro su llegada");
        return estado(usuarioId);
    }

    private void llegada(long asignacionId, ContextoSereno ctx, Long usuarioId, String detalle) {
        long alertaId = repo.alertaDe(asignacionId).orElseThrow();
        repo.asignacionLlegada(asignacionId);
        repo.estadoAlerta(alertaId, "LLEGO");
        repo.estadoUnidad(ctx.unidadId(), "EN_ATENCION");
        repo.evento(alertaId, "UNIDAD_LLEGO", detalle, ctx.unidadId(), usuarioId);
    }

    @Transactional
    public EstadoSerenoResponse iniciarAtencion(long usuarioId, long asignacionId) {
        ContextoSereno ctx = contexto(usuarioId);
        AsignacionBloqueada a = bloquear(asignacionId, ctx);
        exigirEstado(a, "ACEPTADA");
        repo.estadoAlerta(a.alertaId(), "EN_ATENCION");
        repo.evento(a.alertaId(), "ATENCION_INICIADA", "Atencion en proceso", ctx.unidadId(), usuarioId);
        return estado(usuarioId);
    }

    /**
     * Cierra la atencion. La unidad queda EN_ATENCION hasta que el sereno elija
     * "continuar operando" (DISPONIBLE) o "finalizar sesion" (FUERA_DE_SERVICIO).
     */
    @Transactional
    public EstadoSerenoResponse finalizar(long usuarioId, long asignacionId, SerenoRequests.Finalizacion f) {
        ContextoSereno ctx = contexto(usuarioId);
        String resultado = f.resultado().trim().toUpperCase();
        if (!RESULTADOS.contains(resultado)) {
            throw ApiException.solicitudInvalida("RESULTADO_INVALIDO", "Resultado no valido: " + RESULTADOS);
        }
        AsignacionBloqueada a = bloquear(asignacionId, ctx);
        exigirEstado(a, "ACEPTADA");
        repo.asignacionCompletada(a.id());
        repo.finalizarAlerta(a.alertaId(), resultado);
        repo.estadoUnidad(ctx.unidadId(), "EN_ATENCION");
        repo.evento(a.alertaId(), "ATENCION_FINALIZADA",
                "Resultado: " + resultado + (f.observacion() != null && !f.observacion().isBlank()
                        ? ". " + f.observacion().trim() : ""),
                ctx.unidadId(), usuarioId);
        return estado(usuarioId);
    }

    // ================================================================ auxiliares

    private ContextoSereno contexto(long usuarioId) {
        return repo.contextoSereno(usuarioId).orElseThrow(() -> new ApiException(HttpStatus.CONFLICT,
                "SIN_UNIDAD_ASIGNADA", "No tienes una unidad asignada. Contacta a la central"));
    }

    /** Bloquea alerta y luego asignacion (mismo orden que la cancelacion) y verifica que sea de la unidad. */
    private AsignacionBloqueada bloquear(long asignacionId, ContextoSereno ctx) {
        long alertaId = repo.alertaDe(asignacionId)
                .orElseThrow(() -> ApiException.noEncontrado("Asignacion no encontrada"));
        repo.bloquearAlerta(alertaId);
        return repo.bloquearAsignacion(asignacionId)
                .filter(a -> a.unidadId() == ctx.unidadId())
                .orElseThrow(() -> ApiException.noEncontrado("Asignacion no encontrada"));
    }

    private void exigirEstado(AsignacionBloqueada a, String esperado) {
        if (!esperado.equals(a.estado())) {
            throw new ApiException(HttpStatus.CONFLICT, "ASIGNACION_NO_VIGENTE",
                    "La alerta ya no esta en un estado que permita esta accion (" + a.estado() + ")");
        }
    }
}
