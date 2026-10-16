-- Modo de asignacion: 'true' = el motor asigna solo (el sistema); 'false' = la central asigna a mano
-- (metodo base para comparar en la tesis: asignacion manual por radio).
INSERT INTO parametro (clave, valor, descripcion) VALUES
    ('asignacion_automatica', 'true', 'true: el motor asigna la unidad solo. false: la central asigna a mano (metodo base)');
