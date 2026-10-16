package pe.gob.lavictoria.protege.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import pe.gob.lavictoria.protege.usuario.Rol;
import pe.gob.lavictoria.protege.usuario.RolRepository;
import pe.gob.lavictoria.protege.usuario.Usuario;
import pe.gob.lavictoria.protege.usuario.UsuarioRepository;

/** Crea usuarios de prueba, uno por rol. Solo corre con el perfil "local". */
@Component
@Profile("local")
@Order(1)
public class DatosDesarrollo implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DatosDesarrollo.class);

    private final UsuarioRepository usuarios;
    private final RolRepository roles;
    private final PasswordEncoder encoder;
    private final JdbcClient jdbc;
    private final String clave;

    public DatosDesarrollo(UsuarioRepository usuarios, RolRepository roles, PasswordEncoder encoder,
                           JdbcClient jdbc, @Value("${app.seed.password}") String clave) {
        this.usuarios = usuarios;
        this.roles = roles;
        this.encoder = encoder;
        this.jdbc = jdbc;
        this.clave = clave;
    }

    @Override
    public void run(String... args) {
        crear("00000001", Rol.ADMIN, "Administrador", "Sistema", "admin@victoriaprotege.local");
        crear("00000002", Rol.SUPERVISOR, "Supervisor", "Serenazgo", "supervisor@victoriaprotege.local");
        crear("00000003", Rol.OPERADOR, "Operador", "Central", "operador@victoriaprotege.local");
        crear("00000004", Rol.SERENO, "Sereno", "Uno", "sereno1@victoriaprotege.local");
        crear("00000005", Rol.SERENO, "Sereno", "Dos", "sereno2@victoriaprotege.local");
        crear("00000006", Rol.CIUDADANO, "Vecino", "Prueba", "vecino@victoriaprotege.local");

        // Dos unidades cerca del centro del distrito, una por sereno de prueba.
        unidad("SV-001", "TEST-001", "00000004", -6.8262, -79.8693);
        unidad("SV-002", "TEST-002", "00000005", -6.8362, -79.8693);
    }

    private void unidad(String codigo, String placa, String dniSereno, double lat, double lon) {
        jdbc.sql("""
                        INSERT INTO unidad (codigo, placa, tipo, estado, ubicacion, ubicacion_en)
                        VALUES (:codigo, :placa, 'CAMIONETA', 'FUERA_DE_SERVICIO',
                                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), now())
                        ON CONFLICT (codigo) DO NOTHING
                        """)
                .param("codigo", codigo).param("placa", placa).param("lat", lat).param("lon", lon)
                .update();
        jdbc.sql("""
                        INSERT INTO sereno (usuario_id, unidad_id)
                        SELECT p.id, u.id FROM usuario p, unidad u WHERE p.dni = :dni AND u.codigo = :codigo
                        ON CONFLICT (usuario_id) DO NOTHING
                        """)
                .param("dni", dniSereno).param("codigo", codigo)
                .update();
    }

    private void crear(String dni, String codigoRol, String nombres, String apellidos, String email) {
        if (usuarios.existsByDni(dni)) {
            return;
        }
        Rol rol = roles.findByCodigo(codigoRol).orElseThrow();
        usuarios.save(new Usuario(rol, dni, nombres, apellidos, email, null, encoder.encode(clave)));
        log.info("Usuario de prueba creado: {} ({})", dni, codigoRol);
    }
}
