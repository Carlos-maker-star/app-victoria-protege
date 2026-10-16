package pe.gob.lavictoria.protege.common;

import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    /** `campos` solo aparece en los errores de validacion (HTTP 400); en los demas se omite. */
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public record ErrorResponse(String codigo, String mensaje, Map<String, String> campos) {
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> api(ApiException e) {
        return ResponseEntity.status(e.getEstado()).body(new ErrorResponse(e.getCodigo(), e.getMessage(), null));
    }

    /** Lo corta Spring antes de llegar al servicio, cuando el archivo supera el tope absoluto de subida. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> demasiadoGrande(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE)
                .body(new ErrorResponse("ARCHIVO_MUY_GRANDE", "El archivo es demasiado grande", null));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> validacion(MethodArgumentNotValidException e) {
        Map<String, String> campos = e.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(f -> f.getField(),
                        f -> f.getDefaultMessage() == null ? "invalido" : f.getDefaultMessage(),
                        (a, b) -> a));
        return ResponseEntity.badRequest().body(new ErrorResponse("VALIDACION", "Datos invalidos", campos));
    }
}
