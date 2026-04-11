import uuid
from datetime import date as PyDate
from decimal import Decimal
from sqlalchemy.orm import Session

from app.crud import transaction_crud, account_crud, concept_crud, category_crud
from app.exceptions.account_exceptions import (
    AccountNotFound,
    InsufficientFunds,
    InsufficientCreditLimit,
    CreditBalanceCannotBePositive,
)
from app.exceptions.transaction_exceptions import (
    TransactionNotFound,
    UnauthorizedTransactionAccess,
    TransferEditNotAllowed,
    SameAccountTransferNotAllowed,
    ConceptNotBelongsToUser,
    InstalmentPlanTransactionEditNotAllowed,
)
from app.exceptions.account_exceptions import UnauthorizedAccountAccess
from app.exceptions.category_exceptions import CategoryNotFound
from app.exceptions.exchange_rate_exceptions import ExchangeRateMissing
from app.models.accounts_models import Account, AccountType
from app.models.transactions_models import Transaction, TransactionType, TransferRole, PaymentMethod
from app.models.users_models import User
from app.schemas.transaction_schema import TransactionCreate, TransactionUpdate


# ---------------------------------------------------------------------------
# Balance helpers
# ---------------------------------------------------------------------------

def _apply_expense(account: Account, amount: Decimal) -> None:
    """Debit money from account (expense or transfer source). Validates limits."""
    if account.type == AccountType.CREDIT:
        if account.balance - amount < -account.credit_limit:
            raise InsufficientCreditLimit(
                f"Límite de crédito insuficiente. Disponible: {account.credit_limit + account.balance}"
            )
    else:
        if account.balance < amount:
            raise InsufficientFunds(
                f"Saldo insuficiente. Disponible: {account.balance}"
            )
    account.balance -= amount


def _apply_income(account: Account, amount: Decimal) -> None:
    """Credit money to account (income or transfer destination). Validates CREDIT limit."""
    if account.type == AccountType.CREDIT:
        if account.balance + amount > Decimal("0.00"):
            raise CreditBalanceCannotBePositive(
                "El saldo de una cuenta de crédito no puede ser positivo"
            )
    account.balance += amount


def _reverse_expense(account: Account, amount: Decimal) -> None:
    """Undo a previous expense/source debit — no validation needed."""
    account.balance += amount


def _reverse_income(account: Account, amount: Decimal) -> None:
    """Undo a previous income/destination credit — no validation needed."""
    account.balance -= amount


# ---------------------------------------------------------------------------
# Ownership helpers
# ---------------------------------------------------------------------------

def _get_owned_tx(db: Session, tx_id: uuid.UUID, user_id: uuid.UUID) -> Transaction:
    tx = transaction_crud.get_by_id(db, tx_id)
    if not tx:
        raise TransactionNotFound("Transacción no encontrada")
    if tx.user_id != user_id:
        raise UnauthorizedTransactionAccess("No tienes acceso a esta transacción")
    return tx


def _get_account(db: Session, account_id: uuid.UUID, user_id: uuid.UUID) -> Account:
    account = account_crud.get_by_id(db, account_id)
    if not account or account.user_id != user_id:
        raise AccountNotFound("Cuenta no encontrada")
    return account


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------

def _check_exchange_rate_for_date(
    db: Session,
    user: User,
    tx_date: "PyDate",
    involved_accounts: "list[Account]",
) -> None:
    """
    Bloquea la creación de una transacción si su fecha cae en el mes actual
    y alguna de las cuentas INVOLUCRADAS en esa transacción tiene moneda
    extranjera sin tasa de cambio cargada para ese mes.

    Solo verifica las cuentas que participan en la transacción (origen y destino),
    no todas las cuentas del usuario — así una transacción en UYU no se bloquea
    por tener una cuenta USD sin tasa.
    """
    from datetime import date as _date
    from app.crud import exchange_rate_crud

    today = _date.today()
    # Solo aplica para el mes en curso — meses anteriores se pueden editar siempre
    if tx_date.year != today.year or tx_date.month != today.month:
        return

    foreign_currencies = {
        a.currency.value
        for a in involved_accounts
        if a.currency.value != str(user.currency_default)
    }

    missing = []
    for fc in sorted(foreign_currencies):
        rate = exchange_rate_crud.get_for_month(
            db, user.id, fc, str(user.currency_default), today.year, today.month
        )
        if not rate:
            missing.append(f"{fc}→{user.currency_default}")

    if missing:
        pairs = ", ".join(missing)
        raise ExchangeRateMissing(
            f"Necesitás cargar la tasa de cambio de {today.strftime('%B %Y')} "
            f"para: {pairs}"
        )


