# Especificación Técnica: Importación Bancaria para Fluxo (ADAPTADA)

## CONTEXTO: Fluxo Real vs Documentos Generales

Los documentos anteriores asumían un sistema greenfield. **Fluxo ya tiene**:
- ✅ Backend FastAPI con arquitectura router → service → CRUD
- ✅ Frontend React + TypeScript + TanStack Query
- ✅ Base de datos PostgreSQL + SQLAlchemy v2
- ✅ Migraciones con Alembic
- ✅ Tabla `transactions` existente con movimientos
- ✅ Modelos: User, Account, Transaction, Category, Concept

**Lo que NO hace falta crear nuevo**:
- ❌ Sistema paralelo de BD (no repetir tablas)
- ❌ API REST separada (usar routers existentes)
- ❌ Tablas `movimientos` duplicadas
- ❌ Frontend HTML separado (integrar en React)

**Lo que SÍ hay que crear**:
- ✅ Lógica de parseo e importación
- ✅ Rutas API para importación
- ✅ UI React para subir archivos
- ✅ UI React para resolver problemas (FASE 2)
- ✅ Tabla `importaciones` para auditoría
- ✅ Servicios de negocio (normalización, duplicados, categorización)

---

## 1. Decisión Arquitectónica Clave

### ¿Dónde guardar los movimientos importados?

**OPCIÓN A: Directamente en tabla `transactions` (RECOMENDADO)**
```
importar → normalizar → validar → INSERT INTO transactions
```
Pros:
- Una única fuente de verdad
- Dashboard ya ve los datos importados automáticamente
- Menos complejidad
- Auditoría separada en tabla `importaciones`

Cons:
- Si hay error, hay que rollback manualmente
- No hay "staging" para revisar antes

**OPCIÓN B: Tabla staging separada (más seguro)**
```
importar → normalizar → validar → INSERT INTO transactions_staging
                                   ↓ (usuario confirma)
                                   INSERT INTO transactions
```
Pros:
- Usuario revisa antes de confirmar
- Rollback sencillo si hay problemas
- Control granular

Cons:
- Dos tablas paralelas
- Lógica más compleja
- Mantenimiento duplicado

**DECISIÓN AQUÍ**: **OPCIÓN A (directo a transactions)** por simplicidad.
- Si hay problemas, tabla `importaciones` registra qué se importó
- Usuario puede deshacer manualmente desde UI de Fluxo

---

## 2. Arquitectura Adaptada a Fluxo

```
┌─────────────────────────────────────────────────────┐
│ Frontend React                                      │
├─────────────────────────────────────────────────────┤
│ • pages/ImportacionPage.tsx (nueva)                 │
│ • components/ImportadorUI.tsx (nueva)               │
│ • components/ResolutorProblemas.tsx (FASE 2)        │
└───────────┬─────────────────────────────────────────┘
            │ API REST (TanStack Query)
┌───────────▼─────────────────────────────────────────┐
│ Backend FastAPI                                     │
├─────────────────────────────────────────────────────┤
│ routers/importacion_router.py (nuevo)               │
│  └── POST /api/v1/importacion/parsear               │
│  └── POST /api/v1/importacion/confirmar             │
│  └── GET  /api/v1/importacion/estado                │
│                                                     │
│ services/importacion_service.py (nuevo)             │
│  ├── NormalizadorFechas                             │
│  ├── DetectorDuplicados                             │
│  ├── CategorizadorLocal                             │
│  ├── ParserPrex                                     │
│  └── ImportacionService                             │
│                                                     │
│ crud/transaction.py (existente, extender)           │
│ crud/importacion.py (nuevo, auditoría)              │
│                                                     │
│ models/importacion.py (nuevo)                       │
└───────────┬─────────────────────────────────────────┘
            │ SQLAlchemy ORM
┌───────────▼─────────────────────────────────────────┐
│ PostgreSQL                                          │
├─────────────────────────────────────────────────────┤
│ • transactions (existente, se completa)             │
│ • importaciones (nueva, auditoría)                  │
│ • reglas_categorias (nueva, aprendizaje)            │
└─────────────────────────────────────────────────────┘
```

