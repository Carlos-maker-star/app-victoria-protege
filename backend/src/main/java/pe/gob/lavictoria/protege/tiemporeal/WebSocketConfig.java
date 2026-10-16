package pe.gob.lavictoria.protege.tiemporeal;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP sobre WebSocket en /ws.
 *   /topic/monitoreo/alertas, /topic/monitoreo/unidades   -> central
 *   /user/queue/seguimiento                               -> ciudadano (su alerta)
 *   /user/queue/estado                                    -> sereno (su unidad y asignacion)
 * Los clientes solo escuchan: no pueden enviar mensajes al servidor por este canal.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final StompAuthInterceptor autenticacion;
    private final List<String> origenes;

    public WebSocketConfig(StompAuthInterceptor autenticacion, @Value("${app.cors.origenes}") List<String> origenes) {
        this.autenticacion = autenticacion;
        this.origenes = origenes;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOrigins(origenes.toArray(String[]::new));
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(autenticacion);
    }
}
