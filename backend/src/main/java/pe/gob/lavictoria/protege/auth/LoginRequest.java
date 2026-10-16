package pe.gob.lavictoria.protege.auth;

import jakarta.validation.constraints.NotBlank;

/** El usuario puede ingresar con su DNI o con su correo. */
public record LoginRequest(@NotBlank String usuario, @NotBlank String password) {
}
