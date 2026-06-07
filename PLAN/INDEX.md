# 📑 Índice Maestro — Plan de Fluxo

> **Generado:** 24-25 de mayo de 2026
> **Estado:** completo, listo para ejecución
> **Owner:** Luis Enrique León Bolado

---

## 🎯 Cómo navegar este plan

Este plan tiene **4 niveles**, de más abstracto a más concreto:

```
┌─────────────────────────────────────────────────────┐
│ NIVEL 1: META-DOCUMENTACIÓN                         │
│ Reglas constitucionales del proyecto                │
│ → Lee primero, una vez                              │
├─────────────────────────────────────────────────────┤
│ NIVEL 2: FEATURES (PRD + TRD)                       │
│ Qué construir y cómo                                │
│ → Lee la feature que vas a implementar              │
├─────────────────────────────────────────────────────┤
│ NIVEL 3: PROMPTS                                    │
│ Qué pegarle a Claude Code                           │
│ → Copiá y pegá cuando vas a empezar                 │
├─────────────────────────────────────────────────────┤
│ NIVEL 4: CHECKLISTS DE QA                           │
│ Cómo verificar el resultado                         │
│ → Tildá cuando Claude Code termina                  │
└─────────────────────────────────────────────────────┘
```

---

## 📂 Estructura completa del plan

```
fluxo-plan/
│
├── 00-README.md                        ← Introducción general
├── 01-PRINCIPIOS-INMUTABLES.md         ← 26 reglas constitucionales
├── 02-ARQUITECTURA-Y-PATRONES.md       ← SOLID + patrones
├── 03-CONVENCIONES-DE-CODIGO.md        ← Naming, estilos
├── 04-FLUJO-DE-TRABAJO.md              ← Cómo dirigir a Claude Code
├── 99-DECISIONES-PENDIENTES.md         ← Backlog de decisiones
├── INDEX.md                            ← Este archivo
│
├── features/
│   ├── F01-dashboard-hogar-mejorado.md
│   ├── F02-borrado-granular.md
│   ├── F03-tipos-de-hogar.md
│   ├── F04-multiples-hogares-por-transaccion.md
│   ├── F05-tests-parsers.md
│   ├── F06-sistema-revision-colaborativa.md
│   └── BACKLOG.md                      ← 20 ítems no priorizados
│
├── prompts/
│   ├── P01-dashboard-hogar.md          ← Copiar y pegar a Claude Code
│   ├── P02-borrado-granular.md
│   ├── P03-tipos-de-hogar.md
│   ├── P04-multiples-hogares-por-transaccion.md
│   ├── P05-tests-parsers.md
│   └── P06-revision-colaborativa.md
│
└── checklists/
    ├── QA-template.md                  ← Plantilla universal
    ├── QA-F01-dashboard-hogar.md
    ├── QA-F02-borrado-granular.md
    ├── QA-F03-tipos-de-hogar.md
    ├── QA-F04-multiples-hogares.md
    ├── QA-F05-tests-parsers.md
    └── QA-F06-revision-colaborativa.md
```

**Total: 26 archivos, ~368 KB de documentación**

---

## 🚦 Plan de ejecución recomendado

### Antes de empezar (1 hora)

1. **Leer en orden:**
   - `00-README.md`
   - `01-PRINCIPIOS-INMUTABLES.md`
   - `02-ARQUITECTURA-Y-PATRONES.md`
   - `03-CONVENCIONES-DE-CODIGO.md`
   - `04-FLUJO-DE-TRABAJO.md`

2. **Hacer commit inicial del plan en el repo de Fluxo:**

   ```bash
   cd /path/to/fluxo
   mkdir -p docs/plan
   cp -r ~/Downloads/fluxo-plan/* docs/plan/
   git add docs/plan/
   git commit -m "docs(plan): agregar plan maestro de Fluxo
   
   Documentación completa de principios, arquitectura, features
   priorizadas con PRD/TRD, prompts para Claude Code y checklists
   de QA. Cubre roadmap de F01 a F06 + backlog de 20 ítems."
   git push
   ```

