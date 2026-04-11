import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.models.users_models import User
from app.schemas.concept_schema import ConceptCreate, ConceptUpdate, ConceptResponse
from app.services import concept_service

router = APIRouter(prefix="/concepts", tags=["Concepts"])


@router.post("", response_model=ConceptResponse, status_code=status.HTTP_201_CREATED)
def create_concept(
    concept_in: ConceptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return concept_service.create(db, current_user, concept_in)


@router.get("", response_model=list[ConceptResponse])
def list_concepts(
    category_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return concept_service.get_all(db, current_user, category_id=category_id)


@router.get("/{concept_id}", response_model=ConceptResponse)
def get_concept(
    concept_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return concept_service.get_one(db, current_user, concept_id)


@router.patch("/{concept_id}", response_model=ConceptResponse)
def update_concept(
    concept_id: uuid.UUID,
    concept_update: ConceptUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return concept_service.update(db, current_user, concept_id, concept_update)


@router.delete("/{concept_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_concept(
    concept_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    concept_service.delete(db, current_user, concept_id)
