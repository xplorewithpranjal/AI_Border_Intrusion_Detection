from fastapi import HTTPException, status


class EntityNotFoundException(HTTPException):
    def __init__(self, entity_name: str, entity_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{entity_name} with identifier '{entity_id}' not found.",
        )


class EntityConflictException(HTTPException):
    def __init__(self, message: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=message,
        )


class CalibrationPendingException(HTTPException):
    def __init__(self, camera_id: str):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Camera '{camera_id}' has not been calibrated yet. Complete reference pillar calibration before running localization or validation.",
        )
