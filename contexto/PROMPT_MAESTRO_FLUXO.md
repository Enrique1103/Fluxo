# 🚀 PROMPT MAESTRO FLUXO: Sistema de Importación Bancaria

## VERSIÓN ADAPTADA A FLUXO REAL

Este prompt reemplaza el anterior. Está escrito específicamente para:
- FastAPI + SQLAlchemy v2 + Alembic
- PostgreSQL
- React + TypeScript + TanStack Query
- Arquitectura existente de Fluxo

---

## CONTEXTO

Fluxo ya tiene todo el stack montado. Tu tarea es **integrar** importación bancaria sin crear sistemas paralelos.

**Lo que EXISTE**:
- ✅ Backend FastAPI con router → service → CRUD
- ✅ Frontend React con TanStack Query
- ✅ Base de datos PostgreSQL + SQLAlchemy v2
- ✅ Tabla `transactions` para movimientos
- ✅ Tabla `accounts` para cuentas
- ✅ Tabla `categories` y `concepts` para clasificación

**Lo que CREARÁS**:
- ✅ Tabla `importaciones` (auditoría)
- ✅ Tabla `reglas_categorias` (aprendizaje)
- ✅ Services: parseo, normalización, categorización
- ✅ API: `/api/v1/importacion/parsear`, `/api/v1/importacion/confirmar`
- ✅ React: página de importación

**Lo que NO habrá**:
- ❌ Tabla `movimientos` paralela
- ❌ Sistema de BD separado
- ❌ HTML con UI separada
- ❌ API desconectada del stack actual

---

## DECISIÓN ARQUITECTÓNICA

**¿Dónde guardar los movimientos importados?**

**OPCIÓN RECOMENDADA: DIRECTO A `transactions`**

```
Usuario sube archivo Prex.xlsx
    ↓
Sistema parsea y normaliza
    ↓
Detecta duplicados y problemas
    ↓
Usuario confirma (o no)
    ↓
INSERT INTO transactions (como movimiento normal)
    ↓
Dashboard ya lo ve automáticamente
```

**Ventajas**:
- Una tabla, una fuente de verdad
- Dashboard no necesita cambios
- Tabla `importaciones` registra auditoría
- Rollback manual desde UI si es necesario

**Desventajas**:
- Menos control pre-importación
- No hay "staging" temporal

**Decisión**: Usar OPCIÓN RECOMENDADA. Si hay error, usuario deshacer desde Fluxo normalmente.

---

## ESTRUCTURA: FASE 1 COMPLETA

```
FASE 1: MVP Importar Prex Funcional

├─ DATABASE
│  ├─ Migración: tabla importaciones
│  └─ Migración: tabla reglas_categorias
│
├─ BACKEND
│  ├─ backend/app/models/importacion.py
│  │  ├─ class Importacion (modelo SQLAlchemy)
│  │  └─ class ReglaCategorias (modelo SQLAlchemy)
│  │
│  ├─ backend/app/services/importacion_service.py
│  │  ├─ class NormalizadorFechas (stateless)
│  │  ├─ class DetectorDuplicados (stateless)
│  │  ├─ class CategorizadorLocal (stateful, aprende)
│  │  ├─ class ParserPrex (implementación específica)
│  │  └─ class ImportacionService (orquestador)
│  │
│  ├─ backend/app/crud/importacion.py
│  │  ├─ crear_importacion()
│  │  └─ actualizar_importacion()
│  │
│  ├─ backend/app/crud/transaction.py (extender)
│  │  └─ crear_transacciones_batch()
│  │
│  ├─ backend/app/schemas/importacion.py
│  │  ├─ MovimientoImportado
│  │  ├─ ImportacionResponse
│  │  └─ ConfirmarImportacionRequest
│  │
│  └─ backend/app/api/routers/importacion_router.py
│     ├─ POST /api/v1/importacion/parsear
│     ├─ POST /api/v1/importacion/confirmar
│     └─ GET /api/v1/importacion/historial
│
├─ FRONTEND
│  ├─ frontend/src/services/importacionService.ts
│  │  ├─ useParsearArchivo()
│  │  ├─ useConfirmarImportacion()
│  │  └─ useHistorialImportaciones()
│  │
│  ├─ frontend/src/components/ImportadorUI.tsx
│  │  ├─ Paso 1: Seleccionar banco y cuenta
│  │  ├─ Paso 2: Subir archivo
│  │  └─ Paso 3: Revisar resultado
│  │
│  └─ frontend/src/pages/ImportacionPage.tsx
│     └─ Layout + enrutamiento
│
└─ TESTS
   ├─ backend/tests/test_importacion_service.py (>90%)
   └─ backend/tests/test_parsers.py (>90%)
```

