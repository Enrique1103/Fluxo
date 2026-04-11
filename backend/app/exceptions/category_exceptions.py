class CategoryException(Exception):
    pass


class CategoryNotFound(CategoryException):
    pass


class CategoryAlreadyExists(CategoryException):
    pass


class CategoryHasActiveConcepts(CategoryException):
    pass


class CategoryHasActiveTransactions(CategoryException):
    pass


class SystemCategoryCannotBeModified(CategoryException):
    pass
