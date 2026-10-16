-- Anti-abuso: un ciudadano no puede tener mas de una alerta activa a la vez.
-- Se garantiza en la base de datos para evitar condiciones de carrera.
CREATE UNIQUE INDEX uq_alerta_activa_ciudadano ON alerta (ciudadano_id)
    WHERE estado NOT IN ('FINALIZADA', 'CANCELADA');
