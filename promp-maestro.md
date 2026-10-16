Diseña el sistema integral **“La Victoria Protege”**, una plataforma tecnológica de seguridad ciudadana para la **Municipalidad Distrital de La Victoria, Chiclayo, Perú**.

El sistema debe estar compuesto por:

1. Aplicativo móvil para CIUDADANOS/VECINOS.
2. Aplicativo móvil para SERENAZGO.
3. Plataforma WEB para MONITOREO, OPERACIONES Y ADMINISTRACIÓN.
4. Backend/API central que conecte todos los componentes.
5. Sistema de geolocalización, cálculo de rutas y seguimiento en tiempo real.
6. Motor automático de asignación y reasignación de alertas.
7. Sistema de notificaciones.
8. Asistente de voz para el aplicativo de serenazgo.
9. Sistema de evidencias y trazabilidad de las intervenciones.

El diseño debe ser moderno, profesional, institucional y orientado a seguridad ciudadana. No debe parecer una aplicación genérica de delivery, taxi o redes sociales.

---

# IDENTIDAD DEL SISTEMA

Nombre:

**LA VICTORIA PROTEGE**

Subtítulo:

**Sistema inteligente de seguridad y respuesta ciudadana**

Concepto visual:

- Seguridad ciudadana.
- Cercanía con el vecino.
- Respuesta rápida.
- Geolocalización.
- Serenazgo.
- Tecnología.
- Confianza.
- Monitoreo en tiempo real.

Crear una identidad visual institucional, moderna y tecnológica.

Usar una interfaz limpia, profesional y accesible.

Priorizar:

- Excelente contraste.
- Botones grandes para acciones críticas.
- Información clara.
- Estados visuales fáciles de identificar.
- Mapas como elemento central.
- Diseño responsive.
- Accesibilidad.
- Experiencia sencilla para ciudadanos.
- Experiencia operativa y rápida para serenazgo.

Evitar:

- Diseño excesivamente futurista.
- Interfaces saturadas.
- Exceso de animaciones.
- Estética de videojuego.
- Elementos innecesarios.

---

# ROLES DEL SISTEMA

El sistema debe manejar como mínimo los siguientes roles:

### 1. CIUDADANO / VECINO

Utiliza el aplicativo móvil para:

- Registrarse.
- Validar su identidad.
- Iniciar sesión.
- Generar alertas.
- Compartir ubicación.
- Adjuntar evidencia.
- Consultar el estado de su alerta.
- Visualizar la unidad asignada.
- Seguir el desplazamiento de la unidad en tiempo real.
- Consultar el tiempo estimado de llegada.
- Consultar historial de sus alertas.

---

### 2. SERENO / OPERADOR DE UNIDAD

Utiliza el aplicativo móvil para:

- Iniciar sesión.
- Visualizar disponibilidad.
- Recibir alertas.
- Aceptar alertas.
- Rechazar/cancelar una alerta asignada indicando un motivo.
- Visualizar la ubicación del incidente.
- Obtener ruta hacia la incidencia.
- Navegar hacia el lugar.
- Utilizar asistencia por voz.
- Actualizar su estado.
- Registrar llegada.
- Registrar evidencia.
- Registrar resultado de la intervención.
- Finalizar atención.
- Continuar operando.
- Finalizar sesión.

---

### 3. OPERADOR DE CENTRAL / MONITOREO

Utiliza la plataforma web para:

- Visualizar todas las alertas.
- Visualizar unidades en tiempo real.
- Visualizar alertas pendientes.
- Visualizar alertas en proceso.
- Supervisar unidades.
- Consultar ubicación de unidades.
- Consultar historial.
- Visualizar reasignaciones.
- Supervisar tiempos de respuesta.
- Visualizar evidencias.
- Intervenir manualmente cuando sea necesario.
- Consultar estadísticas.

---

### 4. SUPERVISOR DE SERENAZGO

Debe tener funciones adicionales:

- Supervisar operadores.
- Supervisar unidades.
- Consultar intervenciones.
- Revisar evidencias.
- Revisar tiempos de respuesta.
- Consultar alertas reasignadas.
- Consultar incidencias por zona.
- Generar reportes.
- Analizar desempeño operativo.
- Consultar indicadores.

---

### 5. ADMINISTRADOR DEL SISTEMA

Debe poder:

