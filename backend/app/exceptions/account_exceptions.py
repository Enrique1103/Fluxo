class AccountException(Exception):
    pass


class AccountNotFound(AccountException):
    pass


class AccountAlreadyExists(AccountException):
    pass


class UnauthorizedAccountAccess(AccountException):
    pass


class InsufficientFunds(AccountException):
    pass


class InsufficientCreditLimit(AccountException):
    pass


class CreditBalanceCannotBePositive(AccountException):
    pass


class AccountHasTransactions(AccountException):
    pass
