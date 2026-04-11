class HouseholdException(Exception):
    pass


class HouseholdNotFound(HouseholdException):
    pass


class UnauthorizedHouseholdAccess(HouseholdException):
    pass


class NotHouseholdAdmin(HouseholdException):
    pass


class AlreadyHouseholdMember(HouseholdException):
    pass


class MemberNotFound(HouseholdException):
    pass


class InviteNotFound(HouseholdException):
    pass


class InviteExpired(HouseholdException):
    pass


class InviteAlreadyUsed(HouseholdException):
    pass


class CannotRemoveLastAdmin(HouseholdException):
    pass
