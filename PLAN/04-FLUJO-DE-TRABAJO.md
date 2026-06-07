# 🎬 Flujo de Trabajo con Claude Code

> **Este documento es para vos, el Owner.**
> Te dice cómo dirigir a Claude Code de manera profesional para que el resultado sea de calidad.

---

## 🎯 Tu rol y el rol de Claude Code

| Quién | Rol | Qué hace |
|---|---|---|
| **Vos** | Product Owner + QA | Decidís qué construir, validás el resultado, mantenés la visión |
| **Claude Code** | Implementador junior con buena memoria | Escribe el código siguiendo tu plan, NO inventa features |
| **Yo (planificador)** | Tech Lead consultor | Diseño la arquitectura, escribo los PRDs y prompts, reviso tu progreso |

**Regla mental:** Claude Code es **muy capaz pero no es vos**. No conoce tu visión, no tiene contexto histórico, no sabe qué decidieron hace 3 meses. Tu trabajo es darle ese contexto explícitamente, en cada interacción.

Tracy: *"You can't manage what you don't measure."* — y en este caso, no podés delegar a Claude Code lo que no le explicaste claramente.

---

## 🔁 El ciclo de implementación de una feature

```
┌────────────────────────────────────────────────────────────────┐
│ 1. PREPARACIÓN  (vos solo)                                     │
│    - Leés el PRD/TRD de la feature                             │
│    - Releés principios inmutables relevantes                   │
│    - Identificás archivos que se van a tocar                   │
├────────────────────────────────────────────────────────────────┤
│ 2. PROMPT  (vos solo)                                          │
│    - Copiás el prompt pre-armado de `prompts/P0X-*.md`         │
│    - Lo pegás a Claude Code en una sesión nueva                │
├────────────────────────────────────────────────────────────────┤
│ 3. EJECUCIÓN  (Claude Code trabaja, vos supervisás)            │
│    - Claude Code lee los docs                                  │
│    - Hace preguntas si algo no está claro                      │
│    - Implementa por pasos pequeños                             │
│    - Genera código, tests, migraciones                         │
├────────────────────────────────────────────────────────────────┤
│ 4. VERIFICACIÓN  (vos solo, con checklist)                     │
│    - Corres pytest: ¿todos los tests pasan?                    │
│    - Corres la app: ¿funciona el happy path?                   │
│    - Repasás el checklist QA-F0X-*.md                          │
├────────────────────────────────────────────────────────────────┤
│ 5. AJUSTE  (loop con Claude Code)                              │
│    - Si algo está mal, le pedís específicamente que arregle    │
│    - NUNCA aceptás "casi bien": volves al checklist            │
├────────────────────────────────────────────────────────────────┤
│ 6. CIERRE  (vos solo)                                          │
│    - Commit con mensaje siguiendo convenciones                 │
│    - Actualizás 99-DECISIONES-PENDIENTES.md si hay aprendizajes│
│    - Marcás la feature como ✅ en el README                    │
└────────────────────────────────────────────────────────────────┘
```

---

## 📦 Estructura de un prompt efectivo para Claude Code

Un prompt malo: *"Implementame el sistema de revisión colaborativa"*

Un prompt **bueno** tiene **6 secciones obligatorias**:

### 1. CONTEXTO DEL PROYECTO

```
Estás trabajando en Fluxo, una plataforma de finanzas personales 
uruguaya. El proyecto está en producción con 123 tests pasando.

Antes de empezar, leé estos archivos del repo:
- docs/plan/01-PRINCIPIOS-INMUTABLES.md
- docs/plan/02-ARQUITECTURA-Y-PATRONES.md
- docs/plan/03-CONVENCIONES-DE-CODIGO.md
- docs/plan/features/F0X-NOMBRE-DE-LA-FEATURE.md

Estos documentos contienen reglas que NO podés violar.
```

### 2. FEATURE A IMPLEMENTAR

