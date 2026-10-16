package pe.gob.lavictoria.protege.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegistroRequest(
        @NotBlank @Pattern(regexp = "\\d{8}", message = "El DNI debe tener 8 digitos") String dni,
        @NotBlank @Size(max = 100) String nombres,
        @NotBlank @Size(max = 100) String apellidos,
        @Email @Size(max = 150) String email,
        @Pattern(regexp = "\\d{9}", message = "El telefono debe tener 9 digitos") String telefono,
        @NotBlank @Size(min = 8, max = 72, message = "La clave debe tener entre 8 y 72 caracteres") String password) {
}
