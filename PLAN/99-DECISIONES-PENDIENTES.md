# 📓 Decisiones Pendientes y Backlog

> **Este archivo es el "estacionamiento" del proyecto.**
> Ideas, decisiones pendientes, dudas técnicas y cosas que aparecieron y todavía no se priorizaron.

---

## 🎯 Cómo usar este archivo

Cuando aparezca una idea o decisión **fuera del scope actual**, anotala acá inmediatamente. Mejor anotarla y olvidarla, que perderla en la memoria.

**Formato sugerido por entrada:**

```markdown
### YYYY-MM-DD — [TAG] Título corto

**Origen:** dónde apareció la idea (charla con X, debugging Y, etc.)

**Descripción:** qué es, en 2-3 frases.

**Pros:** por qué hacerlo.

**Contras:** por qué NO hacerlo (o riesgos).

**Estado:** Por evaluar | Decidido (con detalle) | Descartado | Implementado
```

**Tags útiles:** `[FEATURE]`, `[REFACTOR]`, `[TECH-DEBT]`, `[BUG]`, `[UX]`, `[BIZ]`, `[INFRA]`

---

## 🔵 Decisiones pendientes de evaluar

### 2026-05-24 — [TECH-DEBT] Configurar CORS restrictivo en producción

**Origen:** revisión inicial del estado del proyecto.

**Descripción:** Actualmente `allow_origins=["*"]` en `main.py`. Esto significa que cualquier dominio puede hacer requests a la API. Funciona para desarrollo pero en producción es un riesgo de seguridad.

**Pros:** Mejora la postura de seguridad. Práctica estándar.

**Contras:** Tiempo de configuración. Si Vercel cambia el dominio, hay que actualizar.

**Estado:** Por evaluar — considerar antes del primer release público.

---

### 2026-05-24 — [TECH-DEBT] Implementar rate limiting

**Origen:** revisión inicial.

**Descripción:** No hay rate limiting a nivel aplicación. Cuando haya usuarios reales, podría haber abuso (registro masivo, fuerza bruta en login).

**Pros:** Protección contra abuso. Evita costos en infraestructura.

**Contras:** Complejidad adicional. Falsos positivos pueden molestar a usuarios legítimos.

**Estado:** Por evaluar — considerar cuando haya más de 50 usuarios activos.

---

### 2026-05-24 — [BUG] Arreglar test_register_seeds_categories_and_concepts

**Origen:** revisión inicial.

**Descripción:** El test espera 10 categorías semilla pero hay 13 (se agregaron "Educación" y otras). El fix es trivial: actualizar el assert o hacer la cantidad dinámica.

**Pros:** Tener pytest en verde es un baseline importante.

**Contras:** Ninguno relevante.

**Estado:** Por hacer — tarea rápida, 5 minutos.

**Resolución sugerida:**
```python
# Antes
assert len(categories) == 10

# Después (más resiliente)
from app.core.seeds import DEFAULT_CATEGORIES
assert len(categories) == len(DEFAULT_CATEGORIES)
```

---

### 2026-05-24 — [REFACTOR] Dividir importacion_service.py

**Origen:** revisión inicial. El archivo tiene ~1900 líneas.

**Descripción:** El servicio de importación contiene 10 parsers + lógica de detección + deduplicación + auto-categorización + persistencia. Es un god service.

**Pros:** Más mantenible. Más testeable. Cada parser se puede modificar sin riesgo de romper otros.

**Contras:** Trabajo grande. Mover código siempre tiene riesgo de regresiones.

**Estado:** Por evaluar — vale la pena hacerlo, pero NO mientras se trabaja en features nuevas.

**Plan sugerido:**
- Crear carpeta `app/parsers/` con un archivo por banco
- Interfaz común `BankParser` abstracta
- `importacion_service.py` queda solo con orquestación
- Tests específicos por parser

---

### 2026-05-24 — [UX] Considerar "hogar favorito" / "hogar activo"

**Origen:** discusión sobre múltiples hogares por usuario.

**Descripción:** Si un usuario tiene 3 hogares (familia + pareja + roommates), debería poder elegir uno como "default" para que aparezca primero al entrar.

**Pros:** UX más fluida para usuarios con múltiples hogares.

**Contras:** Otra opción de configuración, más complejidad.

**Estado:** Por evaluar — implementar después de las features principales.

---

### 2026-05-24 — [FEATURE] Patrimonio neto del hogar

**Origen:** discusión sobre análisis del hogar.

**Descripción:** Hoy se muestra patrimonio personal. Sería útil mostrar patrimonio combinado del hogar (suma de saldos de cuentas marcadas como del hogar).

**Pros:** Análisis útil para parejas y familias.

**Contras:** Requiere marcar cuentas como "del hogar", lo cual abre debate sobre qué significa exactamente.

