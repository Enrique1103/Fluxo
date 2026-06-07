# 🧪 QA Template — Plantilla Base para Checklists

> **Este es el template universal.** Cada feature tiene su propio checklist específico (`QA-F01.md`, `QA-F02.md`, etc.), pero TODOS incluyen los puntos transversales que están acá.

---

## 🎯 Cómo usar un checklist de QA

1. **Antes de cerrar una feature**, abrir el `QA-F0X-*.md` correspondiente.
2. **Tildar cada checkbox** verificando manualmente. No tildes algo que no verificaste.
3. **Si algo falla**, NO pongas la feature como completa. Volvé con Claude Code y arreglálo.
4. **Si dudás de un punto**, marcalo con ❓ y consultame antes de seguir.

Tracy: *"Inspect what you expect."* — la calidad no es accidente, es verificación deliberada.

---

## 📋 Checklist Transversal (aplica a TODAS las features)

### 🧪 Tests automatizados

- [ ] `pytest backend/tests/` corre sin errores
- [ ] El conteo de tests es ≥ al baseline previo (no se "perdieron" tests)
- [ ] No hay tests skippeados sin razón documentada
- [ ] No hay tests con `pytest.mark.xfail` sin razón documentada
- [ ] Los tests nuevos cubren happy path + error paths + aislamiento de usuarios
- [ ] Si hay migraciones, `alembic upgrade head` corre sin errores en DB limpia

### 🏗️ Estructura y convenciones

- [ ] El código nuevo sigue la separación de capas: Router → Service → CRUD → Model
- [ ] La capa CRUD NO hace `db.commit()`
- [ ] Los servicios SÍ hacen `db.commit()` al final de operaciones de escritura
- [ ] Naming en Python: `snake_case` para funciones/variables, `PascalCase` para clases
- [ ] Naming en TypeScript: `camelCase` para funciones, `PascalCase` para componentes
- [ ] Type hints presentes en todas las funciones públicas de Python
- [ ] Tipos explícitos en TypeScript, sin `any` injustificado

### 🔒 Seguridad y aislamiento

- [ ] Toda query nueva filtra por `user_id = current_user.id` (P1)
- [ ] No se exponen datos de otros usuarios sin pasar por hogares
- [ ] Las contraseñas (si se tocan) siguen hasheadas con bcrypt
- [ ] Los tokens JWT se verifican contra `revoked_tokens` (P5)
- [ ] CORS no se relajó accidentalmente
- [ ] No se loguean datos sensibles (contraseñas, tokens, números de cuenta)

### 📐 Modelo de datos

- [ ] Si se modificó algún modelo, se generó migración Alembic
- [ ] La migración tiene `up` y `down` correctamente implementados
- [ ] La migración se aplicó sin errores en DB local
- [ ] Si la migración modifica datos existentes, se preservaron correctamente
- [ ] No se rompió la coherencia con `Transaction.user_id` siempre presente (P7)
- [ ] Transferencias (SOURCE + DESTINATION) siguen funcionando como par

### 🚦 API

- [ ] Endpoints nuevos tienen prefijo `/api/v1/`
- [ ] Códigos HTTP correctos según P21:
  - GET, PUT, PATCH exitoso → 200
  - POST que crea → 201
  - DELETE → 204
  - Auth inválido → 401
  - Acceso prohibido → 403
  - No encontrado → 404
  - Duplicado → 409
  - Regla de negocio violada → 422
- [ ] Mensajes de error en español, comprensibles (P19)
- [ ] No hay stack traces visibles al cliente

### 🎨 Frontend

- [ ] No hay `console.log` ni `console.error` olvidados
- [ ] No hay imports comentados o código muerto
- [ ] Estados de loading manejados correctamente
- [ ] Estados de error muestran mensajes útiles al usuario (en español)
- [ ] React Query invalida las queries correctas después de mutaciones
- [ ] No se duplican datos del servidor en Zustand
- [ ] Componentes nuevos compilan sin warnings (`npm run build`)
- [ ] La app sigue siendo responsive (mobile + desktop)
- [ ] No hay errores de hidratación SSR (si aplica)

### 🧹 Higiene de código

- [ ] No quedaron comentarios `// TODO` ni `# TODO` sin issue asociado
- [ ] No hay código comentado (eliminado o explicado)
- [ ] No hay imports no usados
- [ ] No hay variables declaradas pero no usadas
- [ ] Los archivos nuevos tienen docstring al inicio (Python) o comentario header (TS)

### 📝 Documentación y commits

