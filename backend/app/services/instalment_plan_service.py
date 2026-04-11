import uuid
from datetime import date as PyDate, datetime, timezone
from decimal import Decimal, ROUND_DOWN
from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.crud import instalment_plan_crud, account_crud, concept_crud, category_crud, transaction_crud
from app.exceptions.instalment_plan_exceptions import (
    InstalmentPlanNotFound,
    UnauthorizedInstalmentPlanAccess,
    InstalmentPlanAccountMustBeCredit,
)
from app.exceptions.account_exceptions import AccountNotFound
from app.exceptions.category_exceptions import CategoryNotFound
from app.exceptions.transaction_exceptions import ConceptNotBelongsToUser
from app.models.accounts_models import AccountType
from app.models.transactions_models import Transaction, TransactionType, PaymentMethod
from app.models.users_models import User
from app.schemas.instalment_plan_schema import (
    InstalmentPlanCreate,
    InstalmentPlanUpdate,
    InstalmentPlanResponse,
)


def _get_owned(db: Session, plan_id: uuid.UUID, user_id: uuid.UUID):
    plan = instalment_plan_crud.get_by_id(db, plan_id)
    if not plan:
        raise InstalmentPlanNotFound("Plan de cuotas no encontrado")
    if plan.user_id != user_id:
        raise UnauthorizedInstalmentPlanAccess("No tienes acceso a este plan")
    return plan


def _build_response(db: Session, plan) -> InstalmentPlanResponse:
    today = PyDate.today()
    pagadas = instalment_plan_crud.count_cuotas_pagadas(db, plan.id, today)
    restantes = instalment_plan_crud.count_cuotas_restantes(db, plan.id, today)
    monto_cuota = (plan.total_amount / plan.n_cuotas).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    return InstalmentPlanResponse(
        id=plan.id,
        user_id=plan.user_id,
        account_id=plan.account_id,
        category_id=plan.category_id,
        concept_id=plan.concept_id,
        description=plan.description,
        total_amount=plan.total_amount,
        monto_cuota=monto_cuota,
        n_cuotas=plan.n_cuotas,
        cuotas_pagadas=pagadas,
        cuotas_restantes=restantes,
        fecha_inicio=plan.fecha_inicio,
        metodo_pago=plan.metodo_pago,
        is_active=not plan.is_deleted,
        created_at=plan.created_at,
    )


def _compute_cuota_amounts(total_amount: Decimal, n_cuotas: int) -> list[Decimal]:
    """
    Distribuye total_amount en n_cuotas. La última cuota absorbe el centavo restante
    para que la suma exacta sea igual a total_amount.
    """
    base = (total_amount / n_cuotas).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    amounts = [base] * n_cuotas
    remainder = total_amount - base * n_cuotas
    amounts[-1] += remainder
    return amounts


def create(db: Session, user: User, data: InstalmentPlanCreate) -> InstalmentPlanResponse:
    # 1. Validar concepto
    concept = concept_crud.get_by_id(db, data.concept_id)
    if not concept or concept.user_id != user.id:
        raise ConceptNotBelongsToUser("El concepto no pertenece al usuario")

    # 2. Validar categoría
    category = category_crud.get_by_id(db, data.category_id)
    if not category or category.user_id != user.id:
        raise CategoryNotFound("La categoría no existe o no pertenece al usuario")

    # 3. Validar cuenta (debe ser de crédito)
    account = account_crud.get_by_id(db, data.account_id)
    if not account or account.user_id != user.id:
        raise AccountNotFound("Cuenta no encontrada")
    if account.type != AccountType.CREDIT:
        raise InstalmentPlanAccountMustBeCredit(
            "Los planes de cuotas solo pueden registrarse en cuentas de crédito"
        )

    # 4. Crear el plan
    plan = instalment_plan_crud.create(
        db,
        user_id=user.id,
        account_id=account.id,
        category_id=category.id,
        concept_id=concept.id,
        description=data.description,
        total_amount=data.total_amount,
        n_cuotas=data.n_cuotas,
        fecha_inicio=data.fecha_inicio,
        metodo_pago=data.metodo_pago,
    )

    # 5. Generar N transacciones y mutar el balance de la cuenta
    amounts = _compute_cuota_amounts(data.total_amount, data.n_cuotas)
    for i, cuota_amount in enumerate(amounts):
        fecha_cuota = data.fecha_inicio + relativedelta(months=i)

        # Validar límite de crédito acumulado (la cuenta ya tiene balance actualizado de iteraciones previas)
        from app.services.transaction_service import _apply_expense
        _apply_expense(account, cuota_amount)

        tx = Transaction(
            user_id=user.id,
            account_id=account.id,
            category_id=category.id,
            concept_id=concept.id,
            amount=cuota_amount,
            type=TransactionType.EXPENSE,
            date=fecha_cuota,
            description=data.description,
            metodo_pago=PaymentMethod(data.metodo_pago.value),
            instalment_plan_id=plan.id,
        )
        db.add(tx)

    db.flush()
    concept_crud.increment_frequency(db, concept)
    db.commit()
    db.refresh(plan)
    return _build_response(db, plan)


def get_all(db: Session, user: User) -> list[InstalmentPlanResponse]:
    plans = instalment_plan_crud.get_all_by_user(db, user.id)
    return [_build_response(db, p) for p in plans]


def get_one(db: Session, user: User, plan_id: uuid.UUID) -> InstalmentPlanResponse:
    plan = _get_owned(db, plan_id, user.id)
    return _build_response(db, plan)


def update(db: Session, user: User, plan_id: uuid.UUID, data: InstalmentPlanUpdate) -> InstalmentPlanResponse:
    plan = _get_owned(db, plan_id, user.id)
    fields = {}
    if data.description is not None:
        fields["description"] = data.description
    if fields:
        instalment_plan_crud.update(db, plan, fields)
        # Propagar descripción a las cuotas pendientes
        future = instalment_plan_crud.get_future_cuotas(db, plan.id, PyDate.today())
        for tx in future:
            tx.description = data.description
        db.flush()
    db.commit()
    db.refresh(plan)
    return _build_response(db, plan)


def cancel(db: Session, user: User, plan_id: uuid.UUID) -> None:
    """
    Cancela el plan: revierte el balance de las cuotas futuras y las elimina.
    Las cuotas ya pagadas (fecha <= hoy) se mantienen como gasto histórico.
    """
    plan = _get_owned(db, plan_id, user.id)
    account = account_crud.get_by_id(db, plan.account_id)
    today = PyDate.today()

    future_cuotas = instalment_plan_crud.get_future_cuotas(db, plan.id, today)
    for tx in future_cuotas:
        account.balance += tx.amount  # _reverse_expense sin validación
        transaction_crud.soft_delete(db, tx)

    instalment_plan_crud.soft_delete(db, plan)
    db.commit()
