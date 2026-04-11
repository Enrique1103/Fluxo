class InstalmentPlanException(Exception):
    pass


class InstalmentPlanNotFound(InstalmentPlanException):
    pass


class UnauthorizedInstalmentPlanAccess(InstalmentPlanException):
    pass


class InstalmentPlanAccountMustBeCredit(InstalmentPlanException):
    pass