### Orden recomendado de implementación

```
F01 (Dashboard) → F02 (Borrado) → F05 (Tests parsers)
                      ↓
              F03 (Tipos de hogar)
                      ↓
       F04 (Múltiples hogares por tx)
                      ↓
       F06 (Revisión colaborativa)
```

**Por qué este orden:**

1. **F01** primero porque es quick win sin tocar modelos (entrega valor rápido)
2. **F02** independiente, puede ir en paralelo a F01 si querés
3. **F05** independiente, deuda técnica importante antes de tocar más cosas
4. **F03** es estructural, habilita F04 y F06
5. **F04** depende de F03 (tipos definidos)
6. **F06** depende de F04 (transacciones en múltiples hogares)

### Ciclo por feature

```
┌──────────────────────────────────────────────────────────┐
│ 1. Leer la feature                                       │
│    → features/F0X-*.md  (30 min)                         │
├──────────────────────────────────────────────────────────┤
│ 2. Crear rama feature/F0X-nombre                         │
│    → git checkout -b feature/F0X-nombre                  │
├──────────────────────────────────────────────────────────┤
│ 3. Copiar prompt a Claude Code                           │
│    → prompts/P0X-*.md  (sesión nueva)                    │
├──────────────────────────────────────────────────────────┤
│ 4. Supervisar paso a paso                                │
│    → Aprobar entre pasos, no al final                    │
├──────────────────────────────────────────────────────────┤
│ 5. QA con checklist                                      │
│    → checklists/QA-template.md + QA-F0X.md               │
├──────────────────────────────────────────────────────────┤
│ 6. Si todo OK: merge a main                              │
│    → Actualizar 99-DECISIONES-PENDIENTES.md              │
│    → Actualizar 00-README.md (marcar feature como ✅)    │
└──────────────────────────────────────────────────────────┘
```

---

## 📊 Estimaciones totales

| Feature | Tiempo estimado | Acumulado |
|---|---|---|
| F01 — Dashboard hogar | 1-2 fines de semana | 1-2 |
| F02 — Borrado granular | 1 fin de semana | 2-3 |
| F05 — Tests parsers | 1-2 fines de semana | 3-5 |
| F03 — Tipos de hogar | 2-3 fines de semana | 5-8 |
| F04 — Múltiples hogares por tx | 2 fines de semana | 7-10 |
| F06 — Revisión colaborativa | 1-2 fines de semana | 8-12 |

**Total estimado: 8-12 fines de semana** (3-4 meses calendario trabajando 1 fin de semana cada 2).

**Calendario ideal:** julio a octubre/noviembre 2026.

---

## 🎯 Hitos del proyecto

### Hito 1: MVP de hogares mejorado (post F01 + F02 + F05)

**Cuándo:** ~5 fines de semana
**Qué tenés:**
- Dashboard del hogar al nivel del personal
- Borrado granular implementado
- 60+ tests nuevos blindando los parsers
- ~183 tests en total

**Acción de marketing:** invitar a 3-5 beta testers reales (la pareja, amigos, familia).

### Hito 2: Modelo de hogares completo (post F03 + F04)

**Cuándo:** ~10 fines de semana
**Qué tenés:**
- Tipos de hogar configurables (split + analysis_level)
- Transacciones en múltiples hogares
- Sistema de privacidad robusto entre hogares

**Acción de marketing:** abrir lista de espera pública (landing simple con email).

### Hito 3: Diferenciador competitivo (post F06)

**Cuándo:** ~12 fines de semana
**Qué tenés:**
- Sistema de revisión colaborativa único en el mercado
- Modelo de producto maduro

**Acción de marketing:** primer producto público con feature distintiva. Posts en redes técnicos (LinkedIn) y de usuarios (Twitter/Instagram).

