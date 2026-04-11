# 📚 Índice Completo: Sistema de Importación Bancaria para Fluxo

## 🎯 Para Empezar

**¿Eres desarrollador implementando?**
→ Ve directamente a `PROMPT_MAESTRO_CLAUDE_CODE.md`

**¿Necesitas entender la arquitectura?**
→ Lee `ARQUITECTURA_REFERENCIA_RAPIDA.md` primero, luego `ESPECIFICACION_TECNICA.md`

**¿Necesitas ver el plan completo?**
→ Lee `PLAN_IMPLEMENTACION.md`

---

## 📄 Documentos Incluidos

### 1. **ESPECIFICACION_TECNICA.md**
**Qué es**: Documento técnico completo
**Para quién**: Arquitectos, Tech Leads, revisores
**Contiene**:
- Visión general del sistema
- Arquitectura de componentes
- Flujo de datos detallado
- Modelos de datos (dataclasses)
- Especificaciones por banco
- Campos requeridos vs disponibles
- Reglas de negocio
- Integraciones con Fluxo
- Casos de uso (user stories)
- Plan de implementación
- Estructura de archivos
- Dependencias
- Tests requeridos
- API Endpoints
- Consideraciones importantes
- Métricas de éxito

**Cómo usarlo**:
1. Leerlo completamente antes de empezar
2. Referenciarlo durante desarrollo
3. Compartirlo con stakeholders
4. Usar para code reviews

---

### 2. **PLAN_IMPLEMENTACION.md**
**Qué es**: Roadmap detallado por fase
**Para quién**: Product Managers, desarrolladores, gestión
**Contiene**:
- División en 3 fases
- Tareas específicas por fase
- Estimaciones de tiempo
- Entregables de cada fase
- Criterios de aceptación
- Roadmap visual
- Checklist de implementación
- Estimación de esfuerzo
- Análisis de riesgos
- Métricas de progreso

**Cómo usarlo**:
1. Para planning inicial
2. Para seguimiento de progreso
3. Para estimar sprints
4. Para comunicar avances

---

### 3. **PROMPT_MAESTRO_CLAUDE_CODE.md** ⭐
**Qué es**: Instrucciones ejecutables para Claude Code
**Para quién**: Desarrolladores que usarán Claude Code
**Contiene**:
- Contexto completo
- Objetivo general
- Instrucciones específicas para FASE 1
- Requisitos precisos para cada clase
- Código template y ejemplos
- Estructura esperada
- API routes esperadas
- Ajustes a frontend
- Tests a implementar
- Estándar de código
- Criterios de aceptación
- FAQ
- Próximos pasos
- Timeline esperado

**Cómo usarlo**:
1. Copiar contenido completo
2. Pasarlo a Claude Code como prompt
3. Claude Code lo seguirá paso a paso
4. Verificar que el resultado cumpla criterios de aceptación

---

### 4. **ARQUITECTURA_REFERENCIA_RAPIDA.md**
**Qué es**: Diagrama y referencia rápida
**Para quién**: Desarrolladores, durante implementación
**Contiene**:
- Flujo de datos completo (visual)
- Estructura de carpetas
- Clases principales y responsabilidades
- Flujo de movimiento a través del sistema
- Flujo de base de datos
- Mapeo de campos (banco → Fluxo)
- Diagrama de estados
- Tabla de decisiones
- Integración con Fluxo existente
- Checklist rápido

**Cómo usarlo**:
1. Mantener a mano durante desarrollo
2. Consultar cuando haya duda de dónde va una función
3. Verificar integraciones
4. Validar checklist

---

### 5. **Archivos Python Existentes**
```
importador_bancario.py        # Lógica de parseo e importación
post_importacion.py           # Detección y resolución de problemas
importador_ui.html            # UI para cargar archivos
resolvedor_problemas_ui.html  # UI para resolver problemas
guia_resolucion_postimportacion.md  # Guía para usuario
analisis_importacion_bancaria.md    # Análisis detallado pre-implementación
```

**Cómo usarlos**:
- `importador_bancario.py`: Adaptarlo según PROMPT_MAESTRO
- `post_importacion.py`: Usar como referencia para FASE 2
- `importador_ui.html`: Integrar con backend en FASE 1
- `resolvedor_problemas_ui.html`: Integrar con backend en FASE 2

---

## 🔄 Flujo de Trabajo Recomendado

### Para Nuevo Desarrollador

```
1. Lee ARQUITECTURA_REFERENCIA_RAPIDA.md (30 min)
   ↓
2. Lee ESPECIFICACION_TECNICA.md completamente (1 hora)
   ↓
3. Lee PLAN_IMPLEMENTACION.md (30 min)
   ↓
4. Revisa archivos existentes:
   - importador_bancario.py (estructura)
   - post_importacion.py (solo overview)
   - importador_ui.html (conectores)
   ↓
5. ¡Listo! Comienza implementación con PROMPT_MAESTRO
```

