from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        error_code = getattr(exc, 'default_code', 'error')
        response.data = {
            'success': False,
            'error': error_code.upper() if isinstance(error_code, str) else 'ERROR',
            'message': response.data.get('detail', str(exc)),
            'details': response.data if 'detail' not in response.data else None,
        }

    return response


class APIException(Exception):
    def __init__(self, error_code: str, message: str, status_code: int = 400):
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        super().__init__(message)

    def to_response(self):
        return Response({
            'success': False,
            'error': self.error_code,
            'message': self.message,
        }, status=self.status_code)


class DailyLimitExceeded(APIException):
    def __init__(self, feature_name: str, limit: int, used: int, reset_at: str):
        super().__init__(
            error_code='DAILY_LIMIT_EXCEEDED',
            message=f'일일 {feature_name} 한도({limit}회)를 초과했습니다.',
            status_code=429
        )
        self.limit = limit
        self.used = used
        self.reset_at = reset_at

    def to_response(self):
        return Response({
            'success': False,
            'error': self.error_code,
            'message': self.message,
            'limit': self.limit,
            'used': self.used,
            'reset_at': self.reset_at,
        }, status=self.status_code)


class FeatureLocked(APIException):
    def __init__(self, feature_name: str = ''):
        super().__init__(
            error_code='FEATURE_LOCKED',
            message=f'이 기능은 유료 버전에서 사용할 수 있습니다.',
            status_code=403
        )


class ExternalAPIError(APIException):
    def __init__(self, service: str, message: str = ''):
        super().__init__(
            error_code='EXTERNAL_API_ERROR',
            message=f'외부 API 오류 ({service}): {message}' if message else f'외부 API 오류 ({service})',
            status_code=502
        )
