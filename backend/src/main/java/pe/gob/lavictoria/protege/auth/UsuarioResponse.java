package pe.gob.lavictoria.protege.auth;

import io.swagger.v3.oas.annotations.media.Schema;
import pe.gob.lavictoria.protege.usuario.Usuario;

public record UsuarioResponse(
        Long id,
        @Schema(example = "71234567") String dni,
        String nombres,
        String apellidos,
        @Schema(nullable = true) String email,
        @Schema(nullable = true) String telefono,
        @Schema(description = "Rol del usuario. La app del ciudadano solo acepta CIUDADANO y la del sereno solo SERENO",
                allowableValues = {"CIUDADANO", "SERENO", "OPERADOR", "SUPERVISOR", "ADMIN"})
        String rol) {

    public static UsuarioResponse de(Usuario u) {
        return new UsuarioResponse(u.getId(), u.getDni(), u.getNombres(), u.getApellidos(),
                u.getEmail(), u.getTelefono(), u.getRol().getCodigo());
    }
}