**Estado:** Por evaluar — depende de cómo se modele "cuenta del hogar".

---

### 2026-05-24 — [INFRA] Configurar logging estructurado

**Origen:** revisión inicial. No hay logging configurado.

**Descripción:** Solo logs de uvicorn (access). Cuando algo falla en producción, no hay forma de debuggear.

**Pros:** Debugging mucho más fácil. Posibilidad de alertas.

**Contras:** Setup time.

**Estado:** Por evaluar — necesario antes de tener muchos usuarios.

**Stack sugerido:** Python `logging` standard + JSON formatter + envío a servicio (Sentry, Datadog, o solo stdout para que Render lo capture).

---

### 2026-05-24 — [FEATURE] Recordatorios y notificaciones por email

**Origen:** discusión de roadmap.

**Descripción:** Notificar al usuario cuando:
- Una transacción del hogar fue marcada para revisar
- Una meta financiera está cerca de cumplirse
- Una factura/cuota se vence pronto

**Pros:** Aumenta engagement. Diferencial vs apps que solo viven en el navegador.

**Contras:** Requiere infraestructura de email (Resend, SendGrid). Costo bajo pero existente.

**Estado:** Por evaluar — implementar cuando haya usuarios activos para que tenga sentido.

---

### 2026-05-24 — [BIZ] Modelo de monetización (freemium)

**Origen:** discusión estratégica.

**Descripción:** Definir qué features son gratis y cuáles premium:

Sugerencia inicial:
- **Free:** 1 cuenta, transacciones ilimitadas, 1 hogar, dashboard básico
- **Premium (~USD 4-5/mes):** múltiples cuentas, importación bancaria, hogares ilimitados, analytics avanzados, exportación PDF

**Estado:** Por evaluar — solo aplica cuando tengas usuarios validados que digan "pagaría por esto".

---

### 2026-05-24 — [FEATURE] Suscripciones recurrentes detectadas

**Origen:** discusión de ideas para Fluxo.

**Descripción:** Detectar automáticamente gastos que se repiten cada mes (Netflix, Spotify, gimnasio) y mostrarlos en una sección aparte: "Tenés X suscripciones por $Y/mes".

**Pros:** Feature que "vuela la cabeza" cuando se ve por primera vez.

**Contras:** Requiere heurística confiable. Falsos positivos pueden molestar.

**Estado:** Por evaluar — implementar después del MVP de hogares.

---

### 2026-05-24 — [UX] Modo "envelope" / sobres para presupuestos

**Origen:** discusión de ideas para Fluxo.

**Descripción:** Permitir al usuario "apartar" plata mentalmente para distintas categorías al inicio del mes. Cada gasto descuenta del sobre correspondiente. Método YNAB clásico.

**Pros:** Hay gente que quiere control estricto y este método funciona.

**Contras:** Modelo mental complejo. No es para todo el mundo.

**Estado:** Por evaluar — consultar con beta testers si lo piden.

---

### 2026-05-24 — [INFRA] Migrar a dominio propio

**Origen:** discusión sobre profesionalismo del producto.

**Descripción:** El deploy actual está en `fluxo-sage.vercel.app`. Comprar `fluxo.app` o similar y configurarlo en Vercel.

**Pros:** Profesionalismo. Marca. Email profesional.

**Contras:** Costo anual (~USD 12-20).

**Estado:** Por hacer — recomendado antes del lanzamiento público.

---

### 2026-05-24 — [FEATURE] Modo de aprendizaje guiado (onboarding)

**Origen:** discusión sobre UX inicial.

**Descripción:** Cuando un usuario nuevo entra, hacer un tour guiado: crear primera cuenta, primera transacción, etc.

**Pros:** Reduce abandono temprano.

**Contras:** Trabajo de UI considerable.

**Estado:** Por evaluar — implementar antes de un lanzamiento público con marketing.

---

## ✅ Decisiones tomadas (registro histórico)

### 2026-05-24 — [ARQUITECTURA] Múltiples hogares por usuario sin concepto "Grupo"

**Decisión:** Un usuario puede pertenecer a múltiples hogares. NO se crea concepto adicional "Grupo".

**Razón:** El modelo de Hogar ya soporta esto (HouseholdMember sin restricción única). Una pareja es simplemente un Hogar de 2 personas. Una familia es un Hogar de 4 personas. La privacidad se da naturalmente (un usuario solo ve los hogares donde es miembro).

**Documentado en:** `features/F03-tipos-de-hogar.md`

---

### 2026-05-24 — [ARQUITECTURA] Personal es la fuente de verdad

**Decisión:** Toda transacción siempre pertenece a un usuario individual. El hogar es una capa de análisis encima, no un reemplazo.

**Razón:** Modelo más limpio. Borrar del hogar NO borra del personal. Borrar del personal cascadea. La liquidación se hace al final del mes para balancear quién pagó qué.