- Administrar usuarios.
- Administrar roles.
- Administrar permisos.
- Administrar serenos.
- Administrar unidades.
- Administrar tipos de alerta.
- Administrar zonas.
- Configurar parámetros.
- Configurar tiempos de respuesta.
- Gestionar catálogos.
- Consultar auditoría.
- Administrar integraciones.
- Gestionar configuración general.

---

# APLICATIVO MÓVIL — CIUDADANO

Crear una experiencia extremadamente sencilla.

## LOGIN

Pantalla:

**LA VICTORIA PROTEGE**

Opciones:

- Iniciar sesión.
- Registrarse.
- Recuperar acceso.

El registro debe contemplar validación de identidad mediante integración con el mecanismo oficial de identidad digital/validación correspondiente.

Para el acceso posterior:

- Huella digital.
- PIN/clave.

No pedir al ciudadano múltiples pasos para generar una alerta.

---

# HOME DEL CIUDADANO

La pantalla principal debe tener como elemento central:

**¿Qué está sucediendo?**

Mostrar botones grandes:

- 🚨 Robo
- 🔥 Incendio
- 👥 Disturbios
- 🚗 Accidente
- 🌪️ Desastre
- ⚠️ Emergencia
- 🏠 Situación sospechosa
- OTRO

Incluir un botón principal:

**REPORTAR ALERTA**

---

# CREACIÓN DE ALERTA

Flujo:

1. Seleccionar tipo de alerta.
2. Obtener ubicación GPS.
3. Mostrar ubicación en mapa.
4. Permitir confirmar/corregir ubicación.
5. Permitir agregar fotografía o video.
6. Permitir agregar descripción.
7. Confirmar reporte.
8. Enviar alerta.

Una vez enviada, mostrar:

**Alerta enviada correctamente**

---

# ESTADOS DE LA ALERTA PARA EL CIUDADANO

El ciudadano NO debe ver información operacional compleja.

Debe mostrar únicamente información relevante.

### Estado 1

**Asignando unidad a tu alerta**

Mostrar:

- Animación discreta.
- Mapa.
- Ubicación del incidente.

### Estado 2

**Unidad asignada**

Mostrar:

- Unidad asignada.
- Mapa.
- Estado.

### Estado 3

**La unidad está en camino**

Mostrar:

- Unidad aproximándose.
- Ubicación en tiempo real.
- Ruta.
- Distancia.
- Tiempo estimado de llegada.

Ejemplo:

**La unidad está en camino**

**Llegada estimada: 04 min**

### Estado 4

**La unidad llegó**

### Estado 5

**Atención en proceso**

### Estado 6

**Alerta atendida**

Mostrar resumen:

- Tipo de alerta.
- Fecha.
- Hora.
- Resultado.

---

# APLICATIVO MÓVIL — SERENAZGO

La interfaz debe estar diseñada para ser utilizada mientras el sereno se encuentra operativo.

Priorizar:

- Botones grandes.
- Información inmediata.
- Mínima interacción.
- Lectura rápida.
- Comandos por voz.

---

# LOGIN SERENAZGO

Mostrar:

**LA VICTORIA PROTEGE**

Métodos:

- Huella.
- PIN/clave.

Mostrar posteriormente:

**Unidad: SV-001**

**Estado: Disponible**

---

# HOME SERENAZGO

Mostrar:

- Estado actual.
- Unidad.
- Nombre del operador.
- Zona.
- GPS.
- Estado de conexión.

Estados:

🟢 Disponible  
🟠 En desplazamiento  
🔴 En atención  
⚫ Fuera de servicio

Botón:

**Cambiar estado**

---

# RECEPCIÓN DE ALERTA

Cuando el motor asigna una alerta:

Mostrar una pantalla prioritaria:

**NUEVA ALERTA**

Tipo:

**ROBO**

Distancia:

**1.2 km**

Tiempo estimado:

**04 min**

Ubicación:

Mapa.

Mostrar contador:

**15 segundos para responder**

Botones grandes:

**ACEPTAR ALERTA**

**NO PUEDO ATENDER**

---

# NO PUEDO ATENDER

Si el sereno no puede atender:

Mostrar:

**Selecciona el motivo**

Opciones predeterminadas:

- Estoy atendiendo otra incidencia.
- Estoy atendiendo una emergencia.
- Unidad ocupada.
- Unidad fuera de servicio.
- Imposibilidad de desplazamiento.
- Falta de disponibilidad.
- Otro.

