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
    InvalidScopeOperation,
)
from app.exceptions.account_exceptions import UnauthorizedAccountAccess
from app.exceptions.category_exceptions import CategoryNotFound
from app.exceptions.exchange_rate_exceptions import ExchangeRateMissing
from app.models.accounts_models import Account, AccountType
from app.models.transactions_models import Transaction, TransactionHousehold, TransactionType, TransferRole, PaymentMethod
from app.models.users_models import User
from app.schemas.transaction_schema import TransactionCreate, TransactionUpdate, DeleteScope


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
    """Undo a previous expense/source debit. Una tarjeta no puede quedar con saldo a favor."""
    if account.type == AccountType.CREDIT and account.balance + amount > Decimal("0.00"):
        raise CreditBalanceCannotBePositive(
            f"No se puede: la tarjeta {account.name} quedaría con saldo a favor "
            f"({account.balance + amount}). Probablemente ya registraste el pago de este gasto."
        )
    account.balance += amount


def _reverse_income(account: Account, amount: Decimal) -> None:
    """Undo a previous income/destination credit. El saldo no puede quedar negativo (ni pasar el límite)."""
    new_balance = account.balance - amount
    if account.type == AccountType.CREDIT:
        if new_balance < -account.credit_limit:
            raise InsufficientCreditLimit(
                f"No se puede: la tarjeta {account.name} superaría su límite de crédito."
            )
    elif new_balance < Decimal("0.00"):
        raise InsufficientFunds(
            f"No se puede: el saldo de {account.name} quedaría en {new_balance}. "
            f"Ese dinero ya se usó en otros movimientos de la cuenta."
        )
    account.balance = new_balance


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
        a.currency
        for a in involved_accounts
        if a.currency != str(user.currency_default)
    }

    missing = []
    for fc in sorted(foreign_currencies):
        rate = exchange_rate_crud.get_for_month(
            db, user.id, fc, str(user.currency_default), today.year, today.month
        ) or exchange_rate_crud.get_for_month(  # también vale el par inverso (ej: UYU→USD)
            db, user.id, str(user.currency_default), fc, today.year, today.month
        )
        if not rate:
            missing.append(f"{fc}→{user.currency_default}")

    if missing:
        pairs = ", ".join(missing)
        raise ExchangeRateMissing(
            f"Necesitás cargar la tasa de cambio de {today.strftime('%B %Y')} "
            f"para: {pairs}"
        )


def _destination_amount(
    db: Session,
    user: User,
    tx_in: TransactionCreate,
    source_account: Account,
    dest_account: Account,
) -> Decimal:
    """
    Monto que se acredita en la cuenta destino de una transferencia interna.
    Misma moneda → el mismo monto. Distinta moneda → destination_amount si el
    usuario lo indicó (lo que realmente recibió), si no amount × tasa del mes.
    """
    if str(source_account.currency) == str(dest_account.currency):
        return tx_in.amount
    if tx_in.destination_amount is not None:
        return tx_in.destination_amount
    from app.services import exchange_rate_service
    rate = exchange_rate_service.get_rate_nearest(
        db, user.id, str(source_account.currency), str(dest_account.currency),
        tx_in.date.year, tx_in.date.month,
    )
    if rate is None:
        raise ExchangeRateMissing(
            f"No hay tasa {source_account.currency}→{dest_account.currency} cargada. "
            f"Indicá cuánto llegó a la cuenta destino o cargá la tasa de cambio."
        )
    return (tx_in.amount * rate).quantize(Decimal("0.01"))