---

## 3. Modelos de Datos

### 3.1 Modelo Alembic: Tabla `importaciones`

```python
# alembic/versions/XXXX_add_importaciones_table.py

from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table(
        'importaciones',
        sa.Column('id', sa.String(32), primary_key=True),
        sa.Column('user_id', sa.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('fecha', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('archivo', sa.String(255)),
        sa.Column('banco', sa.String(50)),  # 'prex', 'itau', etc
        sa.Column('cuenta_id', sa.UUID(as_uuid=True), sa.ForeignKey('accounts.id')),
        sa.Column('total_procesados', sa.Integer, default=0),
        sa.Column('total_importados', sa.Integer, default=0),
        sa.Column('total_descartados', sa.Integer, default=0),
        sa.Column('estado', sa.String(20), default='completed'),  # 'pending', 'completed', 'failed'
        sa.Column('metadata', sa.JSON, nullable=True),  # detalles adicionales
    )
    op.create_index('ix_importaciones_user_id', 'importaciones', ['user_id'])
    op.create_index('ix_importaciones_fecha', 'importaciones', ['fecha'])

def downgrade():
    op.drop_table('importaciones')
```

### 3.2 Modelo Python: Importacion

```python
# backend/app/models/importacion.py

from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.base import Base
from uuid import uuid4
from datetime import datetime

class Importacion(Base):
    __tablename__ = "importaciones"
    
    id = Column(String(32), primary_key=True, default=lambda: str(uuid4())[:12])
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    fecha = Column(DateTime, nullable=False, server_default=func.now())
    archivo = Column(String(255))
    banco = Column(String(50))  # 'prex', 'itau', 'oca', etc
    cuenta_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"))
    total_procesados = Column(Integer, default=0)
    total_importados = Column(Integer, default=0)
    total_descartados = Column(Integer, default=0)
    total_duplicados = Column(Integer, default=0)
    estado = Column(String(20), default="completed")
    metadata = Column(JSON, nullable=True)  # errores, problemas detectados, etc
    
    # Relaciones
    user = relationship("User", back_populates="importaciones")
    account = relationship("Account")
```

### 3.3 Tabla: `reglas_categorias` (aprendizaje local)

```python
# Alembic migration

def upgrade():
    op.create_table(
        'reglas_categorias',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('user_id', sa.UUID(as_uuid=True), sa.ForeignKey('users.id')),
        sa.Column('categoria', sa.String(100)),
        sa.Column('palabra_clave', sa.String(100)),
        sa.Column('confianza', sa.Float, default=0.85),
        sa.Column('created_at', sa.DateTime, default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'categoria', 'palabra_clave', 
                           name='uq_regla_categoria'),
    )
```

---

## 4. Servicios: Lógica de Importación

### 4.1 Ubicación y Estructura

```
backend/app/services/
├── importacion_service.py
│   ├── NormalizadorFechas (utility)
│   ├── DetectorDuplicados (utility)
│   ├── CategorizadorLocal (stateful)
│   ├── ParserPrex (stateful)
│   ├── ParserItau (FASE 3)
│   └── ImportacionService (orquestador)
```

### 4.2 Interfaz del Servicio

