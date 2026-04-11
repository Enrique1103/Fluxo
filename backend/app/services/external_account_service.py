from sqlalchemy.orm import Session
from app.crud import external_account_crud
from app.models.users_models import User
from app.schemas.external_account_schema import ExternalAccountCreate, ExternalAccountResponse


def create(db: Session, user: User, data: ExternalAccountCreate) -> ExternalAccountResponse:
    acct = external_account_crud.create(db, user.id, data)
    db.commit()
    db.refresh(acct)
    return ExternalAccountResponse.model_validate(acct)


def get_all(db: Session, user: User) -> list[ExternalAccountResponse]:
    accounts = external_account_crud.get_all_by_user(db, user.id)
    return [ExternalAccountResponse.model_validate(a) for a in accounts]
