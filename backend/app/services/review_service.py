import uuid
from sqlalchemy.orm import Session

from app.crud import review_crud, household_crud, transaction_crud
from app.exceptions.household_exceptions import (
    HouseholdNotFound, UnauthorizedHouseholdAccess, NotHouseholdAdmin,
)
from app.exceptions.review_exceptions import (
    ReviewNotFound, UnauthorizedReviewAccess,
    ReviewAlreadyResolved, TransactionNotInHousehold,
)
from app.exceptions.transaction_exceptions import TransactionNotFound
from app.models.household_models import MemberRole, MemberStatus
from app.models.review_models import ReviewStatus, ReviewType
from app.models.users_models import User
from app.schemas.review_schema import ReviewCreate, ReviewRespond, ReviewResponse


def _require_active_member(db: Session, household_id: uuid.UUID, user_id: uuid.UUID):
    m = household_crud.get_member(db, household_id, user_id)
    if not m or m.status != MemberStatus.ACTIVE:
        raise UnauthorizedHouseholdAccess("No sos miembro activo de este hogar")
    return m


def _require_household(db: Session, household_id: uuid.UUID):
    h = household_crud.get_by_id(db, household_id)
    if not h:
        raise HouseholdNotFound("Hogar no encontrado")
    return h


def create(db: Session, current_user: User, data: ReviewCreate) -> ReviewResponse:
    _require_household(db, data.household_id)
    _require_active_member(db, data.household_id, current_user.id)

    tx = transaction_crud.get_by_id(db, data.transaction_id)
    if not tx:
        raise TransactionNotFound("Transacción no encontrada")
    if tx.household_id != data.household_id:
        raise TransactionNotInHousehold(
            "La transacción no pertenece a este hogar"
        )

    try:
        review = review_crud.create(
            db,
            transaction_id=data.transaction_id,
            household_id=data.household_id,
            flagged_by_user_id=current_user.id,
            flag_type=data.flag_type,
            comment=data.comment,
        )
        db.commit()
        db.refresh(review)
        return ReviewResponse.model_validate(review)
    except Exception:
        db.rollback()
        raise


def get_by_household(
    db: Session,
    current_user: User,
    household_id: uuid.UUID,
    status: ReviewStatus | None = None,
) -> list[ReviewResponse]:
    _require_household(db, household_id)
    _require_active_member(db, household_id, current_user.id)
    reviews = review_crud.get_by_household(db, household_id, status)
    return [ReviewResponse.model_validate(r) for r in reviews]


def get_by_transaction(
    db: Session,
    current_user: User,
    household_id: uuid.UUID,
    transaction_id: uuid.UUID,
) -> list[ReviewResponse]:
    _require_household(db, household_id)
    _require_active_member(db, household_id, current_user.id)
    reviews = review_crud.get_by_transaction(db, transaction_id)
    # Filtrar solo las del hogar solicitado
    reviews = [r for r in reviews if r.household_id == household_id]
    return [ReviewResponse.model_validate(r) for r in reviews]


def respond(
    db: Session,
    current_user: User,
    household_id: uuid.UUID,
    review_id: uuid.UUID,
    data: ReviewRespond,
) -> ReviewResponse:
    _require_household(db, household_id)
    member = _require_active_member(db, household_id, current_user.id)
    if member.role != MemberRole.ADMIN:
        raise NotHouseholdAdmin("Solo el admin puede responder reviews")

    review = review_crud.get_by_id(db, review_id)
    if not review or review.household_id != household_id:
        raise ReviewNotFound("Review no encontrada")
    if review.status in (ReviewStatus.RESOLVED, ReviewStatus.DISMISSED):
        raise ReviewAlreadyResolved("Esta review ya fue cerrada")

    try:
        review = review_crud.update_status(
            db, review, data.status, data.response_comment
        )
        db.commit()
        db.refresh(review)
        return ReviewResponse.model_validate(review)
    except Exception:
        db.rollback()
        raise


def delete(
    db: Session,
    current_user: User,
    household_id: uuid.UUID,
    review_id: uuid.UUID,
) -> None:
    _require_household(db, household_id)
    review = review_crud.get_by_id(db, review_id)
    if not review or review.household_id != household_id:
        raise ReviewNotFound("Review no encontrada")
    if review.flagged_by_user_id != current_user.id:
        raise UnauthorizedReviewAccess("Solo el autor puede eliminar su propia review")
    if review.status != ReviewStatus.PENDING:
        raise ReviewAlreadyResolved("Solo se puede eliminar una review pendiente")

    try:
        review_crud.delete(db, review)
        db.commit()
    except Exception:
        db.rollback()
        raise