def create(db: Session, user: User, tx_in: TransactionCreate) -> Transaction:
    # 1. Validate concept ownership (optional — None is allowed)
    concept = None
    if tx_in.concept_id is not None:
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

            commission = tx_in.commission or Decimal("0.00")
            _apply_expense(source_account, tx_in.amount + commission)

            source_tx = transaction_crud.create(
                db,
                user_id=user.id,
                account_id=source_account.id,
                category_id=category_id,
                concept_id=concept.id if concept else None,
                amount=tx_in.amount,
                transaction_type=TransactionType.TRANSFER,
                date=tx_in.date,
                description=tx_in.description,
                transfer_role=TransferRole.SOURCE,
                external_account_id=tx_in.external_account_id,
                commission=tx_in.commission,
            )
            if concept:
                concept_crud.increment_frequency(db, concept)
                concept_crud.update_category(db, concept, category_id)
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

        # 4. Monto que llega al destino (cambio de moneda si las cuentas difieren)
        dest_amount = _destination_amount(db, user, tx_in, source_account, dest_account)

        # 5. Apply balance mutations for transfer — la comisión sale del origen, en su moneda
        commission = tx_in.commission or Decimal("0.00")
        _apply_expense(source_account, tx_in.amount + commission)
        _apply_income(dest_account, dest_amount)

        # 6. Create SOURCE transaction
        source_tx = transaction_crud.create(
            db,
            user_id=user.id,
            account_id=source_account.id,
            category_id=category_id,
            concept_id=concept.id if concept else None,
            amount=tx_in.amount,
            transaction_type=TransactionType.TRANSFER,
            date=tx_in.date,
            description=tx_in.description,
            transfer_id=None,
            transfer_role=TransferRole.SOURCE,
            commission=tx_in.commission,
        )

        # 7. Create DESTINATION transaction
        dest_tx = transaction_crud.create(
            db,
            user_id=user.id,
            account_id=dest_account.id,
            category_id=category_id,
            concept_id=concept.id if concept else None,
            amount=dest_amount,
            transaction_type=TransactionType.TRANSFER,
            date=tx_in.date,
            description=tx_in.description,
            transfer_id=source_tx.id,
            transfer_role=TransferRole.DESTINATION,
        )

        # 8. Link SOURCE → DESTINATION
        source_tx.transfer_id = dest_tx.id
        db.flush()

        if concept:
            concept_crud.increment_frequency(db, concept)
            concept_crud.update_category(db, concept, category_id)
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

    # Validar membresía y resolver household_ids (F04)
    resolved_ids: list[uuid.UUID] = []
    if tx_in.type == TransactionType.EXPENSE:
        from app.crud import household_crud
        from app.models.household_models import MemberStatus
        # household_ids tiene precedencia; si no, usar household_id legado
        candidates = tx_in.household_ids or (
            [tx_in.household_id] if tx_in.household_id else []
        )
        for hh_id in candidates:
            member = household_crud.get_member(db, hh_id, user.id)
            if member and member.status == MemberStatus.ACTIVE:
                resolved_ids.append(hh_id)

    db_tx = transaction_crud.create(
        db,
        user_id=user.id,
        account_id=source_account.id,
        category_id=category_id,
        concept_id=concept.id if concept else None,
        amount=tx_in.amount,
        transaction_type=tx_in.type,
        date=tx_in.date,
        description=tx_in.description,
        metodo_pago=tx_in.metodo_pago if tx_in.type == TransactionType.EXPENSE else PaymentMethod.OTRO,
        household_id=resolved_ids[0] if resolved_ids else None,
    )

    # Insertar en tabla junction (F04)
    for hh_id in resolved_ids:
        db.add(TransactionHousehold(transaction_id=db_tx.id, household_id=hh_id))

    if concept:
        concept_crud.increment_frequency(db, concept)
        concept_crud.update_category(db, concept, category_id)
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
        # Se aplica solo la diferencia: así se valida el saldo final y no un paso intermedio
        delta = new_amount - tx.amount
        if tx.type == TransactionType.EXPENSE:
            if delta > 0:
                _apply_expense(account, delta)
            else:
                _reverse_expense(account, -delta)
        else:
            if delta > 0:
                _apply_income(account, delta)
            else:
                _reverse_income(account, -delta)
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

    # description se puede vaciar enviando null explícitamente
    if "description" in tx_update.model_fields_set:
        fields["description"] = tx_update.description

    if tx_update.date is not None:
        fields["date"] = tx_update.date

    # metodo_pago solo aplica para EXPENSE
    if tx.type == TransactionType.EXPENSE and tx_update.metodo_pago is not None:
        fields["metodo_pago"] = tx_update.metodo_pago

    # Hogares (F04) solo aplican para EXPENSE. None = sin cambios.
    if tx.type == TransactionType.EXPENSE:
        requested: list[uuid.UUID] | None = tx_update.household_ids
        if requested is None and "household_id" in tx_update.model_fields_set:
            requested = [tx_update.household_id] if tx_update.household_id else []
        if requested is not None:
            _set_households(db, user, tx, requested)

    if fields:
        transaction_crud.update(db, tx, fields)

    db.commit()
    db.refresh(tx)
    return tx


