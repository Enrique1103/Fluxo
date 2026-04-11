class ExchangeRateException(Exception):
    pass


class ExchangeRateNotFound(ExchangeRateException):
    pass


class ExchangeRateAlreadyExists(ExchangeRateException):
    pass


class ExchangeRateMissing(ExchangeRateException):
    pass


class UnauthorizedExchangeRateAccess(ExchangeRateException):
    pass