```
Implementá la feature F06: "Sistema de Revisión Colaborativa".
Está documentada en docs/plan/features/F06-sistema-revision-colaborativa.md

Resumen:
- Cualquier miembro de un hogar puede marcar transacciones para revisar
- El autor recibe la marca y puede responder
- La marca es visible solo entre el que marcó y el autor
```

### 3. REGLAS INMUTABLES ESPECÍFICAS

```
Reglas críticas para esta feature:

- NO modifiques tests existentes salvo si genuinamente rompen.
- NO modifiques modelos sin generar migración Alembic.
- NO hagas db.commit() en la capa CRUD.
- Las marcas de revisión son privadas: solo visibles entre quien marcó y el autor.
- NO permitas marcar transacciones de OTROS USUARIOS (solo de hogares donde sos miembro).
```

### 4. ARCHIVOS QUE PODÉS TOCAR

```
Archivos NUEVOS a crear:
- backend/app/models/transaction_review.py
- backend/app/schemas/transaction_review.py
- backend/app/crud/transaction_review_crud.py
- backend/app/services/transaction_review_service.py
- backend/app/exceptions/transaction_review_exceptions.py
- backend/app/api/v1/transaction_reviews.py
- backend/tests/test_transaction_reviews.py
- backend/alembic/versions/XXXX_add_transaction_reviews.py
- frontend/src/api/transactionReviews.ts
- frontend/src/components/review/ReviewButton.tsx
- frontend/src/components/review/ReviewModal.tsx
- frontend/src/types/transactionReview.ts

Archivos a MODIFICAR (con cuidado):
- backend/app/main.py (registrar router + exception handlers)
- frontend/src/components/TransactionItem.tsx (agregar botón)

NO TOQUES:
- backend/app/models/transaction.py (no se modifica)
- backend/app/services/transaction_service.py (no se toca)
- Cualquier otro archivo no listado arriba
```

### 5. CRITERIOS DE COMPLETITUD

```
La feature está completa cuando:

1. Todos los tests nuevos pasan: pytest backend/tests/test_transaction_reviews.py
2. Todos los tests existentes siguen pasando: pytest backend/tests/
3. La migración corre sin errores: alembic upgrade head
4. Los endpoints están en el OpenAPI: visitando /docs aparecen
5. Desde el frontend, puedo:
   a. Marcar una transacción de otro miembro del hogar
   b. Ver mis marcas pendientes de respuesta
   c. Responder una marca recibida
   d. Marcar como resuelta

NO marqués la feature como completa hasta verificar TODOS los puntos.
```

### 6. FORMATO DE TRABAJO

```
Trabajá en pasos pequeños:

PASO 1: Crear modelos + migración + tests del modelo
   → Esperá mi aprobación antes de seguir.

PASO 2: Crear CRUD + tests del CRUD
   → Esperá mi aprobación antes de seguir.

PASO 3: Crear service + tests del service
   → Esperá mi aprobación antes de seguir.

PASO 4: Crear endpoints + tests de integración
   → Esperá mi aprobación antes de seguir.

PASO 5: Implementar frontend
   → Esperá mi aprobación antes de seguir.

PASO 6: Verificación end-to-end
   → Reportarme estado final con checklist.

NO avances al siguiente paso hasta que yo confirme el actual.
NO inventes features que no estén en el PRD.
Si tenés dudas, PREGUNTÁ antes de codear.
```

---

## 🚦 Reglas para vos como Manager

### Regla 1: NUNCA pegues un prompt sin leer la feature primero

Si vos no entendés qué se está implementando, no vas a poder validar si Claude Code lo hizo bien. **Tu primera tarea es entender la feature**.

### Regla 2: SIEMPRE arrancá una sesión nueva por feature

No mezcles features en una sola conversación con Claude Code. Cada feature → conversación nueva con contexto fresco.

**Razón:** Las sesiones largas se contaminan con contexto irrelevante y Claude Code empieza a confundir features distintas.

### Regla 3: Validá paso por paso, no al final

Si Claude Code dice "hice los 6 pasos, mirá", **rechazalo**. Pediste pasos chicos por una razón. Si validás al final, cuando encontrás un error tenés que rehacer todo.

