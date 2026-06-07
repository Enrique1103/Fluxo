# 📘 Plan Maestro de Fluxo

> **Documento de gobernanza del proyecto Fluxo.**
> Última actualización: 24 de mayo de 2026
> Owner: Luis Enrique León Bolado
> Estado del proyecto: 123 tests passing, MVP en producción

---

## 🎯 Para qué sirve este conjunto de documentos

Estos archivos son **el manual operativo** para el desarrollo de Fluxo. Su propósito es triple:

1. **Para vos (Owner):** mantener coherencia entre lo que decidiste hace 3 meses y lo que vas a implementar hoy.
2. **Para Claude Code (Implementador):** contexto preciso de qué hacer y qué NO hacer.
3. **Para futuros colaboradores:** comprender la filosofía y reglas del proyecto en 30 minutos de lectura.

Sin esta documentación, las decisiones se pierden en chats viejos y el código degenera en inconsistencias. **Con esta documentación, el proyecto escala con calidad.**

---

## 🗂 Estructura de la documentación

### Meta-documentos (esta carpeta raíz)

Cubren reglas transversales que aplican a TODAS las features.

| Archivo | Propósito | Quién lo lee |
|---|---|---|
| `00-README.md` | Este archivo. Índice general. | Vos al volver al proyecto |
| `01-PRINCIPIOS-INMUTABLES.md` | Reglas constitucionales del proyecto | Vos y Claude Code, SIEMPRE |
| `02-ARQUITECTURA-Y-PATRONES.md` | SOLID y patrones técnicos | Claude Code antes de cada feature |
| `03-CONVENCIONES-DE-CODIGO.md` | Naming, estructura, estilos | Claude Code al escribir código |
| `04-FLUJO-DE-TRABAJO.md` | Cómo dirigir a Claude Code | Vos como manager |

### Documentación por feature (`features/`)

Una carpeta por feature priorizada con su PRD (qué hacer) y TRD (cómo hacerlo).

**A generar en el próximo bloque:**
- `F01-dashboard-hogar-mejorado.md`
- `F02-borrado-granular.md`
- `F03-tipos-de-hogar.md`
- `F04-multiples-hogares-por-transaccion.md`
- `F05-tests-parsers.md`
- `F06-sistema-revision-colaborativa.md`
- `BACKLOG.md` (features pendientes para más adelante)

### Prompts para Claude Code (`prompts/`)

Un archivo `.md` por feature, listo para copiar y pegar a Claude Code.

### Checklists de QA (`checklists/`)

Criterios objetivos para aceptar el código generado por Claude Code.

---

## 🔁 Cómo usar esta documentación

### Cuando volvés al proyecto después de un tiempo

1. Releé `00-README.md` (este archivo) — 5 minutos
2. Releé `01-PRINCIPIOS-INMUTABLES.md` — 10 minutos
3. Revisá `99-DECISIONES-PENDIENTES.md` para ver dónde quedaste

### Cuando vas a implementar una feature nueva

1. Leé el `PRD/TRD` de la feature en `features/F0X-*.md`
2. Revisá el prompt correspondiente en `prompts/P0X-*.md`
3. Copialo a Claude Code junto con los principios inmutables
4. Cuando termine Claude Code, validá con `checklists/QA-F0X-*.md`

### Cuando aparece una idea nueva

1. NO la implementes inmediatamente.
2. Anotala en `99-DECISIONES-PENDIENTES.md` con fecha y contexto.
3. Cuando termines la feature actual, la priorizás contra el backlog.

---

## 🚦 Estado del proyecto al 24 de mayo de 2026

### Lo que YA está implementado

- ✅ Autenticación JWT con revocación de tokens
- ✅ CRUD completo: cuentas, transacciones, categorías, conceptos
- ✅ Soporte multi-moneda UYU/USD con tasas de cambio
- ✅ Hogares con invitaciones, aprobación, liquidación de deudas
- ✅ **Múltiples hogares por usuario** (HouseholdMember sin restricción única)
- ✅ Split proporcional por ingresos en hogares
- ✅ Analytics personal: ingresos vs gastos, patrimonio, breakdown mensual
- ✅ Importación bancaria para 10 bancos uruguayos
- ✅ Deduplicación en 3 fases (SHA-256 + batch + fuzzy)
- ✅ Auto-categorización con aprendizaje por reglas
- ✅ Planes de cuotas (instalment plans)
- ✅ Metas financieras (FinGoals)
- ✅ Notificaciones SSE en tiempo real
- ✅ 123 tests automatizados (1 failing menor, fácil de arreglar)
- ✅ PWA instalable

### Lo que FALTA implementar (priorizado)

| # | Feature | Prioridad | Estimación |
|---|---|---|---|
| 1 | Dashboard del hogar mejorado | 🔴 Alta | 1-2 fines de semana |
| 2 | Borrado granular (toggle por scope) | 🔴 Alta | 1 fin de semana |
| 3 | Tipos de hogar (split + analysis_level) | 🟡 Media-alta | 2-3 fines de semana |
| 4 | Múltiples hogares por transacción | 🟡 Media-alta | 2 fines de semana |
| 5 | Tests de los 9 parsers sin cobertura | 🔴 Alta (técnica) | 1-2 fines de semana |
| 6 | Sistema de revisión colaborativa | 🟢 Media | 1-2 fines de semana |

### Deuda técnica conocida

- ⚠️ CORS abierto (`allow_origins=["*"]`) — riesgo de seguridad en producción
- ⚠️ Sin rate limiting a nivel aplicación
- ⚠️ Test fallando: `test_register_seeds_categories_and_concepts` (espera 10, hay 13)
- ⚠️ 9 de 10 parsers sin tests específicos
- ⚠️ Sin logging estructurado (solo uvicorn access logs)

---

## 🧭 Filosofía del proyecto

Fluxo NO es:
- ❌ Una clonación de Wallet, Fintonic o YNAB
- ❌ Una app generalista internacional
- ❌ Un proyecto donde se priorizan features sobre calidad

Fluxo SÍ es:
- ✅ Una solución específica para el mercado uruguayo (UYU/USD, 10 bancos locales)
- ✅ Un producto con arquitectura limpia y testeada
- ✅ Una herramienta para individuos Y grupos (familias, parejas, roommates)
- ✅ Un proyecto donde **la calidad del código es no negociable**

---

## 📜 Reglas de oro al volver al proyecto

Si después de meses volvés a Fluxo y dudás de algo, recordá:

1. **Toda feature nueva pasa por estos documentos antes de codear.** Si no está documentado, no se implementa.
2. **Los principios inmutables (01) no se violan jamás.** Si una feature los rompe, se rediseña la feature, no se rompe el principio.
3. **Tests primero, código después.** Si la feature no puede ser tested, está mal diseñada.
4. **Si Claude Code propone algo que no está en el plan, NO se acepta.** Anotalo en `99-DECISIONES-PENDIENTES.md` para evaluar después.

---

> **Próximo paso:** lee `01-PRINCIPIOS-INMUTABLES.md` para entender las reglas constitucionales del proyecto.