```python
# backend/app/services/importacion_service.py

class ImportacionService:
    def __init__(self, db_session, user_id):
        self.db = db_session
        self.user_id = user_id
        self.categorizador = CategorizadorLocal(db_session, user_id)
        
    async def parsear_archivo(
        self,
        archivo: UploadFile,
        banco: str,
        cuenta_id: UUID
    ) -> Dict:
        """
        Parsea archivo bancario y prepara para importación.
        
        Returns:
        {
            "exitosos": int,
            "duplicados": int,
            "errores": int,
            "movimientos": [
                {
                    "fecha": "2026-03-31",
                    "concepto": "MERCADO",
                    "monto": -100.00,
                    "categoria": "Supermercado",
                    "metodo_pago": "Tarjeta Débito",
                    "estado": "validado" | "duplicado" | "error",
                    "metadata": {}
                }
            ],
            "problemas": [...]  # solo si hay
        }
        """
        pass
    
    async def confirmar_importacion(
        self,
        movimientos: List[Dict],
        importacion_id: str
    ) -> Dict:
        """
        Guarda movimientos en BD como transactions.
        
        Returns:
        {
            "estado": "success",
            "importados": int,
            "descartados": int,
            "importacion_id": str
        }
        """
        pass
```

### 4.3 Parser Base

```python
class ParserBancario(ABC):
    """Base para parsers específicos de cada banco."""
    
    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador
    
    @abstractmethod
    async def parsear(
        self,
        archivo: UploadFile,
        cuenta_id: UUID
    ) -> List[Dict]:
        """
        Retorna lista de movimientos normalizados.
        Cada movimiento es un Dict con:
        - fecha (YYYY-MM-DD)
        - concepto (max 100 chars)
        - monto (float, con signo)
        - categoria (str o None)
        - metodo_pago (str)
        - descripcion (str)
        - metadata (dict)
        - hash_movimiento (str, para detectar dups)
        """
        pass
```

### 4.4 Parser Prex Específico

```python
class ParserPrex(ParserBancario):
    """
    Parsea Excel de Prex.
    
    Columnas esperadas:
    Fecha | Descripción | Moneda Origen | Importe Origen | Moneda | Importe | Estado
    
    Mapeo a Transaction:
    - Fecha → fecha
    - Descripción → concepto (truncar a 100)
    - Importe → amount (con signo: negativo = gasto)
    - Moneda → currency (si difiere de la cuenta, anotar en metadata)
    - Moneda Origen, Importe Origen → metadata (para auditoría)
    - Estado → solo importar si = "Confirmado"
    """
    
    async def parsear(
        self,
        archivo: UploadFile,
        cuenta_id: UUID
    ) -> List[Dict]:
        # 1. Guardar archivo temporalmente
        # 2. Leer con pandas
        # 3. Para cada fila:
        #    - Validar estado = "Confirmado"
        #    - Normalizar fecha
        #    - Categorizar automáticamente
        #    - Calcular hash de duplicado
        #    - Crear Dict
        # 4. Limpiar archivo temp
        # 5. Retornar lista
        pass
```

---

## 5. Rutas API: Endpoints

### 5.1 Archivo de Rutas

```python
# backend/app/api/routers/importacion_router.py

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.api.deps import get_db, get_current_user
from app.services.importacion_service import ImportacionService
from app.schemas.importacion import (
    ImportacionResponse,
    ConfirmarImportacionRequest,
    ConfirmarImportacionResponse
)

router = APIRouter(prefix="/importacion", tags=["importacion"])

@router.post("/parsear", response_model=ImportacionResponse)
async def parsear_archivo(
    file: UploadFile = File(...),
    banco: str = Query(...),  # 'prex', 'itau', etc
    cuenta_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Parsea un archivo bancario y prepara para importación.
    
    NO guarda nada aún, solo valida y muestra resultado.
    """
    
    # Validar que la cuenta pertenece al usuario
    account = await db.get(Account, str(cuenta_id))
    if not account or account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cuenta no encontrada")
    
    # Crear servicio y parsear
    servicio = ImportacionService(db, current_user.id)
    resultado = await servicio.parsear_archivo(file, banco, cuenta_id)
    
    return ImportacionResponse(**resultado)

@router.post("/confirmar", response_model=ConfirmarImportacionResponse)
async def confirmar_importacion(
    request: ConfirmarImportacionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Confirma y guarda los movimientos importados.
    """
    
    servicio = ImportacionService(db, current_user.id)
    resultado = await servicio.confirmar_importacion(
        request.movimientos,
        request.importacion_id
    )
    
    return ConfirmarImportacionResponse(**resultado)

@router.get("/historial")
async def historial_importaciones(
    skip: int = 0,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna historial de importaciones del usuario.
    """
    stmt = select(Importacion).where(
        Importacion.user_id == current_user.id
    ).offset(skip).limit(limit).order_by(Importacion.fecha.desc())
    
    importaciones = await db.scalars(stmt)
    return [ImportacionSchema.from_orm(imp) for imp in importaciones]
```