**El correcto:**
```
Vos: implementá paso 1
Claude Code: hice X
Vos: corro tests... ✅. Adelante con paso 2.
Claude Code: hice Y
Vos: ...
```

### Regla 4: Si Claude Code pregunta, respondé concretamente

Si Claude Code te pregunta *"¿el campo `flagged_at` debe ser DateTime o solo Date?"*, NO respondas *"el que vos veas"*. Respondé *"DateTime con timezone, usar `datetime.now(timezone.utc)`"*.

**Razón:** Cuando le delegás decisiones, Claude Code toma decisiones que no necesariamente son las tuyas.

### Regla 5: Cuando algo está mal, sé específico

```
❌ Mal: "Eso no es lo que quiero"
✅ Bien: "El endpoint POST /reviews retorna 200, pero según P21 
debería retornar 201 (Created). Corregí eso."

❌ Mal: "No funciona"
✅ Bien: "Cuando ejecuto pytest test_transaction_reviews.py, 
el test test_marcar_sin_permiso falla con 
'AssertionError: assert 200 == 403'. Investigá por qué 
no se está validando la membresía."
```

### Regla 6: Si Claude Code propone "mejoras" no pedidas, rechazalas

Claude Code a veces dice cosas como *"además aproveché para refactorizar el archivo X que estaba feo"*. **NO**.

Respondé: *"Revertí esa modificación. Solo implementá lo que está en el PRD. Si pensás que algo más merece refactor, anotalo en `99-DECISIONES-PENDIENTES.md` con tu razonamiento. Pero no lo implementes ahora."*

### Regla 7: NO aceptes "compila" como criterio de éxito

```
❌ "Listo, ya compila"
✅ "Listo, los 12 tests nuevos pasan + los 123 anteriores también pasan"
```

Que algo compile no significa que funcione. Que los tests pasen significa que funciona como esperás.

### Regla 8: Hacé commits pequeños

No esperes a tener "toda la feature lista" para commitear. Cada paso completo → commit.

```bash
# Paso 1 completado
git add backend/app/models/transaction_review.py backend/alembic/versions/XXX*
git commit -m "feat(reviews): agregar modelo TransactionReview y migración"

# Paso 2 completado
git add backend/app/crud/transaction_review_crud.py backend/tests/...
git commit -m "feat(reviews): agregar CRUD de transaction_reviews con tests"
```

**Razón:** Si en el paso 5 algo se rompe, podés volver al paso 4 sin perder todo.

### Regla 9: La rama feature está aislada

Trabajá cada feature en su propia rama:

```bash
git checkout -b feature/F06-review-colaborativa
# ... trabajás ...
# cuando termina:
git push origin feature/F06-review-colaborativa
# después merge a main
```

**NO** trabajés en `main` directo. Si algo sale mal, no podés deshacer fácilmente.

### Regla 10: Documentá decisiones difíciles

Si durante una feature aparece una decisión técnica importante que no estaba prevista, **documentala antes de implementarla**:

1. Pausá a Claude Code
2. Abrí `99-DECISIONES-PENDIENTES.md`
3. Anotá la decisión, los pros/contras, y qué elegiste
4. Volvé a Claude Code con instrucciones claras

---

## 🛡 Patrones de defensa contra errores de Claude Code

### Patrón 1: Test driven development (TDD) inducido

En el prompt, decile a Claude Code que **escriba los tests ANTES del código**:

```
Para esta feature, seguí TDD:

1. Primero escribí los tests de lo que SE ESPERA que pase.
2. Mostrámelos. Yo los reviso.
3. Después escribí el código que hace pasar esos tests.
4. Si los tests cambian, justifícame por qué.
```

**Razón:** Tener tests primero te garantiza que Claude Code entendió el comportamiento esperado.

### Patrón 2: Reglas inmutables al inicio

Al inicio del prompt, repetí las reglas inmutables más críticas. Claude Code prioriza lo que está más temprano y más alto en el prompt.

