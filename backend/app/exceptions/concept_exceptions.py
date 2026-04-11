class ConceptException(Exception):
    pass


class ConceptNotFound(ConceptException):
    pass


class UnauthorizedConceptAccess(ConceptException):
    pass


class ConceptAlreadyExists(ConceptException):
    pass


class ConceptInUseByTransactions(ConceptException):
    pass


class SystemConceptCannotBeDeleted(ConceptException):
    pass
