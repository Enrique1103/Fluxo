#!/usr/bin/env python
"""
Seed script — dos usuarios de prueba con hogar compartido.

  usuario_1: Carlos Rodríguez  usuario1@gmail.com  test1234
             Itaú Corriente (débito) + Santander Crédito

  usuario_2: Ana Martínez      usuario2@gmail.com  test1234
             BROU Caja de Ahorro (débito) + OCA Crédito

  Hogar: "Departamento Pocitos" (split igual)
  Período: febrero, marzo y abril 2026
  Por usuario/mes: 3 ingresos + 8 gastos

Uso (desde backend/):
    python seed_test_users.py
"""
import sys
import os
from datetime import date, datetime, timezone
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from app.core.database import Session
from app.core import security
from app.core.constants import INITIAL_USER_CATEGORIES
from app.core.utils import normalize_concept
from app.crud import category_crud, concept_crud
from app.crud.user_crud import get_by_email
from app.models.users_models import User
from app.models.accounts_models import Account, AccountType
from app.models.transactions_models import Transaction, TransactionType, PaymentMethod
from app.models.household_models import (
    Household, HouseholdMember, SplitType, MemberRole, MemberStatus,
)
from app.services.user_service import _hard_delete_user

# ─── constantes ───────────────────────────────────────────────────────────────

PASSWORD = "Test1234!"

USERS_DATA = [
    {"name": "Carlos Rodríguez", "email": "usuario1@gmail.com", "currency_default": "UYU"},
    {"name": "Ana Martínez",     "email": "usuario2@gmail.com", "currency_default": "UYU"},
]

# [nombre, tipo, moneda, balance_actual, credit_limit]
ACCOUNTS_DATA = {
    "usuario1@gmail.com": [
        ("Itaú Corriente",    AccountType.DEBIT,  "UYU", Decimal("90000.00"), None),
        ("Santander Crédito", AccountType.CREDIT, "UYU", Decimal("0.00"),     Decimal("80000.00")),
    ],
    "usuario2@gmail.com": [
        ("BROU Caja de Ahorro", AccountType.DEBIT,  "UYU", Decimal("134000.00"), None),
        ("OCA Crédito",         AccountType.CREDIT, "UYU", Decimal("0.00"),      Decimal("60000.00")),
    ],
}

