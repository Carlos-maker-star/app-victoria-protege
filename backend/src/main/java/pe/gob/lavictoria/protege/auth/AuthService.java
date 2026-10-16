package pe.gob.lavictoria.protege.auth;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.gob.lavictoria.protege.auditoria.AuditoriaService;
import pe.gob.lavictoria.protege.common.ApiException;
import pe.gob.lavictoria.protege.usuario.Rol;
import pe.gob.lavictoria.protege.usuario.RolRepository;
import pe.gob.lavictoria.protege.usuario.Usuario;
import pe.gob.lavictoria.protege.usuario.UsuarioRepository;

@Service
public class AuthService {

    private final UsuarioRepository usuarios;
    private final RolRepository roles;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final LimiteIntentos limite;
    private final AuditoriaService auditoria;
    private final JdbcClient jdbc;

    public AuthService(UsuarioRepository usuarios, RolRepository roles, PasswordEncoder encoder, JwtService jwt,
                       LimiteIntentos limite, AuditoriaService auditoria, JdbcClient jdbc) {
        this.usuarios = usuarios;
        this.roles = roles;
        this.encoder = encoder;
        this.jwt = jwt;
        this.limite = limite;
        this.auditoria = auditoria;
        this.jdbc = jdbc;
    }

    /**
     * Sin @Transactional a proposito: los intentos fallidos se auditan y deben quedar guardados aunque el login
     * termine en error (cada consulta usa su propia transaccion).
     */
    public TokenResponse login(LoginRequest req) {
        String id = req.usuario().trim();
        long espera = limite.minutosRestantes(id);
        if (espera > 0) {
            throw ApiException.demasiadosIntentos("Demasiados intentos fallidos. Vuelve a intentarlo en " + espera
                    + (espera == 1 ? " minuto." : " minutos."));
        }
        boolean esDni = id.matches("\\d{8}");
        Usuario u = (esDni ? usuarios.findByDni(id) : usuarios.findByEmailIgnoreCase(id))
                .filter(Usuario::isActivo)
                .filter(x -> encoder.matches(req.password(), x.getPasswordHash()))
                .orElse(null);
        if (u == null) {
            // Se registra solo el DNI: un texto libre podria ser una clave escrita en el campo equivocado
            String quien = esDni ? "DNI " + id : "correo";
            boolean bloqueado = limite.fallo(id);
            auditoria.registrar(null, bloqueado ? "LOGIN_BLOQUEADO" : "LOGIN_FALLIDO", "usuario", null,
                    bloqueado ? quien + ": bloqueado temporalmente por intentos fallidos" : quien);
            throw ApiException.noAutorizado("Credenciales invalidas");
        }
        limite.exito(id);
        auditoria.registrar(u.getId(), "LOGIN", "usuario", u.getId(), null);
        return jwt.emitir(u);
    }

    /** El propio usuario cambia su clave. Las sesiones ya emitidas siguen valiendo hasta que venzan (12 h). */
    @Transactional
    public void cambiarClave(long usuarioId, CambioClaveRequest req) {
        Usuario u = usuarios.findById(usuarioId).filter(Usuario::isActivo)
                .orElseThrow(() -> ApiException.noAutorizado("Sesion invalida"));
        if (!encoder.matches(req.actual(), u.getPasswordHash())) {
            throw ApiException.solicitudInvalida("CLAVE_ACTUAL_INCORRECTA", "La clave actual no es correcta");
        }
        if (req.actual().equals(req.nueva())) {
            throw ApiException.solicitudInvalida("CLAVE_REPETIDA", "La clave nueva debe ser distinta de la actual");
        }
        jdbc.sql("UPDATE usuario SET password_hash = :clave WHERE id = :id")
                .param("clave", encoder.encode(req.nueva())).param("id", usuarioId).update();
        auditoria.registrar(usuarioId, "CLAVE_CAMBIADA", "usuario", usuarioId, null);
    }

    /** Registro publico: siempre crea un CIUDADANO. Los demas roles los crea un administrador. */
    @Transactional
    public TokenResponse registrar(RegistroRequest req) {
        if (usuarios.existsByDni(req.dni())) {
            throw ApiException.conflicto("Ya existe una cuenta con ese DNI");
        }
        String email = req.email() == null || req.email().isBlank() ? null : req.email().trim();
        if (email != null && usuarios.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflicto("Ya existe una cuenta con ese correo");
        }
        Rol rol = roles.findByCodigo(Rol.CIUDADANO).orElseThrow();
        Usuario u = usuarios.save(new Usuario(rol, req.dni(), req.nombres().trim(), req.apellidos().trim(),
                email, req.telefono(), encoder.encode(req.password())));
        auditoria.registrar(u.getId(), "REGISTRO", "usuario", u.getId(), null);
        return jwt.emitir(u);
    }

    @Transactional(readOnly = true)
    public UsuarioResponse perfil(long usuarioId) {
        return usuarios.findById(usuarioId).filter(Usuario::isActivo).map(UsuarioResponse::de)
                .orElseThrow(() -> ApiException.noAutorizado("Sesion invalida"));
    }
}