---

## 🧭 Decisiones tomadas (resumen)

Para que tengas en una vista lo más importante:

### Arquitectónicas
- ✅ Personal es la fuente de verdad (P6)
- ✅ Hogares son capas de análisis encima de personal
- ✅ Múltiples hogares por usuario (ya soportado, no necesita refactor)
- ✅ Múltiples hogares por transacción (F04 lo implementa)
- ✅ Tipos de hogar con 2 dimensiones: split + analysis_level (F03)
- ✅ Borrado granular con scope=personal/household (F02)

### De producto
- ✅ Tope de presupuesto = alerta, NO restricción (P14)
- ✅ Auto-categorización aprende pero NO sobrescribe usuario (P12)
- ✅ Privacidad por defecto en hogares
- ✅ Sistema de revisión es opt-in y privado (F06)

### Técnicas
- ✅ NO usar IA externa en parsers (determinismo + privacidad)
- ✅ CRUD nunca hace commit (P2)
- ✅ Soft delete sobre hard delete (P3)
- ✅ Mensajes de error en español (P19)
- ✅ Tests en aislamiento (P17)

### Descartadas
- ❌ Concepto "Grupo" como subgrupo dentro de Hogar (innecesario)
- ❌ Restricciones duras de presupuesto
- ❌ Aprobación de transacciones por admin
- ❌ Categorías restringidas por hogar
- ❌ CUSTOM split_method (por ahora)

---

## 💡 Filosofía del plan

Tracy: *"Plans are nothing; planning is everything."*

Este plan **NO** es para seguirlo al pie de la letra. Es para que:

1. **Tengas claridad** cuando volvés al proyecto después de pausas
2. **Dirijas a Claude Code** con precisión y consistencia
3. **Detectes regresiones** rápido mediante checklists
4. **Documentes decisiones** para no repetir discusiones
5. **Escales el proyecto** sin perder calidad

Si en julio descubrís que algo necesita ajuste, **actualizá el plan**. Los documentos son vivos.

---

## 🚨 Reglas de oro al ejecutar el plan

1. **NO implementes features fuera del plan.** Si aparece una idea nueva, anotala en `99-DECISIONES-PENDIENTES.md`.

2. **NO violes los principios inmutables.** Si una feature los rompe, rediseñá la feature.

3. **NO mergees código sin pasar el checklist QA.** "Casi bien" no es "bien".

4. **NO trabajés Fluxo cansado.** Es un proyecto largo plazo. Una sesión cansada genera bugs que pagás varias sesiones después.

5. **NO te quedes solo en este proyecto.** Beta testers reales son tu radar de realidad.

---

## 📞 Cuando volvás a este plan

Tu primer mensaje a Claude (yo) cuando vuelvas debería ser algo como:

> *"Volví al proyecto Fluxo. Ya leí el plan. Quiero empezar por F01. ¿Me ayudás a revisar el prompt antes de pegarlo a Claude Code?"*

Yo en ese momento voy a:
1. Releer el prompt contigo
2. Adaptarlo si hay cambios en el código actual
3. Recordarte las reglas clave
4. Acompañarte mientras Claude Code trabaja

---

## ✅ Estado del plan al 25 de mayo de 2026

- [x] Bloque 1: Meta-documentación (6 archivos)
- [x] Bloque 2: Features con PRD/TRD (7 archivos)
- [x] Bloque 3: Prompts para Claude Code (6 archivos)
- [x] Bloque 4: Checklists de QA (7 archivos)

**Total: 26 archivos, ~368 KB**

**Estado:** ✅ Plan completo, listo para ejecución cuando estés listo.

---

> *"The will to win is not nearly so important as the will to prepare to win."* — Bobby Knight
>
> Vos ya te preparaste. Cuando llegue el momento de ejecutar, vas a tener todo listo.
