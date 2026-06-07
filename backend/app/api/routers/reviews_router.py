import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.exceptions.household_exceptions import (
    HouseholdNotFound, UnauthorizedHouseholdAccess, NotHouseholdAdmin,
)
from app.exceptions.review_exceptions import (
    ReviewNotFound, UnauthorizedReviewAccess,
    ReviewAlreadyResolved, TransactionNotInHousehold,
)
from app.exceptions.transaction_exceptions import TransactionNotFound
from app.models.review_models import ReviewStatus
from app.models.users_models import User
from app.schemas.review_schema import ReviewCreate, ReviewRespond, ReviewResponse
from app.services import review_service

router = APIRouter(prefix="/households/{household_id}/reviews", tags=["Reviews"])


def _handle(exc: Exception) -> HTTPException:
    mapping = {
        HouseholdNotFound:           404,
        UnauthorizedHouseholdAccess: 403,
        NotHouseholdAdmin:           403,
        TransactionNotFound:         404,
        TransactionNotInHousehold:   422,
        ReviewNotFound:              404,
        UnauthorizedReviewAccess:    403,
        ReviewAlreadyResolved:       409,
    }
    for exc_type, code in mapping.items():
        if isinstance(exc, exc_type):
            raise HTTPException(status_code=code, detail=str(exc))
    raise exc


@router.post("", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
def create_review(
    household_id: uuid.UUID,
    data: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return review_service.create(db, current_user, data)
    except Exception as e:
        _handle(e)


@router.get("", response_model=list[ReviewResponse])
def list_reviews(
    household_id: uuid.UUID,
    filter_status: ReviewStatus | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return review_service.get_by_household(db, current_user, household_id, filter_status)
    except Exception as e:
        _handle(e)


@router.get("/transaction/{transaction_id}", response_model=list[ReviewResponse])
def list_reviews_by_transaction(
    household_id: uuid.UUID,
    transaction_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return review_service.get_by_transaction(db, current_user, household_id, transaction_id)
    except Exception as e:
        _handle(e)


@router.patch("/{review_id}", response_model=ReviewResponse)
def respond_review(
    household_id: uuid.UUID,
    review_id: uuid.UUID,
    data: ReviewRespond,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return review_service.respond(db, current_user, household_id, review_id, data)
    except Exception as e:
        _handle(e)


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    household_id: uuid.UUID,
    review_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        review_service.delete(db, current_user, household_id, review_id)
    except Exception as e:
        _handle(e)
