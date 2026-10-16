package pe.gob.lavictoria.protege.tiemporeal;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.stereotype.Component;
import pe.gob.lavictoria.protege.usuario.Rol;

/**
 * El navegador no puede enviar cabeceras en el handshake de WebSocket, asi que el JWT viaja en el
 * frame STOMP CONNECT (cabecera Authorization). Aqui se valida y se decide quien puede suscribirse a que.
 */
@Component
public class StompAuthInterceptor implements ChannelInterceptor {

    private final JwtDecoder decoder;
    private final JwtAuthenticationConverter conversor;

    public StompAuthInterceptor(JwtDecoder decoder, JwtAuthenticationConverter conversor) {
        this.decoder = decoder;
        this.conversor = conversor;
    }

    @Override
    public Message<?> preSend(Message<?> mensaje, MessageChannel canal) {
        StompHeaderAccessor acc = MessageHeaderAccessor.getAccessor(mensaje, StompHeaderAccessor.class);
        if (acc == null || acc.getCommand() == null) {
            return mensaje;
        }
        StompCommand comando = acc.getCommand();
        if (comando == StompCommand.CONNECT) {
            acc.setUser(autenticar(acc.getFirstNativeHeader("Authorization")));
        } else if (comando == StompCommand.SUBSCRIBE) {
            autorizarSuscripcion(acc.getUser() instanceof Authentication a ? a : null, acc.getDestination());
        } else if (comando == StompCommand.SEND) {
            throw new MessageDeliveryException("Este canal es solo de lectura");
        }
        return mensaje;
    }

    private Authentication autenticar(String cabecera) {
        if (cabecera == null || !cabecera.startsWith("Bearer ")) {
            throw new MessageDeliveryException("Falta el token de autenticacion");
        }
        try {
            Jwt jwt = decoder.decode(cabecera.substring(7));
            return conversor.convert(jwt);
        } catch (JwtException e) {
            throw new MessageDeliveryException("Token invalido o vencido");
        }
    }

    private void autorizarSuscripcion(Authentication auth, String destino) {
        if (auth == null || destino == null) {
            throw new MessageDeliveryException("No autenticado");
        }
        boolean permitido;
        if (destino.startsWith("/topic/monitoreo/")) {
            permitido = tieneRol(auth, Rol.OPERADOR) || tieneRol(auth, Rol.SUPERVISOR) || tieneRol(auth, Rol.ADMIN);
        } else if (destino.equals("/user/queue/seguimiento")) {
            permitido = tieneRol(auth, Rol.CIUDADANO);
        } else if (destino.equals("/user/queue/estado")) {
            permitido = tieneRol(auth, Rol.SERENO);
        } else {
            permitido = false;
        }
        if (!permitido) {
            throw new MessageDeliveryException("No tienes permiso para suscribirte a " + destino);
        }
    }

    private static boolean tieneRol(Authentication auth, String rol) {
        return auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + rol));
    }
}