- [ ] Los commits son atómicos y siguen el formato `tipo(scope): descripción`
- [ ] La rama está aislada (`feature/F0X-*`)
- [ ] El `99-DECISIONES-PENDIENTES.md` está actualizado si surgieron decisiones nuevas
- [ ] El `00-README.md` está actualizado marcando la feature como ✅ si se completó

---

## ✅ Verificación manual

Después de pasar el checklist transversal, hacé verificación manual:

### Paso 1: Levantar el sistema
```bash
# Terminal 1
cd backend
alembic upgrade head
uvicorn app.main:app --reload

# Terminal 2
cd frontend
npm run dev
```

- [ ] Backend levanta sin errores
- [ ] Frontend levanta sin errores
- [ ] El log de uvicorn NO muestra warnings raros

### Paso 2: Login y navegación básica

- [ ] Puedo loguearme con un usuario existente
- [ ] Las páginas principales cargan sin errores
- [ ] No hay errores rojos en la consola del browser
- [ ] La nueva feature está accesible desde donde corresponde

### Paso 3: Happy path de la feature
*Específico de cada feature — ver `QA-F0X-*.md`*

### Paso 4: Edge cases
*Específico de cada feature — ver `QA-F0X-*.md`*

### Paso 5: Verificación de regresión

- [ ] Funciones existentes (no relacionadas con esta feature) siguen funcionando
- [ ] Importación bancaria sigue funcionando
- [ ] Dashboard personal sigue funcionando
- [ ] Hogares existentes (pre-feature) siguen accesibles
- [ ] Las metas financieras siguen funcionando
- [ ] Login/logout/registro funcionan

---

## 🚨 Señales de alarma durante QA

Si encontrás cualquiera de estos, **PARÁ la feature** y volvé con Claude Code:

### Señal 1: Tests que pasaron antes ahora fallan
**Acción:** investigá QUÉ se rompió. NO modifiques los tests para que pasen. Hay un bug real.

### Señal 2: Tests "nuevos" que tildan happy path pero no errores
**Acción:** pedí a Claude Code que agregue tests de validación y errores.

### Señal 3: Aparecieron archivos modificados que no estaban en la lista permitida
**Acción:** revisá el diff. Si es injustificado, pedí revert.

### Señal 4: Errores 500 en operaciones normales
**Acción:** mirá los logs de uvicorn. Casi seguro es una excepción de dominio no registrada o un null pointer.

### Señal 5: La feature "funciona" pero los datos quedan inconsistentes
**Acción:** este es el peor caso. La feature está mal diseñada. Hay que rediseñar antes de mergear.

Ejemplo: borrás una transacción del hogar y los saldos del hogar se desactualizan pero los del personal sí.

---

## 📊 Reporte de QA

Después de pasar el checklist completo, genera un reporte breve:

```markdown
# QA Report — F0X

**Fecha:** YYYY-MM-DD
**Verificado por:** [Vos]
**Branch:** feature/F0X-nombre
**Commit hash:** abc1234

## Resultado: ✅ APROBADO / ❌ RECHAZADO

## Tests
- Tests totales: 183 (123 baseline + 60 nuevos)
- Pasando: 183 ✅
- Fallando: 0

## Verificación manual
- Happy path: ✅ funciona como esperado
- Edge cases: ✅ ✅ ✅ (3 de 3 verificados)
- Regresión: ✅ funciones existentes intactas

## Notas
- [Cualquier observación relevante]
- [Bugs menores encontrados que NO bloquean merge pero se anotan]

## Listo para merge: SÍ / NO
```

Este reporte queda como artefacto histórico de la feature.

---

## 🎓 Filosofía del QA

> **No estás probando que funciona. Estás intentando romperlo.**

El QA bien hecho es **adversarial**: tu trabajo es encontrar el caso donde se cae. Si no pudiste romper la feature en 30 minutos de intentos genuinos, podés mergear. Si en cambio pasaste 30 minutos confirmando que funciona el camino feliz, **no hiciste QA**, hiciste demo.

Casos típicos donde se rompen las features:
- Datos vacíos / nulos
- Valores extremos (0, negativos, gigantes)
- Concurrencia (dos requests al mismo tiempo)
- Caracteres especiales (acentos, emojis, comillas)
- Operaciones repetidas (¿es idempotente?)
- Usuario sin permisos intentando la operación
- Sesión expirada a mitad de operación
- Red intermitente / desconexión

Tracy: *"Whatever can go wrong will go wrong — at the worst possible moment."* Ley de Murphy aplicada a software.

---

> **Próximo:** abrí el `QA-F0X-*.md` específico de la feature que acabás de implementar.
