from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.core.database import get_db

from app.api.routers import (
    admin_router,
    analytics_router,
    auth_router,
    users_router,
    accounts_router,
    categories_router,
    concepts_router,
    transactions_router,
    fin_goals_router,
    summary_router,
    external_account_router,
    exchange_rates_router,
    importacion_router,
)
from app.api.routers import instalment_plan_router
from app.api.routers import household_router
from app.exceptions.user_exceptions import (
    EmailAlreadyExists,
    UserNotFound,
    InvalidCredentials,
    InactiveUser,
    UnauthorizedUserAccess,
)
from app.exceptions.account_exceptions import (
    AccountNotFound,
    AccountAlreadyExists,
    UnauthorizedAccountAccess,
    InsufficientFunds,
    InsufficientCreditLimit,
    CreditBalanceCannotBePositive,
    AccountHasTransactions,
)
from app.exceptions.transaction_exceptions import (
    TransactionNotFound,
    UnauthorizedTransactionAccess,
    TransferEditNotAllowed,
    SameAccountTransferNotAllowed,
    ConceptNotBelongsToUser,
    InstalmentPlanTransactionEditNotAllowed,
)
from app.exceptions.instalment_plan_exceptions import (
    InstalmentPlanNotFound,
    UnauthorizedInstalmentPlanAccess,
    InstalmentPlanAccountMustBeCredit,
)
from app.exceptions.category_exceptions import (
    CategoryNotFound,
    CategoryAlreadyExists,
    CategoryHasActiveConcepts,
    CategoryHasActiveTransactions,
    SystemCategoryCannotBeModified,
)
from app.exceptions.concept_exceptions import (
    ConceptNotFound,
    UnauthorizedConceptAccess,
    ConceptAlreadyExists,
    ConceptInUseByTransactions,
    SystemConceptCannotBeDeleted,
)
from app.exceptions.fin_goal_exceptions import (
    FinGoalNotFound,
    UnauthorizedFinGoalAccess,
    AllocationExceedsLimit,
)
from app.exceptions.exchange_rate_exceptions import (
    ExchangeRateNotFound,
    ExchangeRateAlreadyExists,
    ExchangeRateMissing,
    UnauthorizedExchangeRateAccess,
)

app = FastAPI(title="Fluxo API", version="2.0.0")


