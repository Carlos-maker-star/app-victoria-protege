package pe.gob.lavictoria.protege.auth;

public record TokenResponse(String token, String tipo, long expiraEnSegundos, UsuarioResponse usuario) {
}