### 5.2 Schemas Pydantic

```python
# backend/app/schemas/importacion.py

from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

class MovimientoImportado(BaseModel):
    fecha: str  # YYYY-MM-DD
    concepto: str
    monto: float
    categoria: Optional[str]
    metodo_pago: str
    descripcion: Optional[str]
    estado: str  # 'validado', 'duplicado', 'error'
    metadata: Dict[str, Any] = {}

class ProblemaDetectado(BaseModel):
    tipo: str  # 'duplicado_exacto', 'categoria_faltante', etc
    movimiento_idx: int  # índice en la lista
    descripcion: str
    sugerencia: str

class ImportacionResponse(BaseModel):
    exitosos: int
    duplicados: int
    errores: int
    movimientos: List[MovimientoImportado]
    problemas: List[ProblemaDetectado] = []

class ConfirmarImportacionRequest(BaseModel):
    importacion_id: str
    movimientos: List[MovimientoImportado]
    cuenta_id: UUID

class ConfirmarImportacionResponse(BaseModel):
    estado: str  # 'success', 'partial', 'failed'
    importados: int
    descartados: int
    importacion_id: str
```

---

## 6. CRUD: Operaciones en BD

### 6.1 CRUD de Importación

```python
# backend/app/crud/importacion.py

async def crear_importacion(
    db: AsyncSession,
    user_id: UUID,
    banco: str,
    cuenta_id: UUID,
    archivo: str,
    metadata: Dict
) -> Importacion:
    """Crea registro de auditoría."""
    obj = Importacion(
        user_id=user_id,
        banco=banco,
        cuenta_id=cuenta_id,
        archivo=archivo,
        metadata=metadata
    )
    db.add(obj)
    await db.flush()
    return obj

async def actualizar_importacion(
    db: AsyncSession,
    importacion_id: str,
    total_procesados: int,
    total_importados: int,
    total_descartados: int,
    total_duplicados: int,
    estado: str,
    metadata: Dict
) -> Importacion:
    """Actualiza registro de auditoría con resultados."""
    importacion = await db.get(Importacion, importacion_id)
    importacion.total_procesados = total_procesados
    importacion.total_importados = total_importados
    importacion.total_descartados = total_descartados
    importacion.total_duplicados = total_duplicados
    importacion.estado = estado
    importacion.metadata = metadata
    await db.flush()
    return importacion
```

### 6.2 Extender CRUD de Transaction

```python
# backend/app/crud/transaction.py (agregar)

async def crear_transacciones_batch(
    db: AsyncSession,
    movimientos: List[Dict],
    user_id: UUID,
    cuenta_id: UUID
) -> List[Transaction]:
    """Crea múltiples transacciones en batch."""
    transacciones = []
    for mov in movimientos:
        # Buscar concepto existente o crear
        concepto = await obtener_concepto(db, mov['concepto'], user_id)
        if not concepto:
            concepto = await crear_concepto(db, mov['concepto'], 
                                           mov['categoria'], user_id)
        
        # Crear transacción
        trans = Transaction(
            user_id=user_id,
            account_id=cuenta_id,
            type='expense' if mov['monto'] < 0 else 'income',
            amount=abs(mov['monto']),
            date=datetime.fromisoformat(mov['fecha']),
            concept_id=concepto.id,
            category_id=concepto.category_id,
            payment_method=mov['metodo_pago'],
            description=mov.get('descripcion', ''),
            metadata={
                'origen_importacion': mov.get('origen_importacion'),
                'hash_movimiento': mov.get('hash_movimiento'),
                'metadata_banco': mov.get('metadata', {})
            }
        )
        transacciones.append(trans)
        db.add(trans)
    
    await db.flush()
    return transacciones
```