```
REGLAS INVIOLABLES PARA ESTA TAREA:
1. Toda query debe filtrar por user_id.
2. CRUD no hace commit, service sí.
3. Los códigos HTTP deben ser los correctos (ver P21).
4. NO modifiques tests existentes.

Si alguno de estos puntos no te queda claro, PREGUNTAME.
```

### Patrón 3: Verificación parcial obligatoria

Después de cada paso, pediles que **ejecuten y muestren** la verificación:

```
Después de implementar el modelo, corré:
- alembic upgrade head
- pytest backend/tests/test_transaction_reviews.py::TestModel

Y pegame el output completo (incluyendo timings).

No avances al paso siguiente hasta que yo confirme.
```

### Patrón 4: Lectura forzada de documentación

Al inicio del prompt:

```
ANTES DE ESCRIBIR UNA SOLA LÍNEA DE CÓDIGO:

1. Leé el contenido completo de:
   - docs/plan/01-PRINCIPIOS-INMUTABLES.md
   - docs/plan/02-ARQUITECTURA-Y-PATRONES.md
   - docs/plan/03-CONVENCIONES-DE-CODIGO.md

2. Resumímelos en 5 puntos cada uno para confirmarme que los entendiste.

3. Solo después de mi confirmación, empezás a codear.
```

**Razón:** Esto fuerza a Claude Code a procesar los principios, no solo a "ver" los archivos.

---

## 🧪 Cómo hacer QA del código generado

### El checklist de QA después de cada feature

Tomá el archivo `checklists/QA-F0X-*.md` y verificá UNO POR UNO. No salteés ninguno.

### Tres niveles de verificación

#### Nivel 1: Verificación automática
```bash
cd backend
pytest -v                    # todos los tests pasan
alembic upgrade head         # migraciones aplican
ruff check .                 # linting OK (si usás ruff)
mypy app/                    # type checking (si usás mypy)
```

#### Nivel 2: Verificación manual del happy path
```bash
# Levantar backend
uvicorn app.main:app --reload

# Levantar frontend
cd frontend && npm run dev

# Probar manualmente: registrarse, login, crear una transacción,
# usar la nueva feature, verificar comportamiento esperado.
```

#### Nivel 3: Verificación de edge cases
- ¿Qué pasa con datos vacíos?
- ¿Qué pasa con valores extremos (0, negativos, gigantes)?
- ¿Qué pasa si el usuario no tiene permisos?
- ¿Qué pasa si la operación se hace dos veces seguidas (idempotencia)?
- ¿Qué pasa si la red se cae a mitad de la operación?

---

## 📅 Cuánto tiempo dedicar

### Por feature

| Tarea | Tiempo |
|---|---|
| Leer PRD/TRD + principios | 30 min |
| Pegar prompt y supervisar paso 1 | 30-60 min |
| Supervisar pasos 2-5 | 1-3 horas |
| QA con checklist | 30-60 min |
| Ajustes y refinements | 30-90 min |
| Commit y limpieza | 15 min |
| **TOTAL por feature** | **3-7 horas** |

### Distribución semanal recomendada

Si tenés un trabajo full-time + estudios:

- **2 horas un sábado a la mañana** + **2 horas un domingo a la tarde** = 4 horas/semana
- En **4 fines de semana** = 16 horas → 2-3 features pequeñas completadas

**No te metás en una feature un miércoles a la noche.** Necesitás bloques de tiempo concentrado.

---

## ⚠️ Señales de alarma

Si notás alguno de estos síntomas, **PARÁ** y revisá:

### 🚨 Claude Code está respondiendo demasiado rápido y demasiado seguro

Síntoma: te muestra 500 líneas de código en 30 segundos sin haber preguntado nada.

**Acción:** rechazá el output. Probablemente esté inventando o asumiendo cosas. Volvé a empezar pidiendo paso por paso con preguntas explícitas.

### 🚨 Aparecen archivos que no esperabas

Síntoma: en el git diff aparecen modificaciones a archivos que no estaban en la lista de "archivos que podés tocar".

**Acción:** rechazá esos cambios. Decile específicamente que revierta y siga solo con los archivos autorizados.

### 🚨 Los tests "se ajustaron"

