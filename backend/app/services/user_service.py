import os
import uuid
from datetime import timedelta
from sqlalchemy.orm import Session

from app.core import security
from app.core.constants import INITIAL_USER_CATEGORIES
from app.core.utils import normalize_concept
from app.crud import user_crud, category_crud, concept_crud
from app.exceptions.user_exceptions import (
    EmailAlreadyExists,
    UserNotFound,
    InvalidCredentials,
    InactiveUser,
)
from app.models.users_models import User
from app.models.transactions_models import Transaction
from app.models.accounts_models import Account
from app.models.categories_models import Category
from app.models.concepts_models import Concept
from app.models.fin_goals_models import FinGoal
from app.models.exchange_rate_models import ExchangeRate
from app.models.external_account_models import ExternalAccount
from app.models.instalment_plan_models import InstalmentPlan
from app.models.household_models import Household, HouseholdMember, HouseholdInvite, MemberRole, MemberStatus
from app.schemas.user_schema import UserCreate, UserUpdate, UserDeleteRequest

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")


def register(db: Session, user_in: UserCreate) -> User:
    if user_crud.get_by_email(db, user_in.email):
        raise EmailAlreadyExists("El email ya está registrado")

    hashed = security.hash_password(user_in.password)
    db_user = user_crud.create(db, user_in, hashed)

    seen_concepts: set[str] = set()
    for cat_data in INITIAL_USER_CATEGORIES:
        category_crud.create(
            db,
            user_id=db_user.id,
            name=cat_data["name"],
            slug=cat_data["slug"],
            icon=cat_data["icon"],
            color=cat_data["color"],
            is_system=cat_data["is_system"],
        )
        for raw_name in cat_data["concepts"]:
            normalized = normalize_concept(raw_name)
            if normalized not in seen_concepts:
                seen_concepts.add(normalized)
                concept_crud.create(
                    db,
                    user_id=db_user.id,
                    name=normalized,
                    is_system=cat_data["is_system"],
                )

    db.commit()
    db.refresh(db_user)
    return db_user


def login(db: Session, email: str, password: str) -> dict:
    if ADMIN_PASSWORD and email == ADMIN_EMAIL and password == ADMIN_PASSWORD:
        token = security.create_access_token(
            data={"sub": "admin", "is_admin": True},
            expires_delta=timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        return {"access_token": token, "token_type": "bearer", "is_admin": True}

    db_user = user_crud.get_by_email(db, email)
    if not db_user or not security.verify_password(password, db_user.password_hash):
        raise InvalidCredentials("Credenciales inválidas")
    if not db_user.is_active:
        raise InactiveUser("La cuenta está inactiva")

    token = security.create_access_token(
        data={"sub": str(db_user.id), "is_admin": False},
        expires_delta=timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": token, "token_type": "bearer", "is_admin": False}


def get_me(db_user: User) -> User:
    return db_user


def _hard_delete_user(db: Session, db_user: User) -> None:
    """Borra el usuario y todos sus datos. Sin verificación de contraseña."""
    uid = db_user.id

    db.query(Transaction).filter(Transaction.user_id == uid).update(
        {"transfer_id": None}, synchronize_session=False
    )

    db.query(InstalmentPlan).filter(InstalmentPlan.user_id == uid).delete(synchronize_session=False)
    db.query(Transaction).filter(Transaction.user_id == uid).delete(synchronize_session=False)
    db.query(ExternalAccount).filter(ExternalAccount.user_id == uid).delete(synchronize_session=False)
    db.query(Account).filter(Account.user_id == uid).delete(synchronize_session=False)
    db.query(FinGoal).filter(FinGoal.user_id == uid).delete(synchronize_session=False)
    db.query(ExchangeRate).filter(ExchangeRate.user_id == uid).delete(synchronize_session=False)
    db.query(Concept).filter(Concept.user_id == uid).delete(synchronize_session=False)
    db.query(Category).filter(Category.user_id == uid).delete(synchronize_session=False)

    household_ids_to_delete = []
    for h in db.query(Household).filter(Household.created_by == uid).all():
        if not h.is_deleted:
            other = (
                db.query(HouseholdMember)
                .filter(
                    HouseholdMember.household_id == h.id,
                    HouseholdMember.user_id != uid,
                    HouseholdMember.status == MemberStatus.ACTIVE,
                )
                .first()
            )
            if other:
                h.created_by = other.user_id
                continue
        household_ids_to_delete.append(h.id)
    db.flush()

    if household_ids_to_delete:
        db.query(HouseholdInvite).filter(
            HouseholdInvite.household_id.in_(household_ids_to_delete)
        ).delete(synchronize_session=False)
        db.query(HouseholdMember).filter(
            HouseholdMember.household_id.in_(household_ids_to_delete)
        ).delete(synchronize_session=False)
        db.query(Household).filter(
            Household.id.in_(household_ids_to_delete)
        ).delete(synchronize_session=False)
        db.flush()

    db.query(HouseholdInvite).filter(
        (HouseholdInvite.created_by == uid) | (HouseholdInvite.used_by == uid)
    ).delete(synchronize_session=False)
    db.query(HouseholdMember).filter(HouseholdMember.user_id == uid).delete(synchronize_session=False)
    db.flush()

    db.delete(db_user)
    db.commit()


def delete_me(db: Session, db_user: User, req: UserDeleteRequest) -> None:
    if not security.verify_password(req.password, db_user.password_hash):
        raise InvalidCredentials("Contraseña incorrecta")
    _hard_delete_user(db, db_user)


def update_me(db: Session, db_user: User, user_update: UserUpdate) -> User:
    fields: dict = {}

    if user_update.name is not None:
        fields["name"] = user_update.name

    if user_update.currency_default is not None:
        fields["currency_default"] = user_update.currency_default

    if user_update.new_password is not None:
        if user_update.current_password is None:
            raise InvalidCredentials("Se requiere la contraseña actual para cambiarla")
        if not security.verify_password(user_update.current_password, db_user.password_hash):
            raise InvalidCredentials("La contraseña actual es incorrecta")
        fields["password_hash"] = security.hash_password(user_update.new_password)

    if fields:
        user_crud.update(db, db_user, fields)
        db.commit()
        db.refresh(db_user)

    return db_user