---

## 7. Frontend: Componentes React

### 7.1 Ubicación

```
frontend/src/
├── pages/
│   └── ImportacionPage.tsx (nueva)
├── components/
│   ├── ImportadorUI.tsx (nueva)
│   └── ResolutorProblemas.tsx (FASE 2, nueva)
└── services/
    └── importacionService.ts (nueva)
```

### 7.2 Hook de API: ImportacionService

```typescript
// frontend/src/services/importacionService.ts

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { UUID } from "crypto";

interface MovimientoImportado {
  fecha: string;
  concepto: string;
  monto: number;
  categoria?: string;
  metodo_pago: string;
  descripcion?: string;
  estado: "validado" | "duplicado" | "error";
  metadata: Record<string, any>;
}

interface ImportacionResponse {
  exitosos: number;
  duplicados: number;
  errores: number;
  movimientos: MovimientoImportado[];
  problemas: Array<{
    tipo: string;
    movimiento_idx: number;
    descripcion: string;
    sugerencia: string;
  }>;
}

export const useParsearArchivo = () => {
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await api.post<ImportacionResponse>(
        "/v1/importacion/parsear",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      return response.data;
    },
  });
};

export const useConfirmarImportacion = () => {
  return useMutation({
    mutationFn: async (data: {
      importacion_id: string;
      movimientos: MovimientoImportado[];
      cuenta_id: UUID;
    }) => {
      const response = await api.post(
        "/v1/importacion/confirmar",
        data
      );
      return response.data;
    },
  });
};
```

### 7.3 Componente: ImportadorUI

```typescript
// frontend/src/components/ImportadorUI.tsx

import { useState } from "react";
import { useParsearArchivo } from "@/services/importacionService";

export function ImportadorUI() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    banco: "prex",
    cuenta_id: "",
  });
  const [resultado, setResultado] = useState(null);
  const parsear = useParsearArchivo();

  const handleUpload = async (file: File) => {
    const data = new FormData();
    data.append("file", file);
    data.append("banco", formData.banco);
    data.append("cuenta_id", formData.cuenta_id);

    const res = await parsear.mutateAsync(data);
    setResultado(res);
    setStep(2);
  };

  if (step === 1) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Importar Movimientos</h1>
        {/* UI para seleccionar banco, cuenta y upload */}
        <select value={formData.banco} onChange={(e) => 
          setFormData({...formData, banco: e.target.value})
        }>
          <option value="prex">Prex</option>
          <option value="itau">Itaú</option>
          {/* etc */}
        </select>
        <input
          type="file"
          accept=".xlsx,.csv,.pdf"
          onChange={(e) => handleUpload(e.target.files?.[0]!)}
        />
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4">Resultado</h2>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-100 p-4 rounded">
            <p className="text-sm text-gray-600">Válidos</p>
            <p className="text-2xl font-bold">{resultado?.exitosos}</p>
          </div>
          <div className="bg-yellow-100 p-4 rounded">
            <p className="text-sm text-gray-600">Duplicados</p>
            <p className="text-2xl font-bold">{resultado?.duplicados}</p>
          </div>
          <div className="bg-red-100 p-4 rounded">
            <p className="text-sm text-gray-600">Errores</p>
            <p className="text-2xl font-bold">{resultado?.errores}</p>
          </div>
        </div>
        {/* Tabla de movimientos */}
        {/* Botón confirmar */}
      </div>
    );
  }
}
```

---

## 8. Integración con Fluxo Existente

### 8.1 Actualizar rutas principales

