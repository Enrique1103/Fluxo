class UserException(Exception):
    pass


class EmailAlreadyExists(UserException):
    pass


class UserNotFound(UserException):
    pass


class InvalidCredentials(UserException):
    pass


class InactiveUser(UserException):
    pass


class UnauthorizedUserAccess(UserException):
    pass
