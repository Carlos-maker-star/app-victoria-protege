-- La Victoria Protege - modelo base
-- Coordenadas en SRID 4326 (WGS84). Distancias en metros mediante cast a geography.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------
-- Seguridad y usuarios
-- ---------------------------------------------------------------
CREATE TABLE rol (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  VARCHAR(30)  NOT NULL UNIQUE,   -- CIUDADANO, SERENO, OPERADOR, SUPERVISOR, ADMIN
    nombre  VARCHAR(60)  NOT NULL
);

CREATE TABLE usuario (
    id            BIGSERIAL PRIMARY KEY,
    rol_id        SMALLINT     NOT NULL REFERENCES rol(id),
    dni           VARCHAR(8)   NOT NULL UNIQUE,
    nombres       VARCHAR(100) NOT NULL,
    apellidos     VARCHAR(100) NOT NULL,
    email         VARCHAR(150) UNIQUE,
    telefono      VARCHAR(20),
    password_hash VARCHAR(100) NOT NULL,
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Zonas (distrito y sectores)
-- ---------------------------------------------------------------
CREATE TABLE zona (
    id       BIGSERIAL PRIMARY KEY,
    nombre   VARCHAR(100) NOT NULL,
    tipo     VARCHAR(20)  NOT NULL CHECK (tipo IN ('DISTRITO', 'SECTOR')),
    geom     geometry(MultiPolygon, 4326) NOT NULL,
    activo   BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_zona_geom ON zona USING GIST (geom);

-- ---------------------------------------------------------------
-- Unidades y serenos
-- ---------------------------------------------------------------
CREATE TABLE unidad (
    id                  BIGSERIAL PRIMARY KEY,
    codigo              VARCHAR(20) NOT NULL UNIQUE,      -- SV-001
    placa               VARCHAR(10),
    tipo                VARCHAR(30) NOT NULL DEFAULT 'CAMIONETA',
    zona_id             BIGINT REFERENCES zona(id),
    estado              VARCHAR(20) NOT NULL DEFAULT 'FUERA_DE_SERVICIO'
        CHECK (estado IN ('DISPONIBLE', 'EN_DESPLAZAMIENTO', 'EN_ATENCION', 'FUERA_DE_SERVICIO')),
    ubicacion           geometry(Point, 4326),
    ubicacion_en        TIMESTAMPTZ,
    velocidad_kmh       NUMERIC(5,1),
    activo              BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_unidad_ubicacion ON unidad USING GIST (ubicacion);
CREATE INDEX idx_unidad_estado ON unidad (estado);

CREATE TABLE sereno (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT NOT NULL UNIQUE REFERENCES usuario(id),
    unidad_id   BIGINT REFERENCES unidad(id),
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);
-- Una unidad tiene a lo sumo un sereno operando a la vez
CREATE UNIQUE INDEX uq_sereno_unidad ON sereno (unidad_id) WHERE unidad_id IS NOT NULL AND activo;

CREATE TABLE unidad_posicion (
    id            BIGSERIAL PRIMARY KEY,
    unidad_id     BIGINT NOT NULL REFERENCES unidad(id),
    alerta_id     BIGINT,                                   -- FK se agrega tras crear alerta
    ubicacion     geometry(Point, 4326) NOT NULL,
    velocidad_kmh NUMERIC(5,1),
    registrado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_unidad_posicion_unidad ON unidad_posicion (unidad_id, registrado_en DESC);

-- ---------------------------------------------------------------
-- Catalogos y parametros
-- ---------------------------------------------------------------
CREATE TABLE tipo_alerta (
    id          SMALLSERIAL PRIMARY KEY,
    codigo      VARCHAR(30)  NOT NULL UNIQUE,
    nombre      VARCHAR(60)  NOT NULL,
    icono       VARCHAR(30),
    descripcion VARCHAR(200),
    prioridad   SMALLINT     NOT NULL DEFAULT 3 CHECK (prioridad BETWEEN 1 AND 5), -- 1 = mas urgente
    activo      BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE motivo_rechazo (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  VARCHAR(40) NOT NULL UNIQUE,
    nombre  VARCHAR(100) NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE parametro (
    clave       VARCHAR(60) PRIMARY KEY,
    valor       VARCHAR(100) NOT NULL,
    descripcion VARCHAR(200)
);

-- ---------------------------------------------------------------
-- Alertas
-- ---------------------------------------------------------------
CREATE TABLE alerta (
    id                    BIGSERIAL PRIMARY KEY,
    ciudadano_id          BIGINT   NOT NULL REFERENCES usuario(id),
    tipo_alerta_id        SMALLINT NOT NULL REFERENCES tipo_alerta(id),
    descripcion           VARCHAR(500),
    ubicacion             geometry(Point, 4326) NOT NULL,   -- punto del incidente
    ubicacion_ciudadano   geometry(Point, 4326),            -- GPS del ciudadano al reportar
    direccion_referencia  VARCHAR(200),
    zona_id               BIGINT REFERENCES zona(id),       -- sector donde cae el incidente
    estado                VARCHAR(20) NOT NULL DEFAULT 'CREADA'
        CHECK (estado IN ('CREADA', 'BUSCANDO_UNIDAD', 'ASIGNADA', 'ACEPTADA', 'EN_CAMINO',
                          'LLEGO', 'EN_ATENCION', 'FINALIZADA', 'SIN_UNIDAD', 'CANCELADA')),
    resultado             VARCHAR(30)
        CHECK (resultado IN ('ATENDIDA', 'SIN_NOVEDAD', 'FALSA_ALARMA', 'DERIVADA',
                             'REQUIERE_APOYO', 'PENDIENTE', 'OTRO')),
    creada_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizada_en         TIMESTAMPTZ
);
CREATE INDEX idx_alerta_estado ON alerta (estado);
CREATE INDEX idx_alerta_creada ON alerta (creada_en DESC);
CREATE INDEX idx_alerta_ubicacion ON alerta USING GIST (ubicacion);

ALTER TABLE unidad_posicion
    ADD CONSTRAINT fk_unidad_posicion_alerta FOREIGN KEY (alerta_id) REFERENCES alerta(id);

-- Cada intento de asignar una alerta a una unidad. Reasignar = nueva fila con orden + 1.
CREATE TABLE asignacion (
    id                  BIGSERIAL PRIMARY KEY,
    alerta_id           BIGINT   NOT NULL REFERENCES alerta(id),
    unidad_id           BIGINT   NOT NULL REFERENCES unidad(id),
    orden               SMALLINT NOT NULL DEFAULT 1,
    estado              VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE_RESPUESTA'
        CHECK (estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA', 'RECHAZADA', 'SIN_RESPUESTA',
                          'CANCELADA', 'COMPLETADA')),
    motivo_rechazo_id   SMALLINT REFERENCES motivo_rechazo(id),
    motivo_detalle      VARCHAR(200),
    distancia_m         INTEGER,
    eta_segundos        INTEGER,
    asignada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    vence_en            TIMESTAMPTZ NOT NULL,                -- asignada_en + tiempo de respuesta
    respondida_en       TIMESTAMPTZ,
    llegada_en          TIMESTAMPTZ,
    finalizada_en       TIMESTAMPTZ,
    UNIQUE (alerta_id, orden)
);
-- Una alerta no puede tener dos asignaciones vigentes a la vez
CREATE UNIQUE INDEX uq_asignacion_vigente ON asignacion (alerta_id)
    WHERE estado IN ('PENDIENTE_RESPUESTA', 'ACEPTADA');
CREATE INDEX idx_asignacion_vence ON asignacion (vence_en) WHERE estado = 'PENDIENTE_RESPUESTA';
CREATE INDEX idx_asignacion_unidad ON asignacion (unidad_id);

CREATE TABLE evidencia (
    id            BIGSERIAL PRIMARY KEY,
    alerta_id     BIGINT NOT NULL REFERENCES alerta(id),
    asignacion_id BIGINT REFERENCES asignacion(id),
    origen        VARCHAR(10) NOT NULL CHECK (origen IN ('CIUDADANO', 'SERENO')),
    tipo          VARCHAR(10) NOT NULL CHECK (tipo IN ('FOTO', 'VIDEO', 'NOTA')),
    ruta_archivo  VARCHAR(300),
    observacion   VARCHAR(500),
    creado_por    BIGINT NOT NULL REFERENCES usuario(id),
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_evidencia_alerta ON evidencia (alerta_id);

-- Linea de tiempo de la alerta (alimenta el detalle y la trazabilidad)
CREATE TABLE alerta_evento (
    id          BIGSERIAL PRIMARY KEY,
    alerta_id   BIGINT NOT NULL REFERENCES alerta(id),
    tipo        VARCHAR(30) NOT NULL,   -- ALERTA_CREADA, UNIDAD_ASIGNADA, ALERTA_ACEPTADA, ...
    detalle     VARCHAR(300),
    unidad_id   BIGINT REFERENCES unidad(id),
    usuario_id  BIGINT REFERENCES usuario(id),
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerta_evento_alerta ON alerta_evento (alerta_id, creado_en);

-- ---------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------
CREATE TABLE auditoria (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT REFERENCES usuario(id),     -- NULL = accion del sistema
    accion      VARCHAR(60)  NOT NULL,
    entidad     VARCHAR(40),
    entidad_id  BIGINT,
    detalle     VARCHAR(500),
    ip          VARCHAR(45),
    dispositivo VARCHAR(150),
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditoria_fecha ON auditoria (creado_en DESC);