Síntoma: tests que antes pasaban ahora pasan después de "ajustarlos" en lugar de arreglar el código.

**Acción:** crítico. Revertí los cambios en los tests. Investigá por qué se rompieron originalmente. Si genuinamente había un bug en el test antiguo, arreglalo deliberadamente; pero NO permitas que Claude Code cambie tests para que pasen.

### 🚨 Las migraciones están duplicadas o reordenadas

Síntoma: hay dos migraciones con timestamps similares, o el `down_revision` está mal apuntado.

**Acción:** rechazá. Pedile específicamente que regenere la migración con `alembic revision --autogenerate -m "descripción"` partiendo del estado correcto.

### 🚨 Aparecen comentarios `# TODO` o `# FIXME`

Síntoma: el código tiene comentarios indicando que algo está incompleto.

**Acción:** rechazá. La feature no está completa hasta que todo esté implementado. Los TODO en código nuevo son trampa para el futuro.

### 🚨 Te está prometiendo features no pedidas

Síntoma: *"además aproveché para implementar X y Y"*.

**Acción:** rechazá X e Y. Anotalas en backlog si te parecen útiles, pero NO se implementan ahora.

---

## 🏁 Cuando una feature se considera "Done"

Una feature está completa cuando:

- ✅ Todos los tests nuevos pasan
- ✅ Todos los tests existentes siguen pasando
- ✅ La migración se aplicó sin errores
- ✅ El checklist QA está 100% verde
- ✅ El frontend funciona end-to-end
- ✅ Hay commits con mensajes correctos
- ✅ La rama está mergeada a main
- ✅ El `README.md` actualizado refleja la feature como completada
- ✅ No queda ningún `# TODO` ni `console.log` ni `print()` de debug

**Si alguno de estos puntos falla, NO está done.** Aunque "funcione en mi máquina".

---

## 💡 Consejos finales del Tech Lead

### Sobre el ego de Claude Code

Claude Code a veces va a decir cosas como *"Esto está perfecto"* o *"Esto sigue las mejores prácticas"*. **Ignoralo.** Lo que importa es:

1. ¿Pasan los tests?
2. ¿Cumple el checklist?
3. ¿Vos podés explicar lo que hace?

Si no podés explicar línea por línea lo que hizo Claude Code, **no lo entendiste**, y si no lo entendiste, **no lo controlás**.

### Sobre el cansancio

Tu calidad como Manager baja muchísimo cuando estás cansado. Si llevás 3 horas seguidas dirigiendo Claude Code, **parate**. Levantate. Caminá 10 minutos. Tomá agua. Después volvé.

**Las peores decisiones técnicas se toman entre las 11 PM y las 2 AM.** Tracy: *"Sleep is the great equalizer."*

### Sobre la documentación viva

Estos documentos NO son sagrados. Si encontrás que una regla no aplica, o que falta una convención, **actualizalos**. Pero hacelo deliberadamente, no impulsivamente.

### Sobre los "experimentos"

A veces vas a tener ganas de probar algo nuevo (nueva librería, nuevo patrón, nuevo enfoque). **Hacelo en una rama separada `experiment/X`**. NO en una rama de feature.

### Sobre cuándo pedir ayuda

Si estás trabado más de **30 minutos** en algo, parame a mí (al planificador). No insistas con Claude Code. Tomame el caso y armamos un nuevo prompt o redefiniciones de scope.

---

## 📌 Resumen ejecutivo: las 5 reglas más importantes

1. **Leé el PRD antes de pegar el prompt.** Sin entender qué se construye, no podés dirigir.
2. **Sesión nueva por feature.** Contexto limpio.
3. **Paso por paso, no al final.** Validás chiquito, errores chicos.
4. **Sé específico cuando algo está mal.** Vagueza = más errores.
5. **No aceptes "casi bien".** El checklist QA es la verdad.

---

> **Próximo paso:** vas a recibir los PRDs por feature en `features/` y los prompts en `prompts/`.
> Cuando estés listo para implementar la primera, releé este flujo de trabajo y procedé.
