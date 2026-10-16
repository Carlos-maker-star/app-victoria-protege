package pe.gob.lavictoria.protege.evidencia;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import pe.gob.lavictoria.protege.alerta.AlertaRepository;
import pe.gob.lavictoria.protege.auditoria.AuditoriaService;
import pe.gob.lavictoria.protege.common.ApiException;

/**
 * Fotos, videos y notas que el ciudadano y el sereno adjuntan a una alerta. Los archivos se guardan en disco con un
 * nombre aleatorio (el nombre original nunca se usa) y se identifica el tipo por su contenido, no por lo que diga el
 * cliente. Solo se entregan a quien tiene que verlos (ver {@link #abrir}).
 */
@Service
public class EvidenciaService {

    /** Tipos admitidos, detectados por los primeros bytes del archivo. */
    enum Formato {
        JPEG("FOTO", "jpg", "image/jpeg"),
        PNG("FOTO", "png", "image/png"),
        WEBP("FOTO", "webp", "image/webp"),
        MP4("VIDEO", "mp4", "video/mp4");

        final String tipo;
        final String extension;
        final String mime;

        Formato(String tipo, String extension, String mime) {
            this.tipo = tipo;
            this.extension = extension;
            this.mime = mime;
        }

        static Formato detectar(byte[] b, int n) {
            if (n >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
                return JPEG;
            }
            if (n >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
                return PNG;
            }
            if (n >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                    && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
                return WEBP;
            }
            if (n >= 12 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p') {
                return MP4;
            }
            return null;
        }

        static Formato dePorExtension(String archivo) {
            return Arrays.stream(values()).filter(f -> archivo.endsWith("." + f.extension)).findFirst().orElse(null);
        }
    }

    public record Evidencia(Long id, Long alertaId, String origen, String tipo, String observacion, String autor,
                            boolean conArchivo, OffsetDateTime creadoEn) {
    }

    public record Archivo(Resource recurso, MediaType tipo) {
    }

    private final JdbcClient jdbc;
    private final AlertaRepository alertas;
    private final AuditoriaService auditoria;
    private final Path carpeta;
    private final long maxFoto;
    private final long maxVideo;
    private final int maxPorAlerta;

    public EvidenciaService(JdbcClient jdbc, AlertaRepository alertas, AuditoriaService auditoria,
                            @Value("${app.evidencias.directorio:./evidencias-data}") String directorio,
                            @Value("${app.evidencias.max-foto-mb:8}") long maxFotoMb,
                            @Value("${app.evidencias.max-video-mb:40}") long maxVideoMb,
                            @Value("${app.evidencias.max-por-alerta:10}") int maxPorAlerta) throws IOException {
        this.jdbc = jdbc;
        this.alertas = alertas;
        this.auditoria = auditoria;
        this.carpeta = Path.of(directorio).toAbsolutePath().normalize();
        Files.createDirectories(carpeta);
        this.maxFoto = maxFotoMb * 1024 * 1024;
        this.maxVideo = maxVideoMb * 1024 * 1024;
        this.maxPorAlerta = maxPorAlerta;
    }

    // ---------------------------------------------------------------- subir

    /** El ciudadano adjunta evidencia a una alerta suya que sigue en curso. */
    @Transactional
    public Evidencia subirCiudadano(long alertaId, long ciudadanoId, MultipartFile archivo, String observacion) {
        String estado = jdbc.sql("SELECT estado FROM alerta WHERE id = :id AND ciudadano_id = :c")
                .param("id", alertaId).param("c", ciudadanoId).query(String.class).optional()
                .orElseThrow(() -> ApiException.noEncontrado("Alerta no encontrada"));
        exigirEnCurso(estado);
        return guardar(alertaId, null, "CIUDADANO", ciudadanoId, archivo, observacion);
    }

    /** El sereno adjunta evidencia a una alerta que su unidad aceptó (en curso o ya atendida). */
    @Transactional
    public Evidencia subirSereno(long alertaId, long serenoUsuarioId, MultipartFile archivo, String observacion) {
        Long asignacionId = jdbc.sql("""
                        SELECT a.id FROM asignacion a JOIN sereno s ON s.unidad_id = a.unidad_id
                        WHERE a.alerta_id = :alerta AND s.usuario_id = :u AND a.estado IN ('ACEPTADA', 'COMPLETADA')
                        ORDER BY a.orden DESC LIMIT 1
                        """)
                .param("alerta", alertaId).param("u", serenoUsuarioId).query(Long.class).optional()
                .orElseThrow(() -> ApiException.noEncontrado("No tienes esa alerta asignada"));
        return guardar(alertaId, asignacionId, "SERENO", serenoUsuarioId, archivo, observacion);
    }