def create(db: Session, user: User, tx_in: TransactionCreate) -> Transaction:
    # 1. Validate concept ownership
    concept = concept_crud.get_by_id(db, tx_in.concept_id)
    if not concept or concept.user_id != user.id:
        raise ConceptNotBelongsToUser("El concepto no pertenece al usuario")

    # 2. Validate category ownership (independent from concept)
    category = category_crud.get_by_id(db, tx_in.category_id)
    if not category or category.user_id != user.id:
        raise CategoryNotFound("La categoría no existe o no pertenece al usuario")
    category_id = tx_in.category_id

    # 3. Validate source account
    source_account = _get_account(db, tx_in.account_id, user.id)

    if tx_in.type == TransactionType.TRANSFER:
        if tx_in.external_account_id is not None:
            # External transfer — only SOURCE leg, no destination transaction
            from app.crud import external_account_crud
            ext_acct = external_account_crud.get_by_id(db, tx_in.external_account_id)
            if not ext_acct or ext_acct.user_id != user.id:
                raise AccountNotFound("Cuenta externa no encontrada")

            # Verificar tasa solo para la cuenta origen
            _check_exchange_rate_for_date(db, user, tx_in.date, [source_account])

            _apply_expense(source_account, tx_in.amount)

            source_tx = transaction_crud.create(
                db,
                user_id=user.id,
                account_id=source_account.id,
                category_id=category_id,
                concept_id=concept.id,
                amount=tx_in.amount,
                transaction_type=TransactionType.TRANSFER,
                date=tx_in.date,
                description=tx_in.description,
                transfer_role=TransferRole.SOURCE,
                external_account_id=tx_in.external_account_id,
            )
            concept_crud.increment_frequency(db, concept)
            db.commit()
            db.refresh(source_tx)
            return source_tx

        # Internal transfer — existing logic below
        # 3. Validate destination account
        if tx_in.transfer_to_account_id == tx_in.account_id:
            raise SameAccountTransferNotAllowed("La cuenta origen y destino no pueden ser la misma")
        dest_account = _get_account(db, tx_in.transfer_to_account_id, user.id)

        # Verificar tasa para las cuentas involucradas (origen y destino)
        _check_exchange_rate_for_date(db, user, tx_in.date, [source_account, dest_account])

        # 4. Apply balance mutations for transfer
        _apply_expense(source_account, tx_in.amount)
        _apply_income(dest_account, tx_in.amount)

        # 5. Create SOURCE transaction
        source_tx = transaction_crud.create(
            db,
            user_id=user.id,
            account_id=source_account.id,
            category_id=category_id,
            concept_id=concept.id,
            amount=tx_in.amount,
            transaction_type=TransactionType.TRANSFER,
            date=tx_in.date,
            description=tx_in.description,
            transfer_id=None,
            transfer_role=TransferRole.SOURCE,
        )

        # 6. Create DESTINATION transaction
        dest_tx = transaction_crud.create(
            db,
            user_id=user.id,
            account_id=dest_account.id,
            category_id=category_id,
            concept_id=concept.id,
            amount=tx_in.amount,
            transaction_type=TransactionType.TRANSFER,
            date=tx_in.date,
            description=tx_in.description,
            transfer_id=source_tx.id,
            transfer_role=TransferRole.DESTINATION,
        )

        # 7. Link SOURCE → DESTINATION
        source_tx.transfer_id = dest_tx.id
        db.flush()

        concept_crud.increment_frequency(db, concept)
        db.commit()
        db.refresh(source_tx)
        return source_tx

    # Non-transfer: INCOME or EXPENSE
    # Verificar tasa solo para la cuenta involucrada
    _check_exchange_rate_for_date(db, user, tx_in.date, [source_account])

    if tx_in.type == TransactionType.EXPENSE:
        _apply_expense(source_account, tx_in.amount)
    else:
        _apply_income(source_account, tx_in.amount)

    # Validate household membership before associating the transaction
    resolved_household_id: uuid.UUID | None = None
    if tx_in.type == TransactionType.EXPENSE and tx_in.household_id is not None:
        from app.crud import household_crud
        from app.models.household_models import MemberStatus
        member = household_crud.get_member(db, tx_in.household_id, user.id)
        if member and member.status == MemberStatus.ACTIVE:
            resolved_household_id = tx_in.household_id

    db_tx = transaction_crud.create(
        db,
        user_id=user.id,
        account_id=source_account.id,
        category_id=category_id,
        concept_id=concept.id,
        amount=tx_in.amount,
        transaction_type=tx_in.type,
        date=tx_in.date,
        description=tx_in.description,
        metodo_pago=tx_in.metodo_pago if tx_in.type == TransactionType.EXPENSE else PaymentMethod.OTRO,
        household_id=resolved_household_id,
    )
    concept_crud.increment_frequency(db, concept)
    db.commit()
    db.refresh(db_tx)
    return db_tx


def get_all(
    db: Session,
    user: User,
    limit: int = 50,
    offset: int = 0,
    account_id: uuid.UUID | None = None,
    transaction_type: TransactionType | None = None,
    category_id: uuid.UUID | None = None,
    date_from: PyDate | None = None,
    date_to: PyDate | None = None,
    metodo_pago: PaymentMethod | None = None,
) -> list[Transaction]:
    return transaction_crud.get_all_by_user(
        db,
        user.id,
        limit=limit,
        offset=offset,
        account_id=account_id,
        transaction_type=transaction_type,
        category_id=category_id,
        date_from=date_from,
        date_to=date_to,
        metodo_pago=metodo_pago,
    )


