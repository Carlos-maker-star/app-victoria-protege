package pe.gob.lavictoria.protege.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import pe.gob.lavictoria.protege.usuario.Rol;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain filtros(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/auth/login", "/api/auth/registro").permitAll()
                        // El handshake WebSocket no admite cabeceras; el JWT se valida en el frame STOMP CONNECT.
                        .requestMatchers("/ws/**").permitAll()
                        // Documentacion de la API (desactivable con APP_DOCS=false)
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/api/admin/**").hasRole(Rol.ADMIN)
                        .requestMatchers("/api/monitoreo/**")
                        .hasAnyRole(Rol.OPERADOR, Rol.SUPERVISOR, Rol.ADMIN)
                        .requestMatchers("/api/supervision/**").hasAnyRole(Rol.SUPERVISOR, Rol.ADMIN)
                        .requestMatchers("/api/sereno/**").hasRole(Rol.SERENO)
                        .requestMatchers("/api/ciudadano/**").hasRole(Rol.CIUDADANO)
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(conversorRoles())));
        return http.build();
    }

    /** El claim "rol" del token se convierte en la autoridad ROLE_xxx. Lo usan HTTP y WebSocket. */
    @Bean
    JwtAuthenticationConverter conversorRoles() {
        JwtGrantedAuthoritiesConverter autoridades = new JwtGrantedAuthoritiesConverter();
        autoridades.setAuthoritiesClaimName("rol");
        autoridades.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter conversor = new JwtAuthenticationConverter();
        conversor.setJwtGrantedAuthoritiesConverter(autoridades);
        return conversor;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecretKey claveJwt(@Value("${app.jwt.secret}") String secreto) {
        if (secreto.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("app.jwt.secret debe tener al menos 32 caracteres");
        }
        return new SecretKeySpec(secreto.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey clave) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(clave));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey clave) {
        return NimbusJwtDecoder.withSecretKey(clave).macAlgorithm(MacAlgorithm.HS256).build();
    }

    /** El nombre del bean importa: Spring Security busca "corsConfigurationSource" para aplicar CORS. */
    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.origenes}") List<String> origenes) {
        CorsConfiguration c = new CorsConfiguration();
        c.setAllowedOrigins(origenes);
        c.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        c.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        UrlBasedCorsConfigurationSource fuente = new UrlBasedCorsConfigurationSource();
        fuente.registerCorsConfiguration("/**", c);
        return fuente;
    }
}