---

## PASO A PASO: IMPLEMENTACIÓN FASE 1

### PASO 1: Migraciones Alembic (30 min)

**Archivo**: `alembic/versions/XXXXXXXX_add_importacion_tables.py`

```python
"""Add importacion tables"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade():
    # Tabla importaciones
    op.create_table(
        'importaciones',
        sa.Column('id', sa.String(32), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('fecha', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('archivo', sa.String(255), nullable=True),
        sa.Column('banco', sa.String(50), nullable=True),
        sa.Column('cuenta_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('total_procesados', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_importados', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_descartados', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_duplicados', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('estado', sa.String(20), nullable=False, server_default='completed'),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['cuenta_id'], ['accounts.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_importaciones_user_id', 'importaciones', ['user_id'], unique=False)
    op.create_index('ix_importaciones_fecha', 'importaciones', ['fecha'], unique=False)
    
    # Tabla reglas_categorias
    op.create_table(
        'reglas_categorias',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('categoria', sa.String(100), nullable=True),
        sa.Column('palabra_clave', sa.String(100), nullable=True),
        sa.Column('confianza', sa.Float(), nullable=False, server_default='0.85'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'categoria', 'palabra_clave', 
                           name='uq_regla_categoria')
    )

def downgrade():
    op.drop_table('reglas_categorias')
    op.drop_table('importaciones')
```

**Ejecutar**:
```bash
alembic upgrade head
```

---

### PASO 2: Modelos SQLAlchemy (1 hora)

**Archivo**: `backend/app/models/importacion.py`

```python
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, Float, func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base
from uuid import uuid4
from datetime import datetime

class Importacion(Base):
    __tablename__ = "importaciones"
    
    id = Column(String(32), primary_key=True, default=lambda: str(uuid4())[:12])
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    fecha = Column(DateTime, nullable=False, server_default=func.now())
    archivo = Column(String(255), nullable=True)
    banco = Column(String(50), nullable=True)  # 'prex', 'itau', etc
    cuenta_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True)
    total_procesados = Column(Integer, nullable=False, default=0)
    total_importados = Column(Integer, nullable=False, default=0)
    total_descartados = Column(Integer, nullable=False, default=0)
    total_duplicados = Column(Integer, nullable=False, default=0)
    estado = Column(String(20), nullable=False, default="completed")  # pending, completed, failed
    metadata = Column(JSON, nullable=True)
    
    # Relaciones
    user = relationship("User", back_populates="importaciones")
    account = relationship("Account")

class ReglaCategorias(Base):
    __tablename__ = "reglas_categorias"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    categoria = Column(String(100), nullable=False)
    palabra_clave = Column(String(100), nullable=False)
    confianza = Column(Float, nullable=False, default=0.85)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    
    # Relación
    user = relationship("User")
```

**Agregar a `User` model**:
```python
importaciones = relationship("Importacion", back_populates="user")
```

---

### PASO 3: Servicio de Importación (2 horas)

**Archivo**: `backend/app/services/importacion_service.py`