    private static void exigirEnCurso(String estado) {
        if (estado.equals("FINALIZADA") || estado.equals("CANCELADA")) {
            throw ApiException.conflicto("La alerta ya terminó: no se pueden agregar más evidencias");
        }
    }

    private Evidencia guardar(long alertaId, Long asignacionId, String origen, long usuarioId,
                              MultipartFile archivo, String observacion) {
        String nota = observacion == null || observacion.isBlank() ? null : observacion.trim();
        boolean hayArchivo = archivo != null && !archivo.isEmpty();
        if (!hayArchivo && nota == null) {
            throw ApiException.solicitudInvalida("EVIDENCIA_VACIA", "Adjunta una foto o video, o escribe una nota");
        }
        if (nota != null && nota.length() > 500) {
            throw ApiException.solicitudInvalida("NOTA_MUY_LARGA", "La nota admite hasta 500 caracteres");
        }
        long actuales = jdbc.sql("SELECT count(*) FROM evidencia WHERE alerta_id = :a AND origen = :o")
                .param("a", alertaId).param("o", origen).query(Long.class).single();
        if (actuales >= maxPorAlerta) {
            throw ApiException.solicitudInvalida("LIMITE_EVIDENCIAS", "Se alcanzó el máximo de " + maxPorAlerta + " evidencias por alerta");
        }

        String tipo = "NOTA";
        String nombre = null;
        if (hayArchivo) {
            Formato formato = detectar(archivo);
            tipo = formato.tipo;
            long max = formato == Formato.MP4 ? maxVideo : maxFoto;
            if (archivo.getSize() > max) {
                throw ApiException.solicitudInvalida("ARCHIVO_MUY_GRANDE",
                        "El " + (formato == Formato.MP4 ? "video" : "archivo") + " pesa más de " + (max / 1024 / 1024) + " MB");
            }
            nombre = UUID.randomUUID() + "." + formato.extension;
            try (InputStream in = archivo.getInputStream()) {
                Files.copy(in, carpeta.resolve(nombre));
            } catch (IOException e) {
                throw new IllegalStateException("No se pudo guardar la evidencia", e);
            }
        }
        long id;
        try {
            id = insertar(alertaId, asignacionId, origen, tipo, nombre, nota, usuarioId);
        } catch (RuntimeException e) {
            borrarSilencioso(nombre); // no dejar un archivo huerfano si la base rechaza el registro
            throw e;
        }
        alertas.registrarEvento(alertaId, "EVIDENCIA_AGREGADA",
                (origen.equals("SERENO") ? "El sereno" : "El ciudadano") + " agregó " + etiqueta(tipo), usuarioId);
        auditoria.registrar(usuarioId, "EVIDENCIA_AGREGADA", "alerta", alertaId, tipo + " #" + id);
        return obtener(id);
    }

    private void borrarSilencioso(String nombre) {
        if (nombre != null) {
            try {
                Files.deleteIfExists(carpeta.resolve(nombre));
            } catch (IOException ignorado) {
                // el archivo queda sin referencia; no se puede hacer mas
            }
        }
    }

    private long insertar(long alertaId, Long asignacionId, String origen, String tipo, String nombre, String nota, long usuarioId) {
        return jdbc.sql("""
                        INSERT INTO evidencia (alerta_id, asignacion_id, origen, tipo, ruta_archivo, observacion, creado_por)
                        VALUES (:alerta, :asignacion, :origen, :tipo, :ruta, :obs, :usuario) RETURNING id
                        """)
                .param("alerta", alertaId).param("asignacion", asignacionId, java.sql.Types.BIGINT)
                .param("origen", origen).param("tipo", tipo).param("ruta", nombre, java.sql.Types.VARCHAR)
                .param("obs", nota, java.sql.Types.VARCHAR).param("usuario", usuarioId)
                .query(Long.class).single();
    }

    private static String etiqueta(String tipo) {
        return switch (tipo) {
            case "FOTO" -> "una foto";
            case "VIDEO" -> "un video";
            default -> "una nota";
        };
    }

    private Formato detectar(MultipartFile archivo) {
        byte[] cabecera = new byte[16];
        int n;
        try (InputStream in = archivo.getInputStream()) {
            n = in.readNBytes(cabecera, 0, cabecera.length);
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo leer el archivo", e);
        }
        Formato f = Formato.detectar(cabecera, n);
        if (f == null) {
            throw ApiException.solicitudInvalida("ARCHIVO_NO_PERMITIDO", "Solo se admiten fotos JPG, PNG o WebP y videos MP4");
        }
        return f;
    }

