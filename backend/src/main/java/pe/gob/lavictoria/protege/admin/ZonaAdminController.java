package pe.gob.lavictoria.protege.admin;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pe.gob.lavictoria.protege.auditoria.AuditoriaService;
import pe.gob.lavictoria.protege.common.ApiException;

/**
 * Sectores operativos dentro del distrito. Solo ADMIN. El limite del distrito solo se cambia con PUT /distrito.
 * Un sector es un poligono (GeoJSON) que debe caer dentro del distrito y no superponerse con otro sector activo.
 * Cada vez que cambian los sectores se recalcula el sector de todas las alertas, para que los reportes
 * por sector sean consistentes.
 */
@RestController
@RequestMapping("/api/admin/zonas")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Administración · zonas", description = "Sectores del distrito. Solo ADMIN.")
public class ZonaAdminController {

    public record ZonaAdminResponse(Long id, String nombre, String tipo, boolean activo, double areaKm2,
                                    int alertas, int unidades, String geojson) {
    }

    public record CrearZona(
            @NotBlank @Size(max = 60) String nombre,
            @NotBlank @Size(max = 300_000) String geojson) {
    }

    public record RedefinirDistrito(@NotBlank String geojson) {
    }

    public record RenombrarZona(@NotBlank @Size(max = 60) String nombre) {
    }

    public record CambioActivo(boolean activo) {
    }

    public record GenerarCuadricula(@Min(1) @Max(5) int filas, @Min(1) @Max(5) int columnas, boolean reemplazar) {
    }

    private static final int MAX_SECTORES = 25;
    private static final double AREA_MIN_KM2 = 0.5;
    private static final double AREA_MAX_KM2 = 200;
    private static final int MAX_VERTICES = 2000;
    /** Margen para que un sector dibujado pegado al limite no se rechace por precision del mapa. */
    private static final int TOLERANCIA_DISTRITO_M = 50;
    /** Superposicion permitida entre sectores vecinos (metros cuadrados). */
    private static final int SUPERPOSICION_PERMITIDA_M2 = 500;

    private static final String GEOMETRIA = "ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:geojson AS text)), 4326))";

    private static final String SELECT = """
            SELECT z.id, z.nombre, z.tipo, z.activo, ST_Area(z.geom::geography) / 1e6 AS area_km2,
                   (SELECT count(*) FROM alerta a WHERE a.zona_id = z.id) AS alertas,
                   (SELECT count(*) FROM unidad u WHERE u.zona_id = z.id AND u.activo) AS unidades,
                   ST_AsGeoJSON(z.geom) AS geojson
            FROM zona z
            """;

    private final JdbcClient jdbc;
    private final AuditoriaService auditoria;

    public ZonaAdminController(JdbcClient jdbc, AuditoriaService auditoria) {
        this.jdbc = jdbc;
        this.auditoria = auditoria;
    }

