package pe.gob.lavictoria.protege.reporte;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.gob.lavictoria.protege.common.ApiException;

/** Reportes y estadisticas para la central (OPERADOR, SUPERVISOR, ADMIN). */
@RestController
@RequestMapping("/api/monitoreo/reportes")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Central · reportes", description = "Estadísticas de un rango de fechas (hora de Lima).")
public class ReporteController {

    private static final ZoneId LIMA = ZoneId.of("America/Lima");
    private static final long DIAS_MAXIMOS = 366;

    private final ReporteRepository repo;

    public ReporteController(ReporteRepository repo) {
        this.repo = repo;
    }

    /** Sin fechas: los ultimos 7 dias, hoy incluido. Fechas en formato AAAA-MM-DD (hora de Lima). */
    @GetMapping
    @Transactional(readOnly = true)
    public ReporteResponse reporte(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        LocalDate fin = hasta != null ? hasta : LocalDate.now(LIMA);
        LocalDate inicio = desde != null ? desde : fin.minusDays(6);
        if (inicio.isAfter(fin)) {
            throw ApiException.solicitudInvalida("RANGO_INVALIDO", "La fecha inicial no puede ser posterior a la final");
        }
        if (ChronoUnit.DAYS.between(inicio, fin) >= DIAS_MAXIMOS) {
            throw ApiException.solicitudInvalida("RANGO_INVALIDO", "El rango máximo es de un año");
        }
        return new ReporteResponse(inicio, fin, repo.indicadores(inicio, fin), repo.porDia(inicio, fin),
                repo.porHora(inicio, fin), repo.porTipo(inicio, fin), repo.porZona(inicio, fin),
                repo.motivosReasignacion(inicio, fin), repo.unidades(inicio, fin));
    }
}
