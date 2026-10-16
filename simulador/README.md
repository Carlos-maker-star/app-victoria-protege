# Simulador de La Victoria Protege

Hace el trabajo de las apps móviles (que aún no existen): crea unidades con sus serenos y ciudadanos de prueba,
genera alertas, y hace que los serenos respondan y se desplacen. Sirve para **ver la central en movimiento** y para
**medir el motor de asignación** con experimentos repetibles.

Solo necesita Node (>= 20) y el backend en marcha. No instala nada.

```bash
node simulador/simulador.mjs --modo automatico --unidades 8 --duracion 180 --semilla 42
node simulador/simulador.mjs --ayuda
```

Abre la web (`http://localhost:4200`, usuario operador) y verás las unidades moverse y las alertas avanzar.

## Qué hace, paso a paso

1. **Prepara** (la primera vez crea, las siguientes reutiliza): unidades `SIM-01…SIM-N` con su sereno
   (DNI `91000001…`) y ciudadanos (DNI `92000001…`). La clave sale de `app.seed.password` del backend.
2. **Aísla**: desactiva temporalmente las demás unidades (`SV-001`, `SV-002`…) para que no reciban alertas que
   nadie atiende. Se restauran al terminar. Con `--sin-aislar` no las toca.
3. **Fija el modo** de asignación y lo restaura al final.
4. **Genera el plan de alertas** (ver más abajo) y lo ejecuta en tiempo real.
5. **Los serenos** (un agente por unidad): ven la alerta, esperan un tiempo de reacción y aceptan, rechazan con un
   motivo o no responden; si aceptan, se desplazan en línea recta; el servidor detecta la llegada por GPS; atienden
   un rato, finalizan con un resultado y «continúan operando». Tras un rechazo o un silencio se reactivan solos.
6. **Termina**: deja de generar alertas, espera que las abiertas se cierren (`--drenaje`), cancela las que queden,
   mide cada alerta y escribe los resultados.

## Los dos modos (el experimento de la tesis)

| Modo | Quién asigna la unidad |
|---|---|
| `automatico` | El motor del sistema: la unidad disponible más cercana, con reasignación automática. |
| `manual` | Se apaga el motor y un **operador simulado** asigna «por radio»: atiende una alerta a la vez, tarda
  `--operador-demora` segundos (± `--operador-desviacion`) y, con probabilidad `--operador-error`, elige la segunda
  más cercana en vez de la primera. Es el **método base** contra el que se compara el sistema. |

Para que la comparación sea justa:

- **El plan de alertas es idéntico en los dos modos.** Hora, tipo y lugar de cada alerta se calculan *antes* de
  empezar con un generador de azar propio, derivado de `--semilla`. El resultado imprime una **huella**: si dos
  corridas tienen la misma huella, vieron exactamente las mismas alertas.
- Cada parte (alertas, posiciones iniciales, operador y cada sereno) tiene su **propia secuencia de azar**, así que
  lo que haga un sereno no cambia el plan.
- Usa los mismos `--unidades`, `--factor-velocidad`, probabilidades y semilla en ambos modos.

```bash
node simulador/simulador.mjs --modo automatico --semilla 42 --unidades 8 --duracion 300 --nombre auto-42
node simulador/simulador.mjs --modo manual     --semilla 42 --unidades 8 --duracion 300 --nombre manual-42
```

Repite con varias semillas (por ejemplo 1 a 10) y compara medias y percentiles.

## Experimento completo (varias semillas, los dos modos)

`experimento.mjs` corre automático y manual con las mismas semillas (alternando cuál va primero), y resume la
comparación en `resultados/<prefijo>-resumen.md` y `.csv`: promedio entre semillas de la media, la mediana y el p90
de cada tiempo, la diferencia manual − automático y en cuántas semillas gana el automático.

```bash
node simulador/experimento.mjs --semillas 5 --unidades 6 --duracion 240 --alertas-por-minuto 3 --prefijo exp
node simulador/experimento.mjs --solo-resumen --semillas 5 --prefijo exp   # re-genera el resumen sin correr nada
```

Tarda hasta (duración + drenaje) × semillas × 2 (con los valores de arriba, entre 40 y 80 minutos). Déjalo solo: no
uses la web ni apagues el backend mientras corre. Los tiempos solo cuentan alertas **finalizadas**; revisa también los
conteos (si un modo termina menos alertas, sus promedios no son comparables sin mirarlo).

## Resultados

En `simulador/resultados/<nombre>.json` (resumen + una fila por alerta) y `.csv` (separado por `;`, abre bien en
Excel). Por cada alerta atendida se miden, **igual que en la pantalla de Reportes**:

| Tiempo | Definición |
|---|---|
| asignación | creación de la alerta → primera unidad asignada (en `manual` incluye la demora del operador) |
| aceptación | primera asignación → aceptación final |
| llegada | creación → la unidad llega |
| atención | llegada → finalización |

Además: alertas reasignadas, escaladas a la central, y rechazos / silencios de los serenos. Las estadísticas son
n, media, mediana, percentil 90 y máximo.

## Parámetros importantes

| Opción | Por defecto | Para qué |
|---|---|---|
| `--unidades` | 8 | Tamaño de la flota |
| `--alertas-por-minuto` | 3 | Carga (proceso de Poisson) |
| `--duracion` | 120 | Segundos generando alertas |
| `--factor-velocidad` | 3 | Acorta los desplazamientos (los tiempos del servidor, como los 15 s para responder, siguen siendo reales) |
| `--p-rechazo`, `--p-sin-respuesta` | 0.10, 0.05 | Comportamiento de los serenos |
| `--semilla` | 1 | Reproducibilidad |

## Limitaciones

- **Corre en tiempo real**: 5 minutos de simulación tardan 5 minutos (más el drenaje). Por eso existe
  `--factor-velocidad`, que solo acorta los desplazamientos.
- Aunque la semilla fija el plan, **no hay dos corridas idénticas al segundo**: dependen del reloj y de la red.
  Compara promedios de varias semillas, no una sola corrida.
- Las unidades se mueven **en línea recta**, no por calles (igual que la estimación del motor).
- Los serenos simulados reaccionan con una distribución simple; no modelan cansancio, tráfico ni zonas.
- Si el simulador se corta de golpe, puede dejar el sistema en modo manual o con unidades desactivadas.
  Se arregla en la web, en **Administración → Configuración** y **Gestionar unidades**, o volviendo a ejecutarlo.
- Las unidades y usuarios `SIM-*`, `91…` y `92…` se quedan en la base de datos. Se pueden desactivar desde la web.