# Columnas: (fecha, cat_slug, concepto_upper, monto, tipo, metodo_pago, idx_cuenta, es_hogar)
#   idx_cuenta 0 = débito, 1 = crédito
TXNS_U1 = [
    # ── Febrero 2026 ── ingresos
    (date(2026,2, 5),  "sueldo-nominal",  "SUELDO BASE",   Decimal("58500"), TransactionType.INCOME,  PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    (date(2026,2,10),  "sueldo-en-negro", "JORNADA EXTRA", Decimal("12000"), TransactionType.INCOME,  PaymentMethod.EFECTIVO,               0, False),
    (date(2026,2,20),  "otros-ingresos",  "REINTEGRO",     Decimal( "3200"), TransactionType.INCOME,  PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    # gastos
    (date(2026,2, 1),  "vivienda",        "ALQUILER",      Decimal("28000"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,2, 5),  "alimentacion",    "SUPERMERCADO",  Decimal( "8200"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, True),
    (date(2026,2,10),  "vivienda",        "UTE",           Decimal( "2450"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,2,12),  "transporte",      "COMBUSTIBLE",   Decimal( "3100"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, False),
    (date(2026,2,15),  "suscripciones",   "ANTEL",         Decimal( "1200"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    (date(2026,2,18),  "alimentacion",    "DELIVERY",      Decimal( "1850"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,2,22),  "salud",           "FARMACIA",      Decimal(  "980"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,2,28),  "ocio",            "RESTAURANTE",   Decimal( "2300"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    # ── Marzo 2026 ── ingresos
    (date(2026,3, 5),  "sueldo-nominal",  "SUELDO BASE",   Decimal("58500"), TransactionType.INCOME,  PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    (date(2026,3,10),  "sueldo-en-negro", "JORNADA EXTRA", Decimal( "8500"), TransactionType.INCOME,  PaymentMethod.EFECTIVO,               0, False),
    (date(2026,3,18),  "otros-ingresos",  "REINTEGRO",     Decimal( "1500"), TransactionType.INCOME,  PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    # gastos
    (date(2026,3, 1),  "vivienda",        "ALQUILER",      Decimal("28000"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,3, 7),  "alimentacion",    "SUPERMERCADO",  Decimal( "9500"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, True),
    (date(2026,3,10),  "vivienda",        "UTE",           Decimal( "2890"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,3,14),  "transporte",      "COMBUSTIBLE",   Decimal( "2800"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, False),
    (date(2026,3,18),  "suscripciones",   "ANTEL",         Decimal( "1200"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    (date(2026,3,20),  "alimentacion",    "DELIVERY",      Decimal( "2100"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,3,24),  "salud",           "FARMACIA",      Decimal( "1200"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,3,29),  "ocio",            "RESTAURANTE",   Decimal( "3500"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    # ── Abril 2026 ── ingresos
    (date(2026,4, 5),  "sueldo-nominal",  "SUELDO BASE",   Decimal("61000"), TransactionType.INCOME,  PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    (date(2026,4,12),  "sueldo-en-negro", "JORNADA EXTRA", Decimal("15000"), TransactionType.INCOME,  PaymentMethod.EFECTIVO,               0, False),
    (date(2026,4,22),  "otros-ingresos",  "REINTEGRO",     Decimal( "2800"), TransactionType.INCOME,  PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    # gastos
    (date(2026,4, 1),  "vivienda",        "ALQUILER",      Decimal("28000"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,4, 6),  "alimentacion",    "SUPERMERCADO",  Decimal( "8700"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, True),
    (date(2026,4,10),  "vivienda",        "UTE",           Decimal( "2100"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,4,14),  "transporte",      "COMBUSTIBLE",   Decimal( "3400"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, False),
    (date(2026,4,18),  "suscripciones",   "ANTEL",         Decimal( "1200"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    (date(2026,4,21),  "alimentacion",    "DELIVERY",      Decimal( "1600"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,4,25),  "salud",           "FARMACIA",      Decimal(  "750"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,4,28),  "ocio",            "RESTAURANTE",   Decimal( "4200"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
]

TXNS_U2 = [
    # ── Febrero 2026 ── ingresos
    (date(2026,2, 5),  "sueldo-nominal",  "SUELDO BASE",     Decimal("47800"), TransactionType.INCOME,  PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    (date(2026,2,12),  "sueldo-en-negro", "JORNADA EXTRA",   Decimal( "5500"), TransactionType.INCOME,  PaymentMethod.EFECTIVO,               0, False),
    (date(2026,2,25),  "otros-ingresos",  "REGALO",          Decimal( "8000"), TransactionType.INCOME,  PaymentMethod.EFECTIVO,               0, False),
    # gastos
    (date(2026,2, 3),  "vivienda",        "GASTOS COMUNES",  Decimal( "4500"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,2, 6),  "alimentacion",    "SUPERMERCADO",    Decimal( "7400"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, True),
    (date(2026,2,10),  "vivienda",        "OSE",             Decimal(  "890"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,2,14),  "transporte",      "ÓMNIBUS",         Decimal( "1650"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, False),
    (date(2026,2,17),  "alimentacion",    "FERIA",           Decimal( "1200"), TransactionType.EXPENSE, PaymentMethod.EFECTIVO,               0, False),
    (date(2026,2,19),  "suscripciones",   "NETFLIX",         Decimal(  "590"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,2,22),  "salud",           "CONSULTA MÉDICA", Decimal( "2100"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,2,27),  "aseo",            "PELUQUERÍA",      Decimal( "1500"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    # ── Marzo 2026 ── ingresos
    (date(2026,3, 5),  "sueldo-nominal",  "SUELDO BASE",     Decimal("47800"), TransactionType.INCOME,  PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    (date(2026,3,14),  "sueldo-en-negro", "JORNADA EXTRA",   Decimal( "4200"), TransactionType.INCOME,  PaymentMethod.EFECTIVO,               0, False),
    (date(2026,3,25),  "otros-ingresos",  "REINTEGRO",       Decimal( "6500"), TransactionType.INCOME,  PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    # gastos
    (date(2026,3, 3),  "vivienda",        "GASTOS COMUNES",  Decimal( "4500"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,3, 8),  "alimentacion",    "SUPERMERCADO",    Decimal( "8100"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, True),
    (date(2026,3,12),  "vivienda",        "OSE",             Decimal(  "920"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,3,16),  "transporte",      "ÓMNIBUS",         Decimal( "1650"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, False),
    (date(2026,3,20),  "aseo",            "HIGIENE PERSONAL",Decimal( "1200"), TransactionType.EXPENSE, PaymentMethod.EFECTIVO,               0, False),
    (date(2026,3,22),  "suscripciones",   "NETFLIX",         Decimal(  "590"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,3,26),  "salud",           "PSICÓLOGO",       Decimal( "2500"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,3,30),  "ocio",            "RESTAURANTE",     Decimal( "1800"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    # ── Abril 2026 ── ingresos
    (date(2026,4, 7),  "sueldo-nominal",  "SUELDO BASE",     Decimal("47800"), TransactionType.INCOME,  PaymentMethod.TRANSFERENCIA_BANCARIA, 0, False),
    (date(2026,4,15),  "sueldo-en-negro", "JORNADA EXTRA",   Decimal( "7000"), TransactionType.INCOME,  PaymentMethod.EFECTIVO,               0, False),
    (date(2026,4,24),  "otros-ingresos",  "REGALO",          Decimal( "5000"), TransactionType.INCOME,  PaymentMethod.EFECTIVO,               0, False),
    # gastos
    (date(2026,4, 2),  "vivienda",        "GASTOS COMUNES",  Decimal( "4500"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,4, 8),  "alimentacion",    "SUPERMERCADO",    Decimal( "7900"), TransactionType.EXPENSE, PaymentMethod.TARJETA_DEBITO,         0, True),
    (date(2026,4,12),  "vivienda",        "OSE",             Decimal(  "870"), TransactionType.EXPENSE, PaymentMethod.TRANSFERENCIA_BANCARIA, 0, True),
    (date(2026,4,17),  "transporte",      "UBER/TAXI",       Decimal( "2300"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,4,19),  "alimentacion",    "DELIVERY",        Decimal( "1800"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,4,22),  "suscripciones",   "NETFLIX",         Decimal(  "590"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,4,25),  "salud",           "FARMACIA",        Decimal( "1450"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
    (date(2026,4,28),  "ocio",            "RESTAURANTE",     Decimal( "3800"), TransactionType.EXPENSE, PaymentMethod.TARJETA_CREDITO,        1, False),
]

TXNS_BY_EMAIL = {
    "usuario1@gmail.com": TXNS_U1,
    "usuario2@gmail.com": TXNS_U2,
}

# ─── helpers ──────────────────────────────────────────────────────────────────

def _seed_cats_and_cons(db, user_id):
    """Replica exactamente la lógica de register() en user_service."""
    cats: dict[str, object] = {}  # slug → Category
    cons: dict[str, object] = {}  # nombre uppercase → Concept

    seen: set[str] = set()
    for cat_data in INITIAL_USER_CATEGORIES:
        db_cat = category_crud.create(
            db,
            user_id=user_id,
            name=cat_data["name"],
            slug=cat_data["slug"],
            icon=cat_data["icon"],
            color=cat_data["color"],
            is_system=cat_data["is_system"],
        )
        cats[cat_data["slug"]] = db_cat
        for raw in cat_data["concepts"]:
            norm = normalize_concept(raw)
            if norm not in seen:
                seen.add(norm)
                db_con = concept_crud.create(
                    db,
                    user_id=user_id,
                    name=norm,
                    is_system=cat_data["is_system"],
                    category_id=db_cat.id,
                )
                cons[norm] = db_con
    db.flush()
    return cats, cons


def _create_transactions(db, user, accounts, cats, cons, txns, household_id):
    for (txn_date, cat_slug, con_upper, amount, txn_type, metodo, acc_idx, shared) in txns:
        cat = cats[cat_slug]
        con = cons.get(con_upper)

        tx = Transaction(
            user_id=user.id,
            account_id=accounts[acc_idx].id,
            category_id=cat.id,
            concept_id=con.id if con else None,
            amount=amount,
            type=txn_type,
            date=txn_date,
            metodo_pago=metodo,
            household_id=household_id if shared else None,
        )
        db.add(tx)
    db.flush()


# ─── main ─────────────────────────────────────────────────────────────────────

def main():
    db = Session()
    try:
        # 1. Eliminar usuarios si ya existen (idempotente)
        for u_data in USERS_DATA:
            existing = get_by_email(db, u_data["email"])
            if existing:
                print(f"  Eliminando usuario existente: {u_data['email']}")
                _hard_delete_user(db, existing)

        # 2. Crear usuarios (bypass de schema — la contraseña no cumple requisitos de prod)
        hashed_pw = security.hash_password(PASSWORD)
        users = []
        for u_data in USERS_DATA:
            u = User(
                name=u_data["name"],
                email=u_data["email"],
                password_hash=hashed_pw,
                currency_default=u_data["currency_default"],
                is_active=True,
            )
            db.add(u)
            db.flush()
            users.append(u)
            print(f"  Usuario creado: {u.name} <{u.email}>")

        # 3. Categorías y conceptos
        user_cats_cons = {}
        for u in users:
            cats, cons = _seed_cats_and_cons(db, u.id)
            user_cats_cons[u.email] = (cats, cons)
            print(f"  Categorías/conceptos seeded para {u.email}")

        # 4. Cuentas
        user_accounts = {}
        for u in users:
            accs = []
            for (name, acc_type, currency, balance, credit_limit) in ACCOUNTS_DATA[u.email]:
                acc = Account(
                    user_id=u.id,
                    name=name,
                    type=acc_type,
                    currency=currency,
                    balance=balance,
                    credit_limit=credit_limit,
                )
                db.add(acc)
                accs.append(acc)
            db.flush()
            user_accounts[u.email] = accs
            names = [a.name for a in accs]
            print(f"  Cuentas creadas para {u.email}: {', '.join(names)}")

        # 5. Hogar compartido — usuario1 es admin
        u1, u2 = users[0], users[1]
        household = Household(
            name="Departamento Pocitos",
            base_currency="UYU",
            split_type=SplitType.EQUAL,
            created_by=u1.id,
        )
        db.add(household)
        db.flush()

        now = datetime.now(timezone.utc)
        db.add(HouseholdMember(
            household_id=household.id,
            user_id=u1.id,
            role=MemberRole.ADMIN,
            status=MemberStatus.ACTIVE,
            joined_at=now,
        ))
        db.add(HouseholdMember(
            household_id=household.id,
            user_id=u2.id,
            role=MemberRole.MEMBER,
            status=MemberStatus.ACTIVE,
            joined_at=now,
        ))
        db.flush()
        print(f"  Hogar creado: {household.name}")

        # 6. Transacciones
        for u in users:
            cats, cons = user_cats_cons[u.email]
            accounts = user_accounts[u.email]
            txns = TXNS_BY_EMAIL[u.email]
            _create_transactions(db, u, accounts, cats, cons, txns, household.id)
            print(f"  {len(txns)} transacciones creadas para {u.email}")

        db.commit()
        print("\n[OK] Seed completado exitosamente.")
        print("  usuario1@gmail.com / Test1234!  ->  Carlos Rodriguez")
        print("  usuario2@gmail.com / Test1234!  ->  Ana Martinez")
        print("  Hogar: Departamento Pocitos (feb-abr 2026)")

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Rollback aplicado: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
