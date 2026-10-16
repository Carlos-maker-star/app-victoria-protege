package pe.gob.lavictoria.protege.common;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

    private final HttpStatus estado;
    private final String codigo;

    public ApiException(HttpStatus estado, String codigo, String mensaje) {
        super(mensaje);
        this.estado = estado;
        this.codigo = codigo;
    }

    public static ApiException noAutorizado(String mensaje) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "NO_AUTORIZADO", mensaje);
    }

    public static ApiException conflicto(String mensaje) {
        return new ApiException(HttpStatus.CONFLICT, "CONFLICTO", mensaje);
    }

    public static ApiException noEncontrado(String mensaje) {
        return new ApiException(HttpStatus.NOT_FOUND, "NO_ENCONTRADO", mensaje);
    }

    public static ApiException solicitudInvalida(String codigo, String mensaje) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, codigo, mensaje);
    }

    public static ApiException demasiadosIntentos(String mensaje) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "DEMASIADOS_INTENTOS", mensaje);
    }

    public HttpStatus getEstado() {
        return estado;
    }

    public String getCodigo() {
        return codigo;
    }
}
