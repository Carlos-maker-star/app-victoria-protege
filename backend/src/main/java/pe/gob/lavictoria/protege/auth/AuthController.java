package pe.gob.lavictoria.protege.auth;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Autenticación", description = "Inicio de sesión y registro. Compartido por las apps y la web.")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/login")
    @Operation(summary = "Iniciar sesión",
            description = """
                    Entra con el DNI (8 dígitos) o el correo y la contraseña. Devuelve el token JWT y el usuario.
                    El token lleva el rol (`CIUDADANO`, `SERENO`, `OPERADOR`, `SUPERVISOR`, `ADMIN`); la app del
                    ciudadano solo debe aceptar `CIUDADANO` y la del sereno solo `SERENO`.

                    Errores: `401 NO_AUTORIZADO` (credenciales inválidas o usuario inactivo; el mensaje no dice cuál),
                    `429 DEMASIADOS_INTENTOS` (5 intentos fallidos seguidos bloquean el acceso 15 minutos; `mensaje`
                    dice cuánto falta).""")
    public TokenResponse login(@Valid @RequestBody LoginRequest req) {
        return auth.login(req);
    }

    @PostMapping("/registro")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Registrar un ciudadano",
            description = """
                    Crea una cuenta de **ciudadano** (siempre este rol) y devuelve la sesión iniciada. El personal
                    (serenos, operadores…) lo crea un administrador desde la web.

                    Errores: `409 CONFLICTO` (el DNI o el correo ya tienen cuenta), `400 VALIDACION` (campos).
                    Nota: por ahora no se valida la identidad contra RENIEC.""")
    public TokenResponse registro(@Valid @RequestBody RegistroRequest req) {
        return auth.registrar(req);
    }

    @PostMapping("/clave")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Cambiar mi contraseña",
            description = """
                    El usuario de la sesión cambia su propia clave (mínimo 8 caracteres). Sirve para todos los roles.
                    La sesión actual sigue vigente.

                    Errores: `422 CLAVE_ACTUAL_INCORRECTA`, `422 CLAVE_REPETIDA` (igual a la actual), `400 VALIDACION`.""")
    public void cambiarClave(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CambioClaveRequest req) {
        auth.cambiarClave(Long.parseLong(jwt.getSubject()), req);
    }

    @GetMapping("/me")
    @Operation(summary = "Usuario de la sesión",
            description = "Devuelve el usuario del token. Úsalo al abrir la app para confirmar que la sesión sigue vigente.")
    public UsuarioResponse me(@AuthenticationPrincipal Jwt jwt) {
        return auth.perfil(Long.parseLong(jwt.getSubject()));
    }
}
