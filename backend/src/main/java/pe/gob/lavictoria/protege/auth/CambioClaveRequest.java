package pe.gob.lavictoria.protege.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CambioClaveRequest(
        @NotBlank String actual,
        @NotBlank @Size(min = 8, max = 72, message = "La clave debe tener entre 8 y 72 caracteres") String nueva) {
}