**ESTRUCTURA**:
```python
import hashlib
from datetime import datetime
from typing import Dict, List, Optional
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

# 1. NORMALIZADORES (stateless utilities)

class NormalizadorFechas:
    """Convierte cualquier fecha a YYYY-MM-DD"""
    FORMATOS = [
        "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%Y-%m-%d",
        "%d/%m/%y", "%m/%d/%Y"
    ]
    
    @staticmethod
    def normalizar(fecha_str: str) -> str:
        """Retorna YYYY-MM-DD o lanza ValueError"""
        for fmt in NormalizadorFechas.FORMATOS:
            try:
                fecha = datetime.strptime(str(fecha_str).strip(), fmt)
                return fecha.strftime("%Y-%m-%d")
            except ValueError:
                continue
        raise ValueError(f"No se pudo parsear: {fecha_str}")

class DetectorDuplicados:
    """Detecta movimientos duplicados con hash SHA256"""
    
    @staticmethod
    def generar_hash(fecha: str, concepto: str, monto: float, cuenta_id: UUID) -> str:
        """Hash único de 16 caracteres"""
        dato = f"{fecha}|{concepto}|{monto}|{str(cuenta_id)}"
        return hashlib.sha256(dato.encode()).hexdigest()[:16]

# 2. CATEGORIZADOR (stateful, con aprendizaje)

class CategorizadorLocal:
    """Categoriza movimientos con palabras clave. Aprende del usuario."""
    
    def __init__(self, db: AsyncSession, user_id: UUID):
        self.db = db
        self.user_id = user_id
        self.reglas_predefinidas = self._cargar_reglas_predefinidas()
        self.reglas_personalizadas = {}  # cargarás desde BD
    
    def _cargar_reglas_predefinidas(self) -> Dict[str, List[str]]:
        return {
            "Supermercado": ["MERCADO", "SUPER", "ALMACÉN", "CARREFOUR", "ALDI"],
            "Combustible": ["GASOLINA", "NAFTA", "YPF", "SHELL", "ANCAP"],
            "Transferencia": ["TRANSFERENCIA", "TRN", "ENVÍO"],
            "Farmacia": ["FARMACIA", "FARMACÉUTICO"],
            "Entretenimiento": ["CINE", "TEATRO", "RESTAURANTE", "NETFLIX"],
            "Utilidades": ["AGUA", "LUZ", "GAS", "INTERNET", "UTE", "OSE"],
            # ... agregar más según sea necesario
        }
    
    async def cargar_reglas_personalizadas(self):
        """Cargar desde BD las reglas que aprendió del usuario"""
        # SELECT * FROM reglas_categorias WHERE user_id = ?
        # Almacenar en self.reglas_personalizadas
        pass
    
    def categorizar(self, concepto: str) -> tuple[Optional[str], float]:
        """
        Retorna: (categoría, confianza)
        
        Búsqueda:
        1. Reglas personalizadas (confianza 0.95)
        2. Reglas predefinidas (confianza 0.85)
        3. None (no encontrado)
        """
        concepto_upper = concepto.upper()
        
        # Buscar en personalizadas primero
        for cat, palabras in self.reglas_personalizadas.items():
            if any(p.upper() in concepto_upper for p in palabras):
                return cat, 0.95
        
        # Buscar en predefinidas
        for cat, palabras in self.reglas_predefinidas.items():
            if any(p.upper() in concepto_upper for p in palabras):
                return cat, 0.85
        
        return None, 0.0
    
    async def registrar_aprendizaje(self, concepto: str, categoria: str):
        """Guardar esta decisión para futuras importaciones"""
        # INSERT INTO reglas_categorias (user_id, categoria, palabra_clave, confianza)
        # SELECT FIRST palabras significativas de concepto
        pass

# 3. PARSER BASE (Abstract)

class ParserBancario:
    """Base para parsers específicos"""
    
    def __init__(self, categorizador: CategorizadorLocal):
        self.categorizador = categorizador
    
    async def parsear(self, archivo, cuenta_id: UUID) -> List[Dict]:
        """
        Retorna lista de movimientos normalizados:
        {
            "fecha": "YYYY-MM-DD",
            "concepto": "str",
            "monto": float,
            "categoria": str,
            "metodo_pago": str,
            "descripcion": str,
            "estado": "validado" | "duplicado" | "error",
            "hash_movimiento": str,
            "metadata": {}
        }
        """
        raise NotImplementedError

# 4. PARSER PREX (implementación específica)

class ParserPrex(ParserBancario):
    """Parsea Excel de Prex"""
    
    async def parsear(self, archivo, cuenta_id: UUID) -> List[Dict]:
        # 1. Guardar archivo temporalmente
        # 2. Leer con pandas
        df = pd.read_excel(archivo.file)
        
        movimientos = []
        
        for idx, row in df.iterrows():
            # Validar que Status = "Confirmado"
            if row.get('Estado', '').strip() != 'Confirmado':
                continue
            
            try:
                # Normalizar fecha
                fecha = NormalizadorFechas.normalizar(row['Fecha'])
                
                # Concepto
                concepto = str(row['Descripción']).strip()[:100]
                
                # Monto
                monto = float(row['Importe'])
                
                # Categorizar
                categoria, confianza = self.categorizador.categorizar(concepto)
                
                # Hash de duplicado
                hash_mov = DetectorDuplicados.generar_hash(
                    fecha, concepto, monto, cuenta_id
                )
                
                # Crear movimiento
                mov = {
                    "fecha": fecha,
                    "concepto": concepto,
                    "monto": monto,
                    "categoria": categoria,
                    "metodo_pago": "Tarjeta Débito",  # Prex siempre es débito
                    "descripcion": f"Origen: {row.get('Moneda Origen', '')}",
                    "estado": "validado",
                    "hash_movimiento": hash_mov,
                    "metadata": {
                        "moneda_origen": row.get('Moneda Origen'),
                        "importe_origen": float(row.get('Importe Origen', 0)),
                        "moneda": row.get('Moneda', 'UYU'),
                    }
                }
                movimientos.append(mov)
            
            except Exception as e:
                # Agregar a lista con estado error
                movimientos.append({
                    "estado": "error",
                    "error": str(e),
                    "fila": idx + 2
                })
        
        # 3. Limpiar archivo temporal
        # 4. Retornar
        return movimientos

# 5. SERVICIO ORQUESTADOR

class ImportacionService:
    """Orquesta el flujo completo de importación"""
    
    def __init__(self, db: AsyncSession, user_id: UUID):
        self.db = db
        self.user_id = user_id
        self.categorizador = CategorizadorLocal(db, user_id)
    
    async def parsear_archivo(
        self,
        archivo,
        banco: str,
        cuenta_id: UUID
    ) -> Dict:
        """
        Parsea y prepara para importación.
        NO guarda nada aún.
        """
        
        # Crear parser según banco
        if banco == 'prex':
            parser = ParserPrex(self.categorizador)
        elif banco == 'itau':
            # ParserItau(self.categorizador)  # FASE 3
            raise NotImplementedError
        else:
            raise ValueError(f"Banco no soportado: {banco}")
        
        # Parsear
        movimientos = await parser.parsear(archivo, cuenta_id)
        
        # Detectar duplicados vs BD existente
        duplicados_ids = await self._detectar_duplicados_en_bd(
            movimientos, cuenta_id
        )
        
        # Marcar como duplicados
        for mov in movimientos:
            if mov.get("hash_movimiento") in duplicados_ids:
                mov["estado"] = "duplicado"
        
        # Contar estados
        resultado = {
            "exitosos": len([m for m in movimientos if m.get("estado") == "validado"]),
            "duplicados": len([m for m in movimientos if m.get("estado") == "duplicado"]),
            "errores": len([m for m in movimientos if m.get("estado") == "error"]),
            "movimientos": movimientos,
            "problemas": []  # FASE 2
        }
        
        return resultado
    
    async def _detectar_duplicados_en_bd(
        self,
        movimientos: List[Dict],
        cuenta_id: UUID
    ) -> set[str]:
        """
        Buscar movimientos que ya existen en la BD.
        Retorna set de hashes que son duplicados.
        """
        # SELECT hash_movimiento FROM transactions
        # WHERE account_id = cuenta_id AND user_id = user_id
        # Retornar como set
        pass
    
    async def confirmar_importacion(
        self,
        movimientos: List[Dict],
        cuenta_id: UUID,
        banco: str,
        archivo_nombre: str
    ) -> Dict:
        """
        Guarda movimientos validados como transacciones normales.
        Registra auditoría.
        """
        
        # Crear registro de importación
        importacion = await crear_importacion(
            self.db,
            user_id=self.user_id,
            banco=banco,
            cuenta_id=cuenta_id,
            archivo=archivo_nombre,
            metadata={}
        )
        
        # Filtrar movimientos validados
        a_importar = [m for m in movimientos if m.get("estado") == "validado"]
        
        # Insertar como transacciones
        transacciones = await crear_transacciones_batch(
            self.db,
            a_importar,
            self.user_id,
            cuenta_id
        )
        
        # Registrar aprendizajes
        for mov in a_importar:
            if mov.get("categoria"):
                await self.categorizador.registrar_aprendizaje(
                    mov["concepto"],
                    mov["categoria"]
                )
        
        # Actualizar registro de importación
        await actualizar_importacion(
            self.db,
            importacion_id=importacion.id,
            total_procesados=len(movimientos),
            total_importados=len(a_importar),
            total_descartados=len(movimientos) - len(a_importar),
            total_duplicados=len([m for m in movimientos if m.get("estado") == "duplicado"]),
            estado="completed",
            metadata={}
        )
        
        # Commit a BD
        await self.db.commit()
        
        return {
            "estado": "success",
            "importados": len(a_importar),
            "descartados": len(movimientos) - len(a_importar),
            "importacion_id": importacion.id
        }
```