def get_all_by_account(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    transaction_type: TransactionType | None = None,
    category_id: uuid.UUID | None = None,
    date_from: PyDate | None = None,
    date_to: PyDate | None = None,
) -> list[Transaction]:
    account = account_crud.get_by_id(db, account_id)
    if not account or account.user_id != user.id:
        raise AccountNotFound("Cuenta no encontrada")
    return transaction_crud.get_all_by_account(
        db,
        account_id=account_id,
        user_id=user.id,
        limit=limit,
        offset=offset,
        transaction_type=transaction_type,
        category_id=category_id,
        date_from=date_from,
        date_to=date_to,
    )


def get_one(db: Session, user: User, tx_id: uuid.UUID) -> Transaction:
    return _get_owned_tx(db, tx_id, user.id)


def update(db: Session, user: User, tx_id: uuid.UUID, tx_update: TransactionUpdate) -> Transaction:
    tx = _get_owned_tx(db, tx_id, user.id)

    if tx.instalment_plan_id is not None:
        raise InstalmentPlanTransactionEditNotAllowed(
            "Esta transacción pertenece a un plan de cuotas y no puede editarse individualmente. "
            "Para cancelar las cuotas restantes, eliminá el plan."
        )

    if tx.transfer_role is not None:
        raise TransferEditNotAllowed("Las transferencias no se pueden editar. Elimínalas y créalas de nuevo")

    account = account_crud.get_by_id(db, tx.account_id)
    fields: dict = {}

    # Handle amount change: reverse old, apply new
    new_amount = tx_update.amount if tx_update.amount is not None else tx.amount
    if tx_update.amount is not None and tx_update.amount != tx.amount:
        if tx.type == TransactionType.EXPENSE:
            _reverse_expense(account, tx.amount)
            _apply_expense(account, new_amount)
        else:
            _reverse_income(account, tx.amount)
            _apply_income(account, new_amount)
        fields["amount"] = new_amount

    # Handle concept change (frequency only — category is independent)
    if tx_update.concept_id is not None and tx_update.concept_id != tx.concept_id:
        new_concept = concept_crud.get_by_id(db, tx_update.concept_id)
        if not new_concept or new_concept.user_id != user.id:
            raise ConceptNotBelongsToUser("El concepto no pertenece al usuario")
        old_concept = concept_crud.get_by_id(db, tx.concept_id)
        if old_concept:
            concept_crud.decrement_frequency(db, old_concept)
        concept_crud.increment_frequency(db, new_concept)
        fields["concept_id"] = new_concept.id

    # Handle category change independently
    if tx_update.category_id is not None and tx_update.category_id != tx.category_id:
        cat = category_crud.get_by_id(db, tx_update.category_id)
        if not cat or cat.user_id != user.id:
            raise CategoryNotFound("La categoría no existe o no pertenece al usuario")
        fields["category_id"] = tx_update.category_id

    if tx_update.description is not None:
        fields["description"] = tx_update.description

    if tx_update.date is not None:
        fields["date"] = tx_update.date

    # metodo_pago solo aplica para EXPENSE
    if tx.type == TransactionType.EXPENSE and tx_update.metodo_pago is not None:
        fields["metodo_pago"] = tx_update.metodo_pago

    if fields:
        transaction_crud.update(db, tx, fields)

    db.commit()
    db.refresh(tx)
    return tx


def delete(db: Session, user: User, tx_id: uuid.UUID) -> None:
    tx = _get_owned_tx(db, tx_id, user.id)
    account = account_crud.get_by_id(db, tx.account_id)

    if tx.transfer_role is not None:
        # Soft-delete both legs and reverse both balances
        partner_id = tx.transfer_id
        partner_tx = transaction_crud.get_by_id(db, partner_id) if partner_id else None

        # Reverse this leg
        if tx.transfer_role == TransferRole.SOURCE:
            _reverse_expense(account, tx.amount)
        else:
            _reverse_income(account, tx.amount)
        transaction_crud.soft_delete(db, tx)

        # Reverse partner leg
        if partner_tx:
            partner_account = account_crud.get_by_id(db, partner_tx.account_id)
            if partner_account:
                if partner_tx.transfer_role == TransferRole.SOURCE:
                    _reverse_expense(partner_account, partner_tx.amount)
                else:
                    _reverse_income(partner_account, partner_tx.amount)
            transaction_crud.soft_delete(db, partner_tx)

        # Decrement concept once for the pair
        concept = concept_crud.get_by_id(db, tx.concept_id)
        if concept:
            concept_crud.decrement_frequency(db, concept)

    else:
        # Regular transaction
        if tx.type == TransactionType.EXPENSE:
            _reverse_expense(account, tx.amount)
        else:
            _reverse_income(account, tx.amount)

        concept = concept_crud.get_by_id(db, tx.concept_id)
        if concept:
            concept_crud.decrement_frequency(db, concept)

        transaction_crud.soft_delete(db, tx)

    db.commit()
