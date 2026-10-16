package pe.gob.lavictoria.protege.auth;

import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import pe.gob.lavictoria.protege.usuario.Usuario;

@Service
public class JwtService {

    private final JwtEncoder encoder;
    private final Duration expiracion;

    public JwtService(JwtEncoder encoder, @Value("${app.jwt.expiracion-horas}") long horas) {
        this.encoder = encoder;
        this.expiracion = Duration.ofHours(horas);
    }

    public TokenResponse emitir(Usuario u) {
        Instant ahora = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("la-victoria-protege")
                .subject(String.valueOf(u.getId()))
                .issuedAt(ahora)
                .expiresAt(ahora.plus(expiracion))
                .claim("rol", u.getRol().getCodigo())
                .claim("dni", u.getDni())
                .claim("nombre", u.getNombres() + " " + u.getApellidos())
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return new TokenResponse(token, "Bearer", expiracion.toSeconds(), UsuarioResponse.de(u));
    }
}
