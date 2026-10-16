package pe.gob.lavictoria.protege.usuario;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "rol")
public class Rol {

    public static final String CIUDADANO = "CIUDADANO";
    public static final String SERENO = "SERENO";
    public static final String OPERADOR = "OPERADOR";
    public static final String SUPERVISOR = "SUPERVISOR";
    public static final String ADMIN = "ADMIN";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Short id;

    @Column(nullable = false, unique = true)
    private String codigo;

    @Column(nullable = false)
    private String nombre;

    protected Rol() {
    }

    public Short getId() {
        return id;
    }

    public String getCodigo() {
        return codigo;
    }

    public String getNombre() {
        return nombre;
    }
}
