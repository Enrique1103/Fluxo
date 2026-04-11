class FinGoalException(Exception):
    pass


class FinGoalNotFound(FinGoalException):
    pass


class UnauthorizedFinGoalAccess(FinGoalException):
    pass


class AllocationExceedsLimit(FinGoalException):
    pass


class FinGoalAccountRequired(FinGoalException):
    pass


class FinGoalLimitExceeded(FinGoalException):
    pass