### Para Claude Code

```
1. Recibe PROMPT_MAESTRO_CLAUDE_CODE.md completo
   ↓
2. Ejecuta FASE 1:
   - Crea base de datos
   - Implementa clases Python
   - Crea rutas API
   - Conecta frontend
   - Tests al 90%
   ↓
3. Verifica contra criterios de aceptación
   ↓
4. ¡Listo! FASE 1 completada
```

### Para Revisor de Código

```
1. Lee ESPECIFICACION_TECNICA.md (requisitos)
   ↓
2. Lee PLAN_IMPLEMENTACION.md (timeline)
   ↓
3. Revisa código contra:
   - Criterios de aceptación
   - Cobertura de tests (>90%)
   - Documentación
   - Estándar de código
   ↓
4. Aprueba o pide cambios
```

---

## 📊 Matriz de Documentación

| Documento | Técnico | Plan | Ejecución | Referencia |
|-----------|---------|------|-----------|-----------|
| ESPECIFICACION_TECNICA.md | ✅ | ✅ | | ✅ |
| PLAN_IMPLEMENTACION.md | | ✅ | ✅ | |
| PROMPT_MAESTRO_CLAUDE_CODE.md | | | ✅ | |
| ARQUITECTURA_REFERENCIA_RAPIDA.md | | | ✅ | ✅ |
| importador_bancario.py | | | ✅ | ✅ |
| post_importacion.py | | | ✅ | ✅ |
| importador_ui.html | | | ✅ | |
| resolvedor_problemas_ui.html | | | ✅ | |

---

## 🎓 Cómo Leer Cada Documento

### ESPECIFICACION_TECNICA.md
```
Primera lectura: Leer secciones 1-7 en orden
Segunda lectura: Consultar secciones 8-16 según sea necesario
Tercera lectura: Usar como referencia durante code review
```

### PLAN_IMPLEMENTACION.md
```
Primera lectura: Secciones "FASE 1: MVP"
Segunda lectura: Secciones "FASE 2" cuando estés listo
Tercera lectura: Usar roadmap visual para tracking
```

### PROMPT_MAESTRO_CLAUDE_CODE.md
```
Lectura única: Completa, en orden
Acción: Copiar a Claude Code
Referencia: Revisar criterios de aceptación durante desarrollo
```

### ARQUITECTURA_REFERENCIA_RAPIDA.md
```
Primera lectura: Secciones 1-4 para entender flujo
Segunda lectura: Tener a mano durante desarrollo
Tercera lectura: Consultar "Checklist Rápido" al terminar
```

---

## 🚀 Cómo Ejecutar el Proyecto

### Paso 1: Preparación
```bash
# Clonar repositorio
git clone <url-fluxo>
cd fluxo

# Leer documentación
1. Leer ARQUITECTURA_REFERENCIA_RAPIDA.md
2. Leer ESPECIFICACION_TECNICA.md
3. Leer PLAN_IMPLEMENTACION.md

# Setup ambiente
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt  # (crear archivo)
```

### Paso 2: FASE 1
```bash
# 1. Leer PROMPT_MAESTRO_CLAUDE_CODE.md completamente
# 2. Ejecutar con Claude Code:
#    - Copiar prompt maestro
#    - Dejar que Claude implemente
#    - Verificar criterios de aceptación

# 3. Testing
pytest backend/tests/ -v --cov=backend --cov-report=term-missing
# Objetivo: >90% coverage

# 4. Manual testing
python -m flask run
# Subir archivo test_data/prex.xlsx
# Verificar que aparezca en BD

# 5. Deployment
git add .
git commit -m "[FASE-1] Sistema de importación bancaria MVP"
git push origin main
```

### Paso 3: FASE 2 (después de FASE 1 completada)
```bash
# 1. Leer PLAN_IMPLEMENTACION.md, sección "FASE 2"
# 2. Seguir PROMPT_MAESTRO para FASE 2 (crear documento similar)
# 3. Implementar DetectorProblemas y GestorPostImportacion
# 4. Conectar resolvedor_problemas_ui.html
```

---

## 🔍 Validación de Completitud

### ¿He leído todo lo necesario?

**Para implementar**:
- [ ] ARQUITECTURA_REFERENCIA_RAPIDA.md
- [ ] ESPECIFICACION_TECNICA.md (secciones 1-7)
- [ ] PROMPT_MAESTRO_CLAUDE_CODE.md

**Para reviewar código**:
- [ ] ESPECIFICACION_TECNICA.md (completo)
- [ ] PLAN_IMPLEMENTACION.md (sección FASE 1)
- [ ] Criterios de aceptación (PROMPT_MAESTRO)

**Para gestionar proyecto**:
- [ ] PLAN_IMPLEMENTACION.md (completo)
- [ ] ESPECIFICACION_TECNICA.md (secciones 1-3, 16)
- [ ] ARQUITECTURA_REFERENCIA_RAPIDA.md (sección 10)