def _set_households(db: Session, user: User, tx: Transaction, requested: list[uuid.UUID]) -> None:
    """Sincroniza la tabla junction con los hogares pedidos (solo hogares donde el usuario es miembro activo)."""
    from app.crud import household_crud
    from app.models.household_models import MemberStatus

    wanted: list[uuid.UUID] = []
    for hh_id in dict.fromkeys(requested):
        member = household_crud.get_member(db, hh_id, user.id)
        if member and member.status == MemberStatus.ACTIVE:
            wanted.append(hh_id)

    current = {link.household_id: link for link in tx.household_links}
    for hh_id, link in current.items():
        if hh_id not in wanted:
            tx.household_links.remove(link)
    for hh_id in wanted:
        if hh_id not in current:
            tx.household_links.append(TransactionHousehold(household_id=hh_id))
    tx.household_id = wanted[0] if wanted else None
    db.flush()


def delete(
    db: Session,
    user: User,
    tx_id: uuid.UUID,
    scope: DeleteScope = DeleteScope.PERSONAL,
    target_household_id: uuid.UUID | None = None,
) -> None:
    tx = _get_owned_tx(db, tx_id, user.id)

    if scope == DeleteScope.HOUSEHOLD:
        # Eliminar entradas de la junction table (F04)
        q = db.query(TransactionHousehold).filter(
            TransactionHousehold.transaction_id == tx_id
        )
        if target_household_id is not None:
            q = q.filter(TransactionHousehold.household_id == target_household_id)

        links = q.all()
        if not links:
            raise InvalidScopeOperation(
                "No se puede borrar del hogar una transacción que no pertenece a ningún hogar"
            )
        for link in links:
            db.delete(link)
        db.flush()

        # Actualizar campo legacy household_id con lo que quede en la junction table
        remaining = db.query(TransactionHousehold).filter(
            TransactionHousehold.transaction_id == tx_id
        ).all()
        tx.household_id = remaining[0].household_id if remaining else None
        db.commit()
        return

    account = account_crud.get_by_id(db, tx.account_id)

    if tx.transfer_role is not None:
        # Soft-delete both legs and reverse both balances
        partner_id = tx.transfer_id
        partner_tx = transaction_crud.get_by_id(db, partner_id) if partner_id else None

        # Reverse this leg (SOURCE deducted amount + commission)
        if tx.transfer_role == TransferRole.SOURCE:
            _reverse_expense(account, tx.amount + (tx.commission or Decimal("0.00")))
        else:
            _reverse_income(account, tx.amount)
        transaction_crud.soft_delete(db, tx)

        # Reverse partner leg
        if partner_tx:
            partner_account = account_crud.get_by_id(db, partner_tx.account_id)
            if partner_account:
                if partner_tx.transfer_role == TransferRole.SOURCE:
                    _reverse_expense(partner_account, partner_tx.amount + (partner_tx.commission or Decimal("0.00")))
                else:
                    _reverse_income(partner_account, partner_tx.amount)
            transaction_crud.soft_delete(db, partner_tx)

        # Decrement concept once for the pair
        if tx.concept_id is not None:
            concept = concept_crud.get_by_id(db, tx.concept_id)
            if concept:
                concept_crud.decrement_frequency(db, concept)

    else:
        # Regular transaction
        if tx.type == TransactionType.EXPENSE:
            _reverse_expense(account, tx.amount)
        else:
            _reverse_income(account, tx.amount)

        if tx.concept_id is not None:
            concept = concept_crud.get_by_id(db, tx.concept_id)
            if concept:
                concept_crud.decrement_frequency(db, concept)

        transaction_crud.soft_delete(db, tx)

    db.commit()