    // ---------------------------------------------------------------- consultar

    private static final String SELECT = """
            SELECT e.id, e.alerta_id, e.origen, e.tipo, e.observacion, e.ruta_archivo IS NOT NULL AS con_archivo, e.creado_en,
                   u.nombres || ' ' || u.apellidos AS autor
            FROM evidencia e JOIN usuario u ON u.id = e.creado_por
            """;

    private static Evidencia mapear(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Evidencia(rs.getLong("id"), rs.getLong("alerta_id"), rs.getString("origen"), rs.getString("tipo"),
                rs.getString("observacion"), rs.getString("autor"), rs.getBoolean("con_archivo"),
                rs.getObject("creado_en", OffsetDateTime.class));
    }

    private Evidencia obtener(long id) {
        return jdbc.sql(SELECT + " WHERE e.id = :id").param("id", id).query((rs, n) -> mapear(rs)).single();
    }

    /** Evidencias de una alerta (la central las ve todas). */
    @Transactional(readOnly = true)
    public List<Evidencia> listarCentral(long alertaId) {
        existeAlerta(alertaId);
        return listar(alertaId);
    }

    /** El ciudadano ve las evidencias de sus propias alertas. */
    @Transactional(readOnly = true)
    public List<Evidencia> listarCiudadano(long alertaId, long ciudadanoId) {
        jdbc.sql("SELECT 1 FROM alerta WHERE id = :id AND ciudadano_id = :c").param("id", alertaId).param("c", ciudadanoId)
                .query(Integer.class).optional().orElseThrow(() -> ApiException.noEncontrado("Alerta no encontrada"));
        return listar(alertaId);
    }

    private List<Evidencia> listar(long alertaId) {
        return jdbc.sql(SELECT + " WHERE e.alerta_id = :a ORDER BY e.creado_en, e.id").param("a", alertaId)
                .query((rs, n) -> mapear(rs)).list();
    }

    private void existeAlerta(long alertaId) {
        jdbc.sql("SELECT 1 FROM alerta WHERE id = :id").param("id", alertaId).query(Integer.class).optional()
                .orElseThrow(() -> ApiException.noEncontrado("Alerta no encontrada"));
    }

    // ---------------------------------------------------------------- descargar

    /**
     * Entrega el archivo si el usuario puede verlo: la central (cualquier alerta), el ciudadano dueño de la alerta o el
     * sereno cuya unidad la aceptó. Para cualquier otro es un 404, igual que si no existiera.
     */
    @Transactional(readOnly = true)
    public Archivo abrir(long evidenciaId, long usuarioId, String rol) {
        var fila = jdbc.sql("SELECT alerta_id, ruta_archivo FROM evidencia WHERE id = :id").param("id", evidenciaId)
                .query((rs, n) -> new String[]{rs.getString("alerta_id"), rs.getString("ruta_archivo")}).optional()
                .orElseThrow(() -> ApiException.noEncontrado("Evidencia no encontrada"));
        long alertaId = Long.parseLong(fila[0]);
        boolean permitido = switch (rol) {
            case "OPERADOR", "SUPERVISOR", "ADMIN" -> true;
            case "CIUDADANO" -> jdbc.sql("SELECT 1 FROM alerta WHERE id = :a AND ciudadano_id = :u")
                    .param("a", alertaId).param("u", usuarioId).query(Integer.class).optional().isPresent();
            case "SERENO" -> jdbc.sql("""
                            SELECT 1 FROM asignacion a JOIN sereno s ON s.unidad_id = a.unidad_id
                            WHERE a.alerta_id = :a AND s.usuario_id = :u AND a.estado IN ('ACEPTADA', 'COMPLETADA') LIMIT 1
                            """)
                    .param("a", alertaId).param("u", usuarioId).query(Integer.class).optional().isPresent();
            default -> false;
        };
        if (!permitido || fila[1] == null) {
            throw ApiException.noEncontrado("Evidencia no encontrada");
        }
        Path ruta = carpeta.resolve(fila[1]).normalize();
        Formato formato = Formato.dePorExtension(fila[1]);
        if (!ruta.startsWith(carpeta) || formato == null || !Files.isRegularFile(ruta)) {
            throw ApiException.noEncontrado("El archivo ya no está disponible");
        }
        return new Archivo(new FileSystemResource(ruta), MediaType.parseMediaType(formato.mime));
    }
}