---

## 📱 Tamaño y Tiempo de Lectura

| Documento | Páginas | Lectura | Referencia |
|-----------|---------|---------|-----------|
| ESPECIFICACION_TECNICA.md | ~20 | 2 horas | Continua |
| PLAN_IMPLEMENTACION.md | ~15 | 1 hora | Continua |
| PROMPT_MAESTRO_CLAUDE_CODE.md | ~18 | 1 hora | Ejecución |
| ARQUITECTURA_REFERENCIA_RAPIDA.md | ~12 | 30 min | Continua |
| **TOTAL** | **~65** | **~4.5h** | **Plan** |

*Nota: Lectura inicial completa ~4.5 horas. Después son referencias rápidas.*

---

## ❓ Preguntas Frecuentes

**P: ¿Por dónde empiezo?**
A: 1) ARQUITECTURA_REFERENCIA_RAPIDA.md (30 min) 2) ESPECIFICACION_TECNICA.md (2 horas) 3) PROMPT_MAESTRO_CLAUDE_CODE.md

**P: ¿Puedo saltarme algún documento?**
A: No. ESPECIFICACION_TECNICA.md es obligatorio. PROMPT_MAESTRO es si usas Claude Code.

**P: ¿Qué documento cito en commits?**
A: "Según ESPECIFICACION_TECNICA.md sección 5.1..."

**P: ¿Dónde reporto un problema con el plan?**
A: 1) Verificar ESPECIFICACION_TECNICA.md sección que aplique 2) Verificar ARQUITECTURA_REFERENCIA_RAPIDA.md 3) Si no está claro, crear issue

**P: ¿Puedo modificar los documentos?**
A: Sí, pero documenta el cambio en commit: "[DOCS] Actualizar ESPECIFICACION_TECNICA.md sección X"

---

## 🔗 Referencias Cruzadas

### ESPECIFICACION_TECNICA.md hace referencia a:
- PLAN_IMPLEMENTACION.md → sección 10 (Plan de implementación)
- ARQUITECTURA_REFERENCIA_RAPIDA.md → sección 3 (Modelos de datos)

### PLAN_IMPLEMENTACION.md hace referencia a:
- ESPECIFICACION_TECNICA.md → sección 8 (Integraciones)
- PROMPT_MAESTRO_CLAUDE_CODE.md → instrucciones específicas

### PROMPT_MAESTRO_CLAUDE_CODE.md hace referencia a:
- ESPECIFICACION_TECNICA.md → para contexto
- PLAN_IMPLEMENTACION.md → para roadmap

### ARQUITECTURA_REFERENCIA_RAPIDA.md hace referencia a:
- ESPECIFICACION_TECNICA.md → para detalles
- PLAN_IMPLEMENTACION.md → para timeline

---

## 🎯 Objetivos por Documento

**ESPECIFICACION_TECNICA.md**
✓ Define QUÉ se construye
✓ Define CÓmo se construye
✓ Define cuándo está listo

**PLAN_IMPLEMENTACION.md**
✓ Define CUÁNDO se construye (timeline)
✓ Define QUIÉN construye QUÉ
✓ Define CÓMO se valida cada fase

**PROMPT_MAESTRO_CLAUDE_CODE.md**
✓ Instruye CÓMO implementar FASE 1
✓ Proporciona ejemplos de código
✓ Define criterios de aceptación

**ARQUITECTURA_REFERENCIA_RAPIDA.md**
✓ Visualiza el sistema
✓ Sirve como referencia rápida
✓ Ayuda a entender integraciones

---

## ✅ Checklist Final

Antes de comenzar implementación:

- [ ] Entiendo la visión del proyecto (ESPECIFICACION_TECNICA.md)
- [ ] Entiendo el plan (PLAN_IMPLEMENTACION.md)
- [ ] Tengo la arquitectura clara (ARQUITECTURA_REFERENCIA_RAPIDA.md)
- [ ] Conozco las instrucciones de implementación (PROMPT_MAESTRO_CLAUDE_CODE.md)
- [ ] Tengo ambiente configurado (Python, BD, dependencias)
- [ ] Tengo el repositorio clonado
- [ ] Puedo ejecutar tests
- [ ] Estoy listo para empezar FASE 1

¡Si todo está ✅, comienza!

---

## 📞 Soporte

**¿Pregunta sobre arquitectura?**
→ Consulta ESPECIFICACION_TECNICA.md y ARQUITECTURA_REFERENCIA_RAPIDA.md

**¿Pregunta sobre timeline?**
→ Consulta PLAN_IMPLEMENTACION.md

**¿Necesitas instrucciones paso a paso?**
→ Usa PROMPT_MAESTRO_CLAUDE_CODE.md

**¿No está en documentación?**
→ Crea issue con contexto y referencias al documento más similar

---

**Versión**: 1.0
**Actualizado**: 2026-03-31
**Mantenedor**: Sistema de Importación Bancaria