**Documentado en:** `01-PRINCIPIOS-INMUTABLES.md` (P6)

---

### 2026-05-24 — [FEATURE] Hogares con configuración de tipo y análisis

**Decisión:** Cada hogar tiene 2 dimensiones configurables:
- **split_method:** EQUAL | PROPORTIONAL | CUSTOM
- **analysis_level:** EXPENSES_ONLY | EXPENSES_AND_GOALS | FULL

**Razón:** Distintos tipos de hogares tienen distintas dinámicas. Una pareja unida vs compañeros de cuarto vs familia con hijos tienen necesidades distintas.

**Documentado en:** `features/F03-tipos-de-hogar.md`

---

### 2026-05-24 — [UX] Borrado granular con toggle

**Decisión:** Al borrar una transacción:
- Si se borra desde Personal → cascada a todos los hogares (con confirmación que muestra cuáles).
- Si se borra desde un Hogar → solo se quita de ese hogar.

**Razón:** Refleja el modelo "Personal es fuente de verdad". Permite corregir clasificaciones sin perder datos.

**Documentado en:** `features/F02-borrado-granular.md`

---

### 2026-05-24 — [UX] Tope de presupuesto como alerta, no restricción

**Decisión:** Cuando un usuario supera su presupuesto configurado, el sistema alerta pero NO impide registrar la transacción.

**Razón:** El software debe registrar la realidad. Si impide registrar gastos reales, el usuario abandona el sistema y pierde el dato.

**Documentado en:** `01-PRINCIPIOS-INMUTABLES.md` (P14)

---

### 2026-05-24 — [TECH] NO usar IA externa en parsers

**Decisión:** Los parsers bancarios usan heurísticas determinísticas, NO LLMs.

**Razón:** 
- Datos bancarios son sensibles (no enviar a terceros).
- Determinismo: mismo input → mismo output.
- Sin costos variables.
- Sin dependencia de APIs externas.

**Documentado en:** decisión técnica del proyecto.

---

### 2026-05-24 — [FEATURE] Sistema de revisión colaborativa

**Decisión:** Implementar mecanismo de "🚩 Marcar para revisar" en transacciones del hogar. Mensaje privado entre quien marcó y el autor. Reduce conflictos cara a cara.

**Razón:** Caso de uso real validado con beta tester (la pareja con hijo). Diferencial competitivo.

**Documentado en:** `features/F06-sistema-revision-colaborativa.md`

---

## 🗑 Ideas descartadas

### 2026-05-24 — [DESCARTADO] Subgrupos jerárquicos dentro de Hogares

**Por qué se descartó:** Inicialmente se consideró crear un concepto "Grupo" como subgrupo dentro de un Hogar. Se descartó porque agregar el concepto "Grupo" creaba complejidad innecesaria cuando "Hogar de N personas" ya resuelve el caso.

**Reemplazado por:** Múltiples hogares por usuario sin jerarquía.

---

### 2026-05-24 — [DESCARTADO] Integración con Open Banking uruguayo

**Por qué se descartó (por ahora):** Open Banking en Uruguay está en fase muy temprana. Los bancos no tienen APIs públicas. La importación por CSV/Excel/PDF cubre el caso de uso actual.

**Reactivar cuando:** El BCU formalice estándares de Open Banking en Uruguay.

---

### 2026-05-24 — [DESCARTADO] Configuración exótica de hogares

**Por qué se descartó (por ahora):** Algunas ideas como "aprobaciones de transacciones antes de contar", "tope de gasto con bloqueo", "categorías restringidas por hogar", etc. Son features que pocos usuarios pedirían y agregan mucha complejidad.

**Reactivar si:** Múltiples usuarios reales piden la misma cosa.

---

## 📊 Métricas del backlog

```
Total ítems en este archivo: 17
  Por evaluar: 12
  Decididos: 7
  Descartados: 3

Por categoría:
  [TECH-DEBT]: 3
  [REFACTOR]: 1
  [BUG]: 1
  [UX]: 3
  [FEATURE]: 5
  [INFRA]: 2
  [BIZ]: 1
  [ARQUITECTURA]: 2
  [TECH]: 1
  [DESCARTADO]: 3
```

---

## 🔄 Revisión periódica

**Cuándo revisar este archivo:** una vez por mes o al iniciar un nuevo bloque de trabajo (ej: al volver al proyecto después de pausa).

**Qué hacer al revisar:**
1. Promover ítems "Por evaluar" a "Decidido" o "Descartado" según corresponda.
2. Documentar las decisiones tomadas con su razón.
3. Mover ítems "Decidido" relevantes a un `features/F0X-*.md` específico si se va a implementar.

---

> **Mantené este archivo vivo.** Es la memoria histórica del proyecto.