---

### PASO 4: CRUD (1 hora)

**Archivo**: `backend/app/crud/importacion.py`

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from app.models.importacion import Importacion

async def crear_importacion(
    db: AsyncSession,
    user_id: UUID,
    banco: str,
    cuenta_id: UUID,
    archivo: str,
    metadata: Dict
) -> Importacion:
    """Crea registro de importación para auditoría"""
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
    """Actualiza registro con resultados"""
    stmt = select(Importacion).where(Importacion.id == importacion_id)
    importacion = await db.scalar(stmt)
    
    importacion.total_procesados = total_procesados
    importacion.total_importados = total_importados
    importacion.total_descartados = total_descartados
    importacion.total_duplicados = total_duplicados
    importacion.estado = estado
    importacion.metadata = metadata
    
    await db.flush()
    return importacion
```

**Extender**: `backend/app/crud/transaction.py`

```python
async def crear_transacciones_batch(
    db: AsyncSession,
    movimientos: List[Dict],
    user_id: UUID,
    account_id: UUID
) -> List[Transaction]:
    """Crea múltiples transacciones en batch"""
    transacciones = []
    
    for mov in movimientos:
        # Buscar o crear concepto
        concepto = await obtener_concepto_por_nombre(db, mov['concepto'], user_id)
        if not concepto:
            # Obtener categoría
            categoria = await obtener_categoria_por_nombre(
                db, mov.get('categoria', 'Otros'), user_id
            )
            concepto = Concept(
                user_id=user_id,
                name=mov['concepto'],
                category_id=categoria.id
            )
            db.add(concepto)
            await db.flush()
        
        # Crear transacción
        tipo = 'expense' if mov['monto'] < 0 else 'income'
        trans = Transaction(
            user_id=user_id,
            account_id=account_id,
            type=tipo,
            amount=abs(mov['monto']),
            date=datetime.fromisoformat(mov['fecha']),
            concept_id=concepto.id,
            category_id=concepto.category_id,
            payment_method=mov.get('metodo_pago', 'other'),
            description=mov.get('descripcion', ''),
            metadata={
                'origen_importacion': 'prex',
                'hash_movimiento': mov.get('hash_movimiento'),
            }
        )
        transacciones.append(trans)
        db.add(trans)
    
    await db.flush()
    return transacciones