    /** El distrito primero y luego los sectores activos; los inactivos al final. */
    @GetMapping
    public List<ZonaAdminResponse> listar() {
        return jdbc.sql(SELECT + " ORDER BY (z.tipo = 'DISTRITO') DESC, z.activo DESC, z.nombre")
                .query(ZonaAdminController::mapear).list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public ZonaAdminResponse crear(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CrearZona req) {
        String nombre = req.nombre().trim();
        exigirNombreLibre(nombre, null);
        exigirCupo(1);
        validarGeometria(req.geojson(), null);
        long id = jdbc.sql("INSERT INTO zona (nombre, tipo, geom) VALUES (:nombre, 'SECTOR', " + GEOMETRIA + ") RETURNING id")
                .param("nombre", nombre).param("geojson", req.geojson()).query(Long.class).single();
        int alertas = recalcularAlertas();
        auditoria.registrar(adminId(jwt), "SECTOR_CREADO", "zona", id, nombre + " (" + alertas + " alertas reubicadas)");
        return buscar(id);
    }

    /**
     * Redefine el limite del distrito (por ejemplo, cuando la municipalidad lo acota). Es la zona que decide si una
     * alerta esta dentro de la cobertura, asi que se exige que no deje fuera ningun sector activo ni ninguna alerta
     * en curso: primero hay que resolverlos.
     */
    @PutMapping("/distrito")
    @Transactional
    public ZonaAdminResponse redefinirDistrito(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RedefinirDistrito req) {
        validarPoligono(req.geojson());
        double area = jdbc.sql("SELECT ST_Area(" + GEOMETRIA + "::geography) / 1000000.0")
                .param("geojson", req.geojson()).query(Double.class).single();
        if (area < AREA_MIN_KM2 || area > AREA_MAX_KM2) {
            throw ApiException.solicitudInvalida("AREA_INVALIDA",
                    "El distrito debe medir entre " + AREA_MIN_KM2 + " y " + AREA_MAX_KM2 + " km² (el dibujo mide "
                            + Math.round(area * 100) / 100.0 + " km²)");
        }
        String nuevo = "(SELECT ST_Buffer(" + GEOMETRIA + "::geography, :tolerancia)::geometry)";
        List<String> sectores = jdbc.sql("SELECT z.nombre FROM zona z WHERE z.tipo = 'SECTOR' AND z.activo AND NOT ST_Covers(" + nuevo + ", z.geom) ORDER BY z.nombre")
                .param("geojson", req.geojson()).param("tolerancia", TOLERANCIA_DISTRITO_M).query(String.class).list();
        if (!sectores.isEmpty()) {
            throw ApiException.conflicto("El nuevo límite deja fuera parte de: " + String.join(", ", sectores)
                    + ". Desactiva esos sectores (o genera la cuadrícula de nuevo después) y vuelve a intentarlo.");
        }
        long afuera = jdbc.sql("SELECT count(*) FROM alerta a WHERE a.estado NOT IN ('FINALIZADA', 'CANCELADA') AND NOT ST_Covers(" + nuevo + ", a.ubicacion)")
                .param("geojson", req.geojson()).param("tolerancia", TOLERANCIA_DISTRITO_M).query(Long.class).single();
        if (afuera > 0) {
            throw ApiException.conflicto("Hay " + afuera + " alertas en curso que quedarían fuera del nuevo límite. Espera a que terminen o cancélalas.");
        }
        Long id = jdbc.sql("SELECT id FROM zona WHERE tipo = 'DISTRITO' AND activo LIMIT 1").query(Long.class).optional()
                .orElseThrow(() -> ApiException.noEncontrado("No hay un distrito definido"));
        double antes = buscar(id).areaKm2();
        jdbc.sql("UPDATE zona SET geom = " + GEOMETRIA + " WHERE id = :id").param("geojson", req.geojson()).param("id", id).update();
        auditoria.registrar(adminId(jwt), "DISTRITO_REDEFINIDO", "zona", id,
                "Área de " + antes + " km² a " + Math.round(area * 100) / 100.0 + " km²");
        return buscar(id);
    }

    /** Solo el nombre: para cambiar la forma se desactiva el sector y se dibuja uno nuevo. */
    @PutMapping("/{id}")
    @Transactional
    public ZonaAdminResponse renombrar(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                       @Valid @RequestBody RenombrarZona req) {
        ZonaAdminResponse actual = buscarSector(id);
        String nombre = req.nombre().trim();
        exigirNombreLibre(nombre, id);
        jdbc.sql("UPDATE zona SET nombre = :nombre WHERE id = :id").param("nombre", nombre).param("id", id).update();
        auditoria.registrar(adminId(jwt), "SECTOR_RENOMBRADO", "zona", id, actual.nombre() + " -> " + nombre);
        return buscar(id);
    }

    @PatchMapping("/{id}/activo")
    @Transactional
    public ZonaAdminResponse cambiarActivo(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
                                           @RequestBody CambioActivo req) {
        ZonaAdminResponse actual = buscarSector(id);
        if (req.activo()) {
            exigirNombreLibre(actual.nombre(), id);
            exigirCupo(1);
            String choca = sectorQueSeSuperpone("(SELECT geom FROM zona WHERE id = " + id + ")", id);
            if (choca != null) {
                throw ApiException.conflicto("No se puede activar: se superpone con el sector «" + choca + "»");
            }
        }
        jdbc.sql("UPDATE zona SET activo = :activo WHERE id = :id").param("activo", req.activo()).param("id", id).update();
        recalcularAlertas();
        auditoria.registrar(adminId(jwt), req.activo() ? "SECTOR_ACTIVADO" : "SECTOR_DESACTIVADO", "zona", id, actual.nombre());
        return buscar(id);
    }

    /**
     * Divide el distrito en una cuadricula de filas x columnas, recortada al limite del distrito. Numera los
     * sectores de arriba a abajo y de izquierda a derecha. Sirve para tener sectores rapidamente.
     * Con reemplazar=true desactiva los sectores actuales; si no, falla si ya hay sectores activos.
     */
    @PostMapping("/cuadricula")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public List<ZonaAdminResponse> cuadricula(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody GenerarCuadricula req) {
        int activos = jdbc.sql("SELECT count(*) FROM zona WHERE tipo = 'SECTOR' AND activo").query(Integer.class).single();
        if (activos > 0 && !req.reemplazar()) {
            throw ApiException.conflicto("Ya hay " + activos + " sectores activos. Confirma que quieres reemplazarlos.");
        }
        if (req.filas() * req.columnas() > MAX_SECTORES) {
            throw ApiException.solicitudInvalida("DEMASIADOS_SECTORES", "Máximo " + MAX_SECTORES + " sectores");
        }
        jdbc.sql("UPDATE zona SET activo = FALSE WHERE tipo = 'SECTOR' AND activo").update();

        // Celdas de la cuadricula recortadas al distrito; se descartan las que quedan casi vacias (< 0.1 km2)
        List<String> geometrias = jdbc.sql("""
                        WITH d AS (SELECT geom, ST_XMin(geom) x0, ST_XMax(geom) x1, ST_YMin(geom) y0, ST_YMax(geom) y1
                                     FROM zona WHERE tipo = 'DISTRITO' AND activo LIMIT 1),
                        celdas AS (
                            SELECT f, c, ST_Multi(ST_CollectionExtract(ST_Intersection(d.geom,
                                       ST_MakeEnvelope(x0 + (x1 - x0) * c / CAST(:cols AS float8), y0 + (y1 - y0) * f / CAST(:filas AS float8),
                                                       x0 + (x1 - x0) * (c + 1) / CAST(:cols AS float8), y0 + (y1 - y0) * (f + 1) / CAST(:filas AS float8), 4326)), 3)) AS g
                            FROM d, generate_series(0, :filas - 1) f, generate_series(0, :cols - 1) c)
                        SELECT ST_AsGeoJSON(g) FROM celdas
                        WHERE NOT ST_IsEmpty(g) AND ST_Area(g::geography) > 100000
                        ORDER BY f DESC, c
                        """)
                .param("filas", req.filas()).param("cols", req.columnas())
                .query(String.class).list();
        int n = 0;
        for (String geojson : geometrias) {
            n++;
            jdbc.sql("INSERT INTO zona (nombre, tipo, geom) VALUES (:nombre, 'SECTOR', " + GEOMETRIA + ")")
                    .param("nombre", "Sector " + n).param("geojson", geojson).update();
        }
        recalcularAlertas();
        auditoria.registrar(adminId(jwt), "SECTORES_GENERADOS", "zona", null,
                req.filas() + "x" + req.columnas() + " -> " + n + " sectores");
        return listar().stream().filter(z -> "SECTOR".equals(z.tipo()) && z.activo()).toList();
    }

    /** Vuelve a calcular el sector de todas las alertas (por si se cargaron datos antes de crear los sectores). */
    @PostMapping("/recalcular")
    @Transactional
    public int recalcular(@AuthenticationPrincipal Jwt jwt) {
        int n = recalcularAlertas();
        auditoria.registrar(adminId(jwt), "SECTORES_RECALCULADOS", "alerta", null, n + " alertas");
        return n;
    }

    // ------------------------------------------------------------------ validaciones

    /** El GeoJSON debe ser un poligono valido (cerrado, sin cruzarse, con vertices razonables). */
    private void validarPoligono(String geojson) {
        Boolean valida;
        try {
            valida = jdbc.sql("""
                            SELECT ST_IsValid(g) AND GeometryType(g) = 'MULTIPOLYGON' AND NOT ST_IsEmpty(g)
                                   AND ST_NPoints(g) BETWEEN 4 AND :maxVertices
                            FROM (SELECT %s AS g) t
                            """.formatted(GEOMETRIA))
                    .param("geojson", geojson).param("maxVertices", MAX_VERTICES)
                    .query(Boolean.class).single();
        } catch (DataAccessException e) {
            throw ApiException.solicitudInvalida("GEOMETRIA_INVALIDA", "El polígono no es un GeoJSON válido");
        }
        if (!Boolean.TRUE.equals(valida)) {
            throw ApiException.solicitudInvalida("GEOMETRIA_INVALIDA",
                    "El polígono no es válido: debe ser un polígono cerrado, sin cruzarse consigo mismo, de 3 a "
                            + MAX_VERTICES + " vértices");
        }
    }

    private void validarGeometria(String geojson, Long excluirId) {
        validarPoligono(geojson);
        boolean dentro = Boolean.TRUE.equals(jdbc.sql("""
                        SELECT ST_Covers(ST_Buffer(z.geom::geography, :tolerancia)::geometry, %s)
                        FROM zona z WHERE z.tipo = 'DISTRITO' AND z.activo LIMIT 1
                        """.formatted(GEOMETRIA))
                .param("geojson", geojson).param("tolerancia", TOLERANCIA_DISTRITO_M)
                .query(Boolean.class).optional().orElse(false));
        if (!dentro) {
            throw ApiException.solicitudInvalida("FUERA_DEL_DISTRITO", "El sector debe quedar dentro del distrito de La Victoria");
        }
        String choca = sectorQueSeSuperpone(GEOMETRIA, excluirId, geojson);
        if (choca != null) {
            throw ApiException.conflicto("El sector se superpone con «" + choca + "». Ajusta el dibujo para que no se solapen.");
        }
    }

    private String sectorQueSeSuperpone(String geometriaSql, Long excluirId) {
        return sectorQueSeSuperpone(geometriaSql, excluirId, null);
    }

    private String sectorQueSeSuperpone(String geometriaSql, Long excluirId, String geojson) {
        JdbcClient.StatementSpec q = jdbc.sql("""
                        SELECT z.nombre FROM zona z
                        WHERE z.tipo = 'SECTOR' AND z.activo AND (CAST(:excluir AS bigint) IS NULL OR z.id <> :excluir)
                          AND ST_Area(ST_Intersection(z.geom, %s)::geography) > :minimo
                        LIMIT 1
                        """.formatted(geometriaSql))
                .param("excluir", excluirId, java.sql.Types.BIGINT)
                .param("minimo", SUPERPOSICION_PERMITIDA_M2);
        if (geojson != null) {
            q = q.param("geojson", geojson);
        }
        return q.query(String.class).optional().orElse(null);
    }

    private void exigirNombreLibre(String nombre, Long excluirId) {
        boolean existe = jdbc.sql("""
                        SELECT EXISTS (SELECT 1 FROM zona WHERE tipo = 'SECTOR' AND activo AND lower(nombre) = lower(:nombre)
                                        AND (CAST(:excluir AS bigint) IS NULL OR id <> :excluir))
                        """)
                .param("nombre", nombre).param("excluir", excluirId, java.sql.Types.BIGINT)
                .query(Boolean.class).single();
        if (existe) {
            throw ApiException.conflicto("Ya existe un sector activo llamado «" + nombre + "»");
        }
    }

    private void exigirCupo(int nuevos) {
        int activos = jdbc.sql("SELECT count(*) FROM zona WHERE tipo = 'SECTOR' AND activo").query(Integer.class).single();
        if (activos + nuevos > MAX_SECTORES) {
            throw ApiException.solicitudInvalida("DEMASIADOS_SECTORES", "Máximo " + MAX_SECTORES + " sectores activos");
        }
    }

    /** Asigna a cada alerta el sector que contiene su ubicacion (null si ninguno). */
    private int recalcularAlertas() {
        return jdbc.sql("""
                        UPDATE alerta a SET zona_id = (SELECT z.id FROM zona z
                                                        WHERE z.tipo = 'SECTOR' AND z.activo AND ST_Covers(z.geom, a.ubicacion)
                                                        ORDER BY z.id LIMIT 1)
                        WHERE a.zona_id IS DISTINCT FROM (SELECT z.id FROM zona z
                                                           WHERE z.tipo = 'SECTOR' AND z.activo AND ST_Covers(z.geom, a.ubicacion)
                                                           ORDER BY z.id LIMIT 1)
                        """)
                .update();
    }

    private ZonaAdminResponse buscar(long id) {
        return jdbc.sql(SELECT + " WHERE z.id = :id").param("id", id).query(ZonaAdminController::mapear).optional()
                .orElseThrow(() -> ApiException.noEncontrado("Zona no encontrada"));
    }

    private ZonaAdminResponse buscarSector(long id) {
        ZonaAdminResponse z = buscar(id);
        if (!"SECTOR".equals(z.tipo())) {
            throw ApiException.conflicto("El límite del distrito no se puede modificar");
        }
        return z;
    }

    private static long adminId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }

    private static ZonaAdminResponse mapear(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new ZonaAdminResponse(rs.getLong("id"), rs.getString("nombre"), rs.getString("tipo"), rs.getBoolean("activo"),
                Math.round(rs.getDouble("area_km2") * 100) / 100.0, rs.getInt("alertas"), rs.getInt("unidades"),
                rs.getString("geojson"));
    }
}
