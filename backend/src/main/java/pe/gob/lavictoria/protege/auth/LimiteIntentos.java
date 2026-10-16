package pe.gob.lavictoria.protege.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Freno contra adivinar contrasenas: tras N intentos fallidos seguidos de un mismo usuario, el login se bloquea
 * unos minutos. Vive en memoria (se reinicia con el servidor), que alcanza para un solo servidor local.
 * El bloqueo es por usuario (no por IP): protege la cuenta aunque el atacante cambie de direccion.
 */
@Component
public class LimiteIntentos {

    private record Registro(int fallos, Instant bloqueadoHasta) {
    }

    private final ConcurrentHashMap<String, Registro> registros = new ConcurrentHashMap<>();
    private final int maxIntentos;
    private final Duration bloqueo;

    public LimiteIntentos(@Value("${app.seguridad.login-max-intentos:5}") int maxIntentos,
                          @Value("${app.seguridad.login-bloqueo-minutos:15}") int bloqueoMinutos) {
        this.maxIntentos = maxIntentos;
        this.bloqueo = Duration.ofMinutes(bloqueoMinutos);
    }

    private static String clave(String usuario) {
        return usuario.trim().toLowerCase();
    }

    /** Minutos que faltan para poder reintentar; 0 si no esta bloqueado. */
    public long minutosRestantes(String usuario) {
        Registro r = registros.get(clave(usuario));
        if (r == null || r.bloqueadoHasta() == null) {
            return 0;
        }
        Duration falta = Duration.between(Instant.now(), r.bloqueadoHasta());
        if (falta.isNegative() || falta.isZero()) {
            registros.remove(clave(usuario));
            return 0;
        }
        return Math.max(1, falta.plusSeconds(59).toMinutes());
    }

    /** Anota un fallo. Devuelve true si con este fallo la cuenta queda bloqueada. */
    public boolean fallo(String usuario) {
        boolean[] bloqueado = {false};
        registros.compute(clave(usuario), (k, r) -> {
            int fallos = (r == null ? 0 : r.fallos()) + 1;
            if (fallos >= maxIntentos) {
                bloqueado[0] = true;
                return new Registro(0, Instant.now().plus(bloqueo));
            }
            return new Registro(fallos, null);
        });
        return bloqueado[0];
    }

    public void exito(String usuario) {
        registros.remove(clave(usuario));
    }
}