Si selecciona “Otro”, permitir una breve descripción.

Al confirmar:

**Alerta enviada para reasignación**

La alerta NO se elimina.

El sistema debe buscar automáticamente otra unidad disponible.

---

# REASIGNACIÓN

Diseñar visualmente el proceso:

**Unidad no disponible**

↓

**Buscando otra unidad**

↓

**Nueva unidad asignada**

↓

**Nueva unidad en camino**

El ciudadano debe continuar viendo su alerta sin perder el seguimiento.

---

# ACEPTAR ALERTA

Una vez aceptada:

Mostrar:

**ALERTA ACEPTADA**

Luego:

**Ruta hacia la incidencia**

Mostrar:

- Mapa.
- Ubicación actual.
- Destino.
- Ruta recomendada.
- Distancia.
- Tiempo estimado.
- Actualización de posición.

---

# NAVEGACIÓN

Crear una interfaz similar conceptualmente a una aplicación de navegación, pero con identidad de La Victoria Protege.

Mostrar:

- Ruta.
- Próxima maniobra.
- Distancia.
- Tiempo estimado.
- Ubicación de la incidencia.

No copiar visualmente ninguna aplicación comercial.

---

# ASISTENTE DE VOZ

Integrar un asistente de voz operativo.

Ejemplos de comandos:

**“Enciende las sirenas”**

**“Toma la siguiente ruta”**

**“Finalizar atención”**

**“Continuar operando”**

**“Cancelar atención”**

El sistema debe mostrar confirmación visual cuando una acción crítica sea ejecutada.

Ejemplo:

🎙️ Comando detectado

**“Enciende las sirenas”**

[CONFIRMAR]

---

# LLEGADA A LA INCIDENCIA

Cuando el GPS determine llegada:

Mostrar:

**HAS LLEGADO A LA ALERTA**

Botones:

**REGISTRAR ATENCIÓN**

**REGISTRAR EVIDENCIA**

---

# REGISTRO DE EVIDENCIA

Permitir:

- Tomar fotografía.
- Registrar video cuando corresponda.
- Agregar observación.
- Registrar resultado.
- Registrar hora de llegada.
- Registrar hora de finalización.

Tipos de resultado:

- Atendida.
- Sin novedad.
- Falsa alarma.
- Derivada a otra entidad.
- Requiere apoyo.
- Pendiente.
- Otro.

---

# FINALIZAR ATENCIÓN

Antes de cerrar:

Mostrar resumen:

**Tipo:** Robo

**Hora de llegada:** 14:25

**Evidencias:** 3

**Observación:** ...

Botón:

**FINALIZAR ATENCIÓN**

Después:

**Atención finalizada correctamente**

---

# CONTINUAR OPERANDO

Después de finalizar una atención:

Mostrar:

**¿Deseas continuar operando?**

Opciones:

**CONTINUAR OPERANDO**

**FINALIZAR SESIÓN**

Si continúa:

Estado:

🟢 **DISPONIBLE**

El sistema puede asignarle una nueva alerta.

---

# PLATAFORMA WEB — CENTRAL DE MONITOREO

Diseñar un dashboard profesional de seguridad ciudadana.

El mapa debe ser el elemento visual principal.

---

# DASHBOARD

Mostrar tarjetas:

**Alertas activas**

**Unidades disponibles**

**Unidades en ruta**

**Unidades en atención**

**Alertas atendidas**

**Tiempo promedio de respuesta**

**Tiempo promedio de llegada**

**Alertas reasignadas**

---

# MAPA OPERATIVO

Mostrar en tiempo real:

🚨 Alertas

🚔 Unidades

📍 Ubicaciones

Diferenciar visualmente:

- Alerta pendiente.
- Alerta asignada.
- Unidad desplazándose.
- Atención en proceso.
- Atención finalizada.

Permitir seleccionar una alerta y abrir:

- Tipo.
- Ubicación.
- Hora.
- Ciudadano.
- Unidad asignada.
- Sereno.
- Estado.
- Tiempo transcurrido.

---

# MONITOREO DE UNIDADES

Crear vista:

**Unidades en tiempo real**

Cada unidad debe mostrar:

- Código.
- Sereno.
- Estado.
- Ubicación.
- Velocidad, si corresponde.
- Alerta actual.
- Tiempo en atención.

Filtros:

- Disponibles.
- En ruta.
- En atención.
- Fuera de servicio.

---

# GESTIÓN DE ALERTAS

Crear tabla:

Columnas:

- ID.
- Tipo.
- Fecha.
- Hora.
- Ubicación.
- Estado.
- Unidad.
- Sereno.
- Tiempo de respuesta.
- Tiempo de llegada.
- Resultado.

Filtros:

- Tipo.
- Estado.
- Fecha.
- Zona.
- Unidad.
- Sereno.

---

# DETALLE DE ALERTA

Crear una vista completa con:

## Información de alerta

- ID.
- Tipo.
- Descripción.
- Ubicación.
- Fecha.
- Hora.
- Ciudadano.

## Unidad

- Código.
- Sereno.
- Estado.
- Ubicación actual.

## Seguimiento

Mostrar mapa con:

- Punto de origen.
- Incidente.
- Recorrido.
- Unidad.

## Evidencias

- Fotografías.
- Videos.
- Observaciones.

## Historial

Crear timeline:

**Alerta creada**

↓

**Unidad asignada**

↓

**Alerta aceptada**

↓

**Ruta iniciada**

↓

**Unidad llegó**

↓

**Evidencia registrada**

↓

**Atención finalizada**

---

# GESTIÓN DE REASIGNACIONES

Crear una sección específica:

**Alertas reasignadas**

Mostrar:

- Alerta.
- Primera unidad.
- Motivo de cancelación/rechazo.
- Hora.
- Segunda unidad.
- Tiempo hasta nueva asignación.
- Estado final.

Esto debe permitir analizar por qué una alerta tuvo que ser reasignada.

---

# GESTIÓN DE SERENOS

Crear módulo:

**Serenos**

Funciones:

- Crear.
- Editar.
- Activar/desactivar.
- Asignar unidad.
- Consultar estado.
- Consultar historial.
- Consultar intervenciones.

---

# GESTIÓN DE UNIDADES

Crear módulo:

**Unidades**

Datos:

- Código.
- Placa.
- Tipo.
- Estado.
- Sereno asignado.
- Zona.
- Última ubicación.
- Estado operativo.

---

# GESTIÓN DE TIPOS DE ALERTA

Permitir configurar:

- Nombre.
- Icono.
- Descripción.
- Prioridad.
- Estado activo/inactivo.

---

# ZONAS OPERATIVAS

Permitir administrar:

- Zonas.
- Sectores.
- Áreas de cobertura.
- Unidades asignadas.

Mostrar las zonas sobre el mapa.

---

# REPORTES Y ESTADÍSTICAS

Crear módulo:

**Reportes**

Indicadores:

- Número de alertas.
- Alertas por tipo.
- Alertas por zona.
- Tiempo promedio de asignación.
- Tiempo promedio de aceptación.
- Tiempo promedio de llegada.
- Tiempo promedio de atención.
- Número de reasignaciones.
- Motivos de reasignación.
- Alertas atendidas.
- Alertas canceladas.
- Alertas sin respuesta.

Crear gráficos:

- Alertas por día.
- Alertas por hora.
- Alertas por tipo.
- Alertas por zona.
- Tiempo promedio de respuesta.
- Actividad de unidades.

---

# AUDITORÍA

Registrar acciones importantes:

- Usuario.
- Acción.
- Fecha.
- Hora.
- IP/dispositivo cuando corresponda.
- Registro afectado.

Ejemplo:

**14:21:05 — Sistema asignó alerta #00152 a unidad SV-002**

**14:21:17 — Sereno aceptó alerta #00152**

**14:25:42 — Unidad SV-002 llegó**

---

# NOTIFICACIONES

Diseñar notificaciones para:

### Ciudadano

- Alerta recibida.
- Unidad asignada.
- Unidad en camino.
- Unidad próxima a llegar.
- Atención finalizada.

### Sereno

- Nueva alerta.
- Reasignación.
- Cambio de estado.
- Nueva instrucción operativa.

### Central

- Nueva alerta.
- Alerta sin respuesta.
- Reasignación.
- Unidad fuera de servicio.
- Incidencia crítica.

---

# MOTOR DE ASIGNACIÓN

Representar visualmente y conceptualmente el siguiente flujo:

