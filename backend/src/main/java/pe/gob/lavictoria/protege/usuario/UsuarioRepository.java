package pe.gob.lavictoria.protege.usuario;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {

    Optional<Usuario> findByDni(String dni);

    Optional<Usuario> findByEmailIgnoreCase(String email);

    boolean existsByDni(String dni);

    boolean existsByEmailIgnoreCase(String email);
}
