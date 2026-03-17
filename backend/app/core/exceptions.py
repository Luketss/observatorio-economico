class AppException(Exception):
    """
    Base exception for application domain errors.
    """

    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundException(AppException):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(
            code="NOT_FOUND",
            message=message,
            status_code=404,
        )


class ConflictException(AppException):
    def __init__(self, message: str = "Conflict"):
        super().__init__(
            code="CONFLICT",
            message=message,
            status_code=409,
        )


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(
            code="UNAUTHORIZED",
            message=message,
            status_code=401,
        )