CIUDADANO REPORTA

↓

OBTENER UBICACIÓN

↓

IDENTIFICAR UNIDADES DISPONIBLES

↓

CALCULAR DISTANCIA Y TIEMPO ESTIMADO

↓

SELECCIONAR UNIDAD CANDIDATA

↓

ASIGNAR ALERTA

↓

15 SEGUNDOS PARA RESPONDER

↓

SI ACEPTA

→ INICIAR ATENCIÓN

SI NO PUEDE

→ REGISTRAR MOTIVO

→ REASIGNAR

SI NO RESPONDE

→ REASIGNAR

---

# REGLA FUNDAMENTAL

Una alerta nunca debe perderse simplemente porque una unidad no puede atenderla.

Siempre debe existir:

**Asignación → respuesta → atención o reasignación**

---

# DISEÑO RESPONSIVE

Crear:

### Mobile

Para:

- Ciudadano.
- Sereno.

### Desktop / Tablet

Para:

- Central.
- Supervisor.
- Administrador.

La interfaz debe adaptarse correctamente a diferentes tamaños.

---

# PANTALLAS QUE DEBES DISEÑAR

Genera como mínimo los siguientes diseños:

## CIUDADANO

1. Splash.
2. Login.
3. Registro.
4. Validación de identidad.
5. Home.
6. Selección de alerta.
7. Confirmación de ubicación.
8. Adjuntar evidencia.
9. Alerta enviada.
10. Asignando unidad.
11. Unidad asignada.
12. Unidad en camino.
13. Seguimiento en mapa.
14. Atención en proceso.
15. Atención finalizada.
16. Historial.
17. Perfil.
18. Configuración.

## SERENAZGO

1. Login.
2. Inicio.
3. Estado operativo.
4. Nueva alerta.
5. Cuenta regresiva de 15 segundos.
6. Aceptar alerta.
7. No puedo atender.
8. Selección de motivo.
9. Reasignación.
10. Ruta.
11. Navegación.
12. Asistente de voz.
13. Llegada.
14. Registro de evidencia.
15. Registro de resultado.
16. Finalización.
17. Continuar operando.
18. Finalizar sesión.
19. Historial.

## WEB

1. Login.
2. Dashboard.
3. Mapa operativo.
4. Alertas.
5. Detalle de alerta.
6. Seguimiento de unidad.
7. Reasignaciones.
8. Unidades.
9. Serenos.
10. Zonas.
11. Tipos de alerta.
12. Reportes.
13. Estadísticas.
14. Auditoría.
15. Usuarios.
16. Roles y permisos.
17. Configuración.

---

# EXPERIENCIA DE USUARIO

La aplicación ciudadana debe sentirse:

**Simple + rápida + confiable**

La aplicación de serenazgo:

**Operativa + rápida + clara**

La plataforma web:

**Profesional + analítica + centralizada**

El sistema completo debe transmitir:

**“Reportar es fácil. Responder es rápido. La atención es trazable.”**

---

# IMPORTANTE PARA EL PROTOTIPO

No diseñar únicamente pantallas aisladas.

Construir un prototipo navegable donde se pueda simular el flujo completo:

**Ciudadano crea alerta**

→

**Sistema busca unidad**

→

**Sereno recibe alerta**

→

**Cuenta regresiva de 15 segundos**

→

**Sereno acepta**

→

**Ciudadano ve “La unidad está en camino”**

→

**Mapa muestra desplazamiento**

→

**Sereno llega**

→

**Registra evidencia**

→

**Finaliza atención**

→

**Sistema pregunta “¿Continuar operando?”**

→

**Sereno vuelve a disponible**

También simular el flujo alternativo:

**Ciudadano crea alerta**

→

**Unidad A recibe**

→

**Unidad A selecciona “No puedo atender”**

→

**Selecciona motivo**

→

**Sistema reasigna**

→

**Unidad B recibe**

→

**Unidad B acepta**

→

**Ciudadano continúa viendo el proceso sin perder su alerta.**

Diseña todo el sistema con una identidad visual coherente bajo la marca:

# LA VICTORIA PROTEGE

**Sistema inteligente de seguridad y respuesta ciudadana**

El resultado debe parecer un producto real que podría ser presentado ante la **Municipalidad Distrital de La Victoria, Chiclayo**, no solamente un mockup académico.
