import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response

logger = logging.getLogger(__name__)

def enterprise_exception_handler(exc, context):
    \"\"\"
    Global Exception API Handler.
    Intercepts standard errors, and sanitizes/formats them into an Enterprise standard JSON.
    Logs tracebacks dynamically instead of 500 HTML splashes.
    \"\"\"
    # Call REST framework's default exception handler first,
    # to get the standard error response.
    response = exception_handler(exc, context)

    if response is not None:
        response.data = {
            'success': False,
            'errors': response.data,
            'status_code': response.status_code
        }
    else:
        # It's an unhandled server error (500)
        logger.error(f"Unhandled Exception in {context.get('view')}", exc_info=exc)
        response = Response(
            {
                'success': False,
                'errors': 'Internal Server Error. The issue has been logged.',
                'status_code': 500
            },
            status=500
        )

    return response
