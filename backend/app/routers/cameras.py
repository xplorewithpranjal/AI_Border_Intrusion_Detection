from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.camera import CameraCreate, CameraUpdate, CameraRead
from app.schemas.common import StatusResponse
from app.services.camera_service import CameraService

router = APIRouter(prefix="/cameras", tags=["Cameras"])


@router.get("", response_model=List[CameraRead])
def list_cameras(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """Retrieve all registered static cameras."""
    return CameraService.list_cameras(db, skip=skip, limit=limit)


@router.post("", response_model=CameraRead, status_code=status.HTTP_201_CREATED)
def create_camera(
    payload: CameraCreate,
    db: Session = Depends(get_db),
):
    """Register a new static camera."""
    return CameraService.create_camera(db, payload)


@router.get("/{camera_id}", response_model=CameraRead)
def get_camera(
    camera_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve details for a specific camera by camera_id or database ID."""
    return CameraService.get_camera(db, camera_id)


@router.put("/{camera_id}", response_model=CameraRead)
def update_camera(
    camera_id: str,
    payload: CameraUpdate,
    db: Session = Depends(get_db),
):
    """Update camera details."""
    return CameraService.update_camera(db, camera_id, payload)


@router.delete("/{camera_id}", response_model=StatusResponse)
def delete_camera(
    camera_id: str,
    db: Session = Depends(get_db),
):
    """Delete a static camera and its associated reference pillars and calibrations."""
    CameraService.delete_camera(db, camera_id)
    return StatusResponse(
        success=True,
        message=f"Camera '{camera_id}' and all associated data deleted successfully.",
    )