```python
# backend/app/api/api.py

from app.api.routers import (
    users,
    accounts,
    transactions,
    categories,
    importacion,  # NUEVA
    # ...
)

api_router = APIRouter()
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(importacion.router, prefix="/importacion", tags=["importacion"])
# ...
```

### 8.2 Integración con Dashboard

El dashboard existente `DashboardPage.tsx` mostrará automáticamente los movimientos importados porque:
- Se guardan como `Transaction` normales
- El gráfico de ingresos/gastos ya los incluye
- Las categorías ya están calibradas

Solo hay que agregar un botón en el header para ir a ImportacionPage.

---

## 9. FASE 1: Checklist Específico para Fluxo

```
DATABASE:
├─ [ ] Crear migración Alembic para tabla importaciones
├─ [ ] Crear migración Alembic para tabla reglas_categorias
└─ [ ] Ejecutar migraciones

BACKEND:
├─ [ ] backend/app/models/importacion.py (Importacion, ReglaCategorias)
├─ [ ] backend/app/services/importacion_service.py
│   ├─ [ ] NormalizadorFechas
│   ├─ [ ] DetectorDuplicados
│   ├─ [ ] CategorizadorLocal
│   ├─ [ ] ParserPrex
│   └─ [ ] ImportacionService
├─ [ ] backend/app/crud/importacion.py
├─ [ ] Extender backend/app/crud/transaction.py
├─ [ ] backend/app/api/routers/importacion_router.py
│   ├─ [ ] POST /api/v1/importacion/parsear
│   ├─ [ ] POST /api/v1/importacion/confirmar
│   └─ [ ] GET /api/v1/importacion/historial
├─ [ ] backend/app/schemas/importacion.py
└─ [ ] Tests: backend/tests/test_importacion_service.py (>90%)

FRONTEND:
├─ [ ] frontend/src/services/importacionService.ts (hooks)
├─ [ ] frontend/src/components/ImportadorUI.tsx
├─ [ ] frontend/src/pages/ImportacionPage.tsx
├─ [ ] Agregar botón en header para ir a ImportacionPage
└─ [ ] Tests: frontend/src/__tests__/ImportadorUI.test.tsx

VERIFICACIÓN:
├─ [ ] Tests pasan al 90%+
├─ [ ] User puede subir archivo Prex en <5 segundos
├─ [ ] Movimientos aparecen en BD y en dashboard
├─ [ ] No hay duplicados si importa 2 veces
└─ [ ] Auditoría guardada en tabla importaciones
```

---

## 10. Diferencias vs Documentos Anteriores

| Aspecto | Docs Generales | Fluxo Adaptado |
|--------|---|---|
| Tabla de movimientos | `movimientos` (nueva) | `transactions` (existente) |
| Framework backend | Flask/simple | FastAPI + SQLAlchemy v2 |
| Migraciones | SQL crudo | Alembic |
| Frontend | HTML separado | React TypeScript |
| API | rutas simples | Schemas Pydantic |
| ORM | Simple CRUD | SQLAlchemy session async |
| Base de datos | SQLite/MySQL | PostgreSQL |
| Auditoría | tabla `importaciones` | tabla `importaciones` (igual) |

---

## 11. Cómo Interpretar los Documentos Anteriores

- **ESPECIFICACION_TECNICA.md**: 80% aplicable. Ignorar secciones de "Base de datos", "Rutas API", "Estructura de archivos". Guardar para conceptos de negocio.
- **PLAN_IMPLEMENTACION.md**: 100% aplicable. La timeline y fases son válidas.
- **PROMPT_MAESTRO_CLAUDE_CODE.md**: 30% aplicable. Fue escrito para Flask. Necesita adaptación grande.
- **ARQUITECTURA_REFERENCIA_RAPIDA.md**: 50% aplicable. Útil para flujo de datos conceptual.

---

**Próximo Paso**: Decidir si usar **OPCIÓN A (directo a transactions)** o **OPCIÓN B (staging)** y luego crear PROMPT_MAESTRO_FLUXO adaptado.
