INSERT INTO rol (codigo, nombre) VALUES
    ('CIUDADANO',  'Ciudadano / Vecino'),
    ('SERENO',     'Sereno / Operador de unidad'),
    ('OPERADOR',   'Operador de central'),
    ('SUPERVISOR', 'Supervisor de serenazgo'),
    ('ADMIN',      'Administrador del sistema');

INSERT INTO tipo_alerta (codigo, nombre, icono, descripcion, prioridad) VALUES
    ('ROBO',       'Robo',                   'robo',       'Robo o asalto en curso',            1),
    ('EMERGENCIA', 'Emergencia',             'emergencia', 'Emergencia que pone en riesgo vidas', 1),
    ('INCENDIO',   'Incendio',               'incendio',   'Incendio o conato',                 1),
    ('ACCIDENTE',  'Accidente',              'accidente',  'Accidente de transito',             2),
    ('DISTURBIOS', 'Disturbios',             'disturbios', 'Riñas o desorden publico',          2),
    ('DESASTRE',   'Desastre',               'desastre',   'Desastre natural o colapso',        2),
    ('SOSPECHOSA', 'Situacion sospechosa',   'sospechosa', 'Persona o actividad sospechosa',    3),
    ('OTRO',       'Otro',                   'otro',       'Otra situacion',                    4);

INSERT INTO motivo_rechazo (codigo, nombre) VALUES
    ('OTRA_INCIDENCIA',     'Estoy atendiendo otra incidencia'),
    ('EMERGENCIA',          'Estoy atendiendo una emergencia'),
    ('UNIDAD_OCUPADA',      'Unidad ocupada'),
    ('FUERA_DE_SERVICIO',   'Unidad fuera de servicio'),
    ('SIN_DESPLAZAMIENTO',  'Imposibilidad de desplazamiento'),
    ('SIN_DISPONIBILIDAD',  'Falta de disponibilidad'),
    ('OTRO',                'Otro');

INSERT INTO parametro (clave, valor, descripcion) VALUES
    ('tiempo_respuesta_segundos', '15', 'Segundos que tiene el sereno para aceptar una alerta'),
    ('tolerancia_borde_metros',   '50', 'Margen de tolerancia fuera del limite del distrito (error de GPS)'),
    ('max_reasignaciones',        '5',  'Reasignaciones automaticas antes de escalar a la central'),
    ('radio_busqueda_metros',     '5000', 'Radio maximo para buscar unidades candidatas'),
    ('distancia_llegada_metros',  '30', 'Distancia a la alerta para marcar llegada automatica'),
    ('ubicacion_obsoleta_segundos', '120', 'Una unidad sin reportar posicion en este tiempo no es candidata');
