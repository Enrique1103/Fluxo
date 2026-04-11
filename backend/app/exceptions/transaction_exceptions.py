class TransactionException(Exception):
    pass


class TransactionNotFound(TransactionException):
    pass


class UnauthorizedTransactionAccess(TransactionException):
    pass


class TransferEditNotAllowed(TransactionException):
    pass


class SameAccountTransferNotAllowed(TransactionException):
    pass


class ConceptNotBelongsToUser(TransactionException):
    pass


class InstalmentPlanTransactionEditNotAllowed(TransactionException):
    pass