```

---

### PASO 5: Schemas Pydantic (30 min)

**Archivo**: `backend/app/schemas/importacion.py`

```python
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from uuid import UUID

class MovimientoImportado(BaseModel):
    fecha: str
    concepto: str
    monto: float
    categoria: Optional[str]
    metodo_pago: str
    descripcion: Optional[str]
    estado: str  # 'validado', 'duplicado', 'error'
    hash_movimiento: Optional[str]
    metadata: Dict[str, Any] = {}

class ImportacionResponse(BaseModel):
    exitosos: int
    duplicados: int
    errores: int
    movimientos: List[MovimientoImportado]
    problemas: List[Dict] = []

class ConfirmarImportacionRequest(BaseModel):
    movimientos: List[MovimientoImportado]
    cuenta_id: UUID
    banco: str

class ConfirmarImportacionResponse(BaseModel):
    estado: str
    importados: int
    descartados: int
    importacion_id: str
```

---

### PASO 6: Router API (1 hora)

**Archivo**: `backend/app/api/routers/importacion_router.py`

```python
from fastapi import APIRouter, File, UploadFile, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.account import Account
from app.services.importacion_service import ImportacionService
from app.schemas.importacion import (
    ImportacionResponse,
    ConfirmarImportacionRequest,
    ConfirmarImportacionResponse
)
from app.crud import importacion as importacion_crud

