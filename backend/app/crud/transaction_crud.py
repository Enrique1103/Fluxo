import uuid
from datetime import date as PyDate, datetime, timezone
from decimal import Decimal
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models.transactions_models import Transaction, TransactionType, TransferRole, PaymentMethod


def get_by_id(db: Session, transaction_id: uuid.UUID) -> Transaction | None:
    return db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.is_deleted == False,
    ).first()


def get_all_by_user(
    db: Session,
    user_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    account_id: uuid.UUID | None = None,
    transaction_type: TransactionType | None = None,
    category_id: uuid.UUID | None = None,
    date_from: PyDate | None = None,
    date_to: PyDate | None = None,
    metodo_pago: PaymentMethod | None = None,
) -> list[Transaction]:
    q = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_deleted == False,
        # Exclude DESTINATION legs: transfers appear once as SOURCE in the global list.
        # Use OR with IS NULL because SQL NULL != value evaluates to NULL (not TRUE).
        or_(
            Transaction.transfer_role.is_(None),
            Transaction.transfer_role == TransferRole.SOURCE,
        ),
    )
    if account_id is not None:
        q = q.filter(Transaction.account_id == account_id)
    if transaction_type is not None:
        q = q.filter(Transaction.type == transaction_type)
    if category_id is not None:
        q = q.filter(Transaction.category_id == category_id)
    if date_from is not None:
        q = q.filter(Transaction.date >= date_from)
    if date_to is not None:
        q = q.filter(Transaction.date <= date_to)
    if metodo_pago is not None:
        q = q.filter(Transaction.metodo_pago == metodo_pago)
    return (
        q.order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def get_all_by_account(
    db: Session,
    account_id: uuid.UUID,
    user_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    transaction_type: TransactionType | None = None,
    category_id: uuid.UUID | None = None,
    date_from: PyDate | None = None,
    date_to: PyDate | None = None,
) -> list[Transaction]:
    # Account view shows ALL legs (SOURCE + DESTINATION) so the user sees
    # every movement that affected this account's balance.
    q = db.query(Transaction).filter(
        Transaction.account_id == account_id,
        Transaction.user_id == user_id,
        Transaction.is_deleted == False,
    )
    if transaction_type is not None:
        q = q.filter(Transaction.type == transaction_type)
    if category_id is not None:
        q = q.filter(Transaction.category_id == category_id)
    if date_from is not None:
        q = q.filter(Transaction.date >= date_from)
    if date_to is not None:
        q = q.filter(Transaction.date <= date_to)
    return (
        q.order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def has_active_for_account(db: Session, account_id: uuid.UUID) -> bool:
    return db.query(Transaction).filter(
        Transaction.account_id == account_id,
        Transaction.is_deleted == False,
    ).first() is not None


def has_active_for_concept(db: Session, concept_id: uuid.UUID) -> bool:
    return db.query(Transaction).filter(
        Transaction.concept_id == concept_id,
        Transaction.is_deleted == False,
    ).first() is not None


def has_active_for_category(db: Session, category_id: uuid.UUID) -> bool:
    return db.query(Transaction).filter(
        Transaction.category_id == category_id,
        Transaction.is_deleted == False,
    ).first() is not None


def create(
    db: Session,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    category_id: uuid.UUID,
    concept_id: uuid.UUID,
    amount: Decimal,
    transaction_type: TransactionType,
    date: PyDate,
    description: str | None = None,
    transfer_id: uuid.UUID | None = None,
    transfer_role: TransferRole | None = None,
    external_account_id: uuid.UUID | None = None,
    commission: Decimal | None = None,
    metodo_pago: PaymentMethod = PaymentMethod.OTRO,
    household_id: uuid.UUID | None = None,
) -> Transaction:
    db_tx = Transaction(
        user_id=user_id,
        account_id=account_id,
        category_id=category_id,
        concept_id=concept_id,
        amount=amount,
        type=transaction_type,
        date=date,
        description=description,
        transfer_id=transfer_id,
        transfer_role=transfer_role,
        external_account_id=external_account_id,
        commission=commission,
        metodo_pago=metodo_pago,
        household_id=household_id,
    )
    db.add(db_tx)
    db.flush()
    return db_tx


def update(db: Session, db_tx: Transaction, fields: dict) -> Transaction:
    for field, value in fields.items():
        setattr(db_tx, field, value)
    db.flush()
    return db_tx


def soft_delete(db: Session, db_tx: Transaction) -> None:
    db_tx.is_deleted = True
    db_tx.deleted_at = datetime.now(timezone.utc)
    db.flush()
