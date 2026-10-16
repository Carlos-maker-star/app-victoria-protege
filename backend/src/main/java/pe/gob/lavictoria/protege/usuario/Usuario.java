package pe.gob.lavictoria.protege.usuario;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "usuario")
public class Usuario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "rol_id")
    private Rol rol;

    @Column(nullable = false, unique = true, length = 8)
    private String dni;

    @Column(nullable = false)
    private String nombres;

    @Column(nullable = false)
    private String apellidos;

    private String email;

    private String telefono;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private boolean activo = true;

    protected Usuario() {
    }

    public Usuario(Rol rol, String dni, String nombres, String apellidos, String email,
                   String telefono, String passwordHash) {
        this.rol = rol;
        this.dni = dni;
        this.nombres = nombres;
        this.apellidos = apellidos;
        this.email = email;
        this.telefono = telefono;
        this.passwordHash = passwordHash;
    }

    public Long getId() {
        return id;
    }

    public Rol getRol() {
        return rol;
    }

    public String getDni() {
        return dni;
    }

    public String getNombres() {
        return nombres;
    }

    public String getApellidos() {
        return apellidos;
    }

    public String getEmail() {
        return email;
    }

    public String getTelefono() {
        return telefono;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public boolean isActivo() {
        return activo;
    }
}