@app.get("/health")
def health_check():
    """Ping a la DB para mantener Supabase activo."""
    db = next(get_db())
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok"}
    finally:
        db.close()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Captura excepciones no controladas y devuelve JSON en lugar de texto plano."""
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={"detail": f"Error interno del servidor: {type(exc).__name__}"},
    )

# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

_400 = 400
_401 = 401
_403 = 403
_404 = 404
_409 = 409
_422 = 422


def _json(status_code: int, detail: str):
    return JSONResponse(status_code=status_code, content={"detail": detail})


@app.exception_handler(EmailAlreadyExists)
async def handle_email_exists(r: Request, exc: EmailAlreadyExists):
    return _json(_409, str(exc))


@app.exception_handler(InvalidCredentials)
async def handle_invalid_credentials(r: Request, exc: InvalidCredentials):
    return _json(_401, str(exc))


@app.exception_handler(InactiveUser)
async def handle_inactive_user(r: Request, exc: InactiveUser):
    return _json(_403, str(exc))


@app.exception_handler(UserNotFound)
async def handle_user_not_found(r: Request, exc: UserNotFound):
    return _json(_404, str(exc))


@app.exception_handler(UnauthorizedUserAccess)
async def handle_unauthorized_user(r: Request, exc: UnauthorizedUserAccess):
    return _json(_403, str(exc))


@app.exception_handler(AccountNotFound)
async def handle_account_not_found(r: Request, exc: AccountNotFound):
    return _json(_404, str(exc))


@app.exception_handler(AccountAlreadyExists)
async def handle_account_exists(r: Request, exc: AccountAlreadyExists):
    return _json(_409, str(exc))


@app.exception_handler(UnauthorizedAccountAccess)
async def handle_unauthorized_account(r: Request, exc: UnauthorizedAccountAccess):
    return _json(_403, str(exc))


@app.exception_handler(InsufficientFunds)
async def handle_insufficient_funds(r: Request, exc: InsufficientFunds):
    return _json(_422, str(exc))


@app.exception_handler(InsufficientCreditLimit)
async def handle_insufficient_credit(r: Request, exc: InsufficientCreditLimit):
    return _json(_422, str(exc))


@app.exception_handler(CreditBalanceCannotBePositive)
async def handle_credit_positive(r: Request, exc: CreditBalanceCannotBePositive):
    return _json(_422, str(exc))


@app.exception_handler(AccountHasTransactions)
async def handle_account_has_tx(r: Request, exc: AccountHasTransactions):
    return _json(_409, str(exc))


@app.exception_handler(TransactionNotFound)
async def handle_tx_not_found(r: Request, exc: TransactionNotFound):
    return _json(_404, str(exc))


@app.exception_handler(UnauthorizedTransactionAccess)
async def handle_unauthorized_tx(r: Request, exc: UnauthorizedTransactionAccess):
    return _json(_403, str(exc))


@app.exception_handler(TransferEditNotAllowed)
async def handle_transfer_edit(r: Request, exc: TransferEditNotAllowed):
    return _json(_422, str(exc))


@app.exception_handler(SameAccountTransferNotAllowed)
async def handle_same_account_transfer(r: Request, exc: SameAccountTransferNotAllowed):
    return _json(_422, str(exc))


@app.exception_handler(ConceptNotBelongsToUser)
async def handle_concept_not_user(r: Request, exc: ConceptNotBelongsToUser):
    return _json(_403, str(exc))


@app.exception_handler(CategoryNotFound)
async def handle_category_not_found(r: Request, exc: CategoryNotFound):
    return _json(_404, str(exc))


@app.exception_handler(CategoryAlreadyExists)
async def handle_category_exists(r: Request, exc: CategoryAlreadyExists):
    return _json(_409, str(exc))


@app.exception_handler(CategoryHasActiveConcepts)
async def handle_category_has_concepts(r: Request, exc: CategoryHasActiveConcepts):
    return _json(_409, str(exc))


@app.exception_handler(CategoryHasActiveTransactions)
async def handle_category_has_transactions(r: Request, exc: CategoryHasActiveTransactions):
    return _json(_409, str(exc))


@app.exception_handler(SystemCategoryCannotBeModified)
async def handle_system_category(r: Request, exc: SystemCategoryCannotBeModified):
    return _json(_403, str(exc))


@app.exception_handler(ConceptNotFound)
async def handle_concept_not_found(r: Request, exc: ConceptNotFound):
    return _json(_404, str(exc))


@app.exception_handler(UnauthorizedConceptAccess)
async def handle_unauthorized_concept(r: Request, exc: UnauthorizedConceptAccess):
    return _json(_403, str(exc))


@app.exception_handler(ConceptAlreadyExists)
async def handle_concept_exists(r: Request, exc: ConceptAlreadyExists):
    return _json(_409, str(exc))


@app.exception_handler(ConceptInUseByTransactions)
async def handle_concept_in_use(r: Request, exc: ConceptInUseByTransactions):
    return _json(_409, str(exc))


@app.exception_handler(SystemConceptCannotBeDeleted)
async def handle_system_concept(r: Request, exc: SystemConceptCannotBeDeleted):
    return _json(_403, str(exc))


@app.exception_handler(FinGoalNotFound)
async def handle_goal_not_found(r: Request, exc: FinGoalNotFound):
    return _json(_404, str(exc))


@app.exception_handler(UnauthorizedFinGoalAccess)
async def handle_unauthorized_goal(r: Request, exc: UnauthorizedFinGoalAccess):
    return _json(_403, str(exc))


@app.exception_handler(AllocationExceedsLimit)
async def handle_allocation_limit(r: Request, exc: AllocationExceedsLimit):
    return _json(_422, str(exc))


@app.exception_handler(ExchangeRateNotFound)
async def handle_exchange_rate_not_found(r: Request, exc: ExchangeRateNotFound):
    return _json(_404, str(exc))


@app.exception_handler(ExchangeRateAlreadyExists)
async def handle_exchange_rate_exists(r: Request, exc: ExchangeRateAlreadyExists):
    return _json(_409, str(exc))


@app.exception_handler(ExchangeRateMissing)
async def handle_exchange_rate_missing(r: Request, exc: ExchangeRateMissing):
    return _json(_422, str(exc))


@app.exception_handler(UnauthorizedExchangeRateAccess)
async def handle_unauthorized_exchange_rate(r: Request, exc: UnauthorizedExchangeRateAccess):
    return _json(_403, str(exc))


@app.exception_handler(InstalmentPlanNotFound)
async def handle_instalment_plan_not_found(r: Request, exc: InstalmentPlanNotFound):
    return _json(_404, str(exc))


@app.exception_handler(UnauthorizedInstalmentPlanAccess)
async def handle_unauthorized_instalment_plan(r: Request, exc: UnauthorizedInstalmentPlanAccess):
    return _json(_403, str(exc))


@app.exception_handler(InstalmentPlanAccountMustBeCredit)
async def handle_instalment_plan_account_type(r: Request, exc: InstalmentPlanAccountMustBeCredit):
    return _json(_422, str(exc))


@app.exception_handler(InstalmentPlanTransactionEditNotAllowed)
async def handle_instalment_plan_tx_edit(r: Request, exc: InstalmentPlanTransactionEditNotAllowed):
    return _json(_422, str(exc))


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

API_PREFIX = "/api/v1"

app.include_router(admin_router.router, prefix=API_PREFIX)
app.include_router(analytics_router.router, prefix=API_PREFIX)
app.include_router(auth_router.router, prefix=API_PREFIX)
app.include_router(users_router.router, prefix=API_PREFIX)
app.include_router(accounts_router.router, prefix=API_PREFIX)
app.include_router(categories_router.router, prefix=API_PREFIX)
app.include_router(concepts_router.router, prefix=API_PREFIX)
app.include_router(transactions_router.router, prefix=API_PREFIX)
app.include_router(fin_goals_router.router, prefix=API_PREFIX)
app.include_router(summary_router.router, prefix=API_PREFIX)
app.include_router(external_account_router.router, prefix=API_PREFIX)
app.include_router(exchange_rates_router.router, prefix=API_PREFIX)
app.include_router(importacion_router.router, prefix=API_PREFIX)
app.include_router(instalment_plan_router.router, prefix=API_PREFIX)
app.include_router(household_router.router, prefix=API_PREFIX)