router = APIRouter(prefix="/importacion", tags=["importacion"])

@router.post("/parsear", response_model=ImportacionResponse)
async def parsear_archivo(
    file: UploadFile = File(...),
    banco: str = Query(...),
    cuenta_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Parsea un archivo bancario.
    NO guarda nada, solo valida y retorna resultado.
    """
    
    # Validar cuenta
    account = await db.get(Account, str(cuenta_id))
    if not account or account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cuenta no encontrada")
    
    # Parsear
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
    Confirma e importa los movimientos.
    Guarda como transacciones normales.
    """
    
    # Validar cuenta
    account = await db.get(Account, str(request.cuenta_id))
    if not account or account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cuenta no encontrada")
    
    # Confirmar
    servicio = ImportacionService(db, current_user.id)
    resultado = await servicio.confirmar_importacion(
        request.movimientos,
        request.cuenta_id,
        request.banco,
        "import"  # nombre archivo
    )
    
    return ConfirmarImportacionResponse(**resultado)

@router.get("/historial")
async def historial(
    skip: int = 0,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Historial de importaciones del usuario"""
    from sqlalchemy import select
    from app.models.importacion import Importacion
    
    stmt = select(Importacion).where(
        Importacion.user_id == current_user.id
    ).offset(skip).limit(limit).order_by(Importacion.fecha.desc())
    
    importaciones = await db.scalars(stmt)
    return [imp for imp in importaciones]
```

---

### PASO 7: Frontend React (1.5 horas)

**Archivo**: `frontend/src/services/importacionService.ts`

```typescript
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const useParsearArchivo = () => {
  return useMutation({
    mutationFn: async (data: {
      file: File;
      banco: string;
      cuenta_id: string;
    }) => {
      const formData = new FormData();
      formData.append("file", data.file);
      formData.append("banco", data.banco);
      formData.append("cuenta_id", data.cuenta_id);

      return await api.post("/v1/importacion/parsear", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
  });
};

export const useConfirmarImportacion = () => {
  return useMutation({
    mutationFn: async (data: any) => {
      return await api.post("/v1/importacion/confirmar", data);
    },
  });
};
```

**Archivo**: `frontend/src/pages/ImportacionPage.tsx`

```typescript
import { useState } from "react";
import { useParsearArchivo, useConfirmarImportacion } from "@/services/importacionService";
import { useAccounts } from "@/hooks/useAccounts";

export function ImportacionPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    banco: "prex",
    cuenta_id: "",
    file: null as File | null,
  });
  const [resultado, setResultado] = useState(null);

  const accounts = useAccounts();
  const parsear = useParsearArchivo();
  const confirmar = useConfirmarImportacion();

  const handleSubmitStep1 = async () => {
    if (!formData.file) return;

    const res = await parsear.mutateAsync({
      file: formData.file,
      banco: formData.banco,
      cuenta_id: formData.cuenta_id,
    });

    setResultado(res.data);
    setStep(2);
  };

  const handleConfirmar = async () => {
    const res = await confirmar.mutateAsync({
      movimientos: resultado.movimientos.filter((m) => m.estado === "validado"),
      cuenta_id: formData.cuenta_id,
      banco: formData.banco,
    });

    alert(`✓ ${res.data.importados} movimientos importados`);
    setStep(1);
    setResultado(null);
  };

  if (step === 1) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Importar Movimientos</h1>

        <div className="space-y-4">
          <div>
            <label className="block font-semibold mb-2">Banco</label>
            <select
              value={formData.banco}
              onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="prex">Prex</option>
              <option value="itau">Itaú</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-2">Cuenta</label>
            <select
              value={formData.cuenta_id}
              onChange={(e) => setFormData({ ...formData, cuenta_id: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">-- Selecciona una cuenta --</option>
              {accounts.data?.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-2">Archivo</label>
            <input
              type="file"
              accept=".xlsx,.csv,.pdf"
              onChange={(e) =>
                setFormData({ ...formData, file: e.target.files?.[0] || null })
              }
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <button
            onClick={handleSubmitStep1}
            disabled={!formData.file || !formData.cuenta_id || parsear.isPending}
            className="w-full bg-blue-600 text-white py-2 rounded font-semibold disabled:opacity-50"
          >
            {parsear.isPending ? "Procesando..." : "Siguiente"}
          </button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Resultado</h2>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-100 p-4 rounded">
            <p className="text-sm text-gray-600">Válidos</p>
            <p className="text-3xl font-bold text-green-600">{resultado?.exitosos}</p>
          </div>
          <div className="bg-yellow-100 p-4 rounded">
            <p className="text-sm text-gray-600">Duplicados</p>
            <p className="text-3xl font-bold text-yellow-600">{resultado?.duplicados}</p>
          </div>
          <div className="bg-red-100 p-4 rounded">
            <p className="text-sm text-gray-600">Errores</p>
            <p className="text-3xl font-bold text-red-600">{resultado?.errores}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-2">Fecha</th>
                <th className="text-left p-2">Concepto</th>
                <th className="text-right p-2">Monto</th>
                <th className="text-left p-2">Categoría</th>
                <th className="text-left p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {resultado?.movimientos.map((mov, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2">{mov.fecha}</td>
                  <td className="p-2">{mov.concepto}</td>
                  <td className="text-right p-2">${Math.abs(mov.monto).toFixed(2)}</td>
                  <td className="p-2">{mov.categoria}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      mov.estado === 'validado' ? 'bg-green-100 text-green-700' :
                      mov.estado === 'duplicado' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {mov.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-4 mt-6">
          <button
            onClick={() => setStep(1)}
            className="flex-1 bg-gray-300 text-black py-2 rounded font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={confirmar.isPending}
            className="flex-1 bg-green-600 text-white py-2 rounded font-semibold disabled:opacity-50"
          >
            {confirmar.isPending ? "Importando..." : "✓ Confirmar Importación"}
          </button>
        </div>
      </div>
    );
  }
}
```

---

### PASO 8: Integración (30 min)

1. **Agregar router a FastAPI**:
```python
# backend/app/api/api.py
from app.api.routers import importacion

api_router = APIRouter()
# ... otros routers ...
api_router.include_router(importacion.router, prefix="/importacion")
```

2. **Agregar página a React**:
```typescript
// frontend/src/App.tsx
import { ImportacionPage } from "@/pages/ImportacionPage";

// Agregar ruta
<Route path="/importacion" element={<ImportacionPage />} />
```

3. **Agregar botón a Dashboard**:
```typescript
// En DashboardPage header o menu
<Link to="/importacion" className="btn">
  📥 Importar
</Link>
```

---

### PASO 9: Tests (1 hora)

**Archivo**: `backend/tests/test_importacion_service.py`

```python
import pytest
from app.services.importacion_service import (
    NormalizadorFechas,
    DetectorDuplicados,
    ParserPrex,
)

class TestNormalizadorFechas:
    def test_normaliza_dd_mm_yyyy(self):
        assert NormalizadorFechas.normalizar("31/03/2026") == "2026-03-31"
    
    def test_lanza_error_fecha_invalida(self):
        with pytest.raises(ValueError):
            NormalizadorFechas.normalizar("invalid")

class TestDetectorDuplicados:
    def test_genera_hash_consistente(self):
        hash1 = DetectorDuplicados.generar_hash(
            "2026-03-31", "MERCADO", -100.00, "account-id"
        )
        hash2 = DetectorDuplicados.generar_hash(
            "2026-03-31", "MERCADO", -100.00, "account-id"
        )
        assert hash1 == hash2
        assert len(hash1) == 16
```

---

## CRITERIOS DE ACEPTACIÓN FASE 1

```
✓ Usuario puede subir archivo Prex.xlsx desde UI
✓ Sistema parsea en <5 segundos (100 movimientos)
✓ Movimientos aparecen en tabla (presistencia)
✓ Movimientos aparecen en dashboard automáticamente
✓ Si importa 2 veces mismo archivo: NO hay duplicados
✓ Auditoría guardada en tabla importaciones
✓ Tests >90% cobertura
✓ Categorización automática funciona
✓ Métodos de pago detectados correctamente
✓ Conversión de fechas correcta (YYYY-MM-DD)
```

---

¡Adelante con FASE 1! 🚀
