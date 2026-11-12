from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.pillar import (
    ReferencePillarCreate,
    ReferencePillarRead,
    ReferencePillarUpdate,
    PillarImagePointCreate,
    PillarImagePointRead,
)
from app.schemas.common import StatusResponse
from app.services.pillar_service import PillarService

router = APIRouter(tags=["Reference Pillars"])


@router.get("/cameras/{camera_id}/pillars", response_model=List[ReferencePillarRead])
def list_pillars_for_camera(
    camera_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve all reference border pillars configured for a specific camera."""
    return PillarService.list_by_camera(db, camera_id)


@router.post(
    "/cameras/{camera_id}/pillars",
    response_model=ReferencePillarRead,
    status_code=status.HTTP_201_CREATED,
)
def create_pillar_for_camera(
    camera_id: str,
    payload: ReferencePillarCreate,
    db: Session = Depends(get_db),
):
    """Register a new reference border pillar for a static camera."""
    return PillarService.create_pillar(db, camera_id, payload)


@router.get("/pillars/{pillar_id}", response_model=ReferencePillarRead)
def get_pillar(
    pillar_id: int,
    db: Session = Depends(get_db),
):
    """Retrieve details and recorded image points for a specific pillar."""
    return PillarService.get_pillar(db, pillar_id)


@router.put("/pillars/{pillar_id}", response_model=ReferencePillarRead)
def update_pillar(
    pillar_id: int,
    payload: ReferencePillarUpdate,
    db: Session = Depends(get_db),
):
    """Update pillar physical parameters."""
    return PillarService.update_pillar(db, pillar_id, payload)


@router.delete("/pillars/{pillar_id}", response_model=StatusResponse)
def delete_pillar(
    pillar_id: int,
    db: Session = Depends(get_db),
):
    """Delete a reference pillar and its associated image points."""
    PillarService.delete_pillar(db, pillar_id)
    return StatusResponse(
        success=True,
        message=f"Pillar {pillar_id} deleted successfully.",
    )


@router.post(
    "/pillars/{pillar_id}/points",
    response_model=PillarImagePointRead,
    status_code=status.HTTP_201_CREATED,
)
def record_image_point(
    pillar_id: int,
    payload: PillarImagePointCreate,
    db: Session = Depends(get_db),
):
    """Record or update an image pixel coordinate (TOP or BASE) for a reference pillar."""
    return PillarService.add_image_point(db, pillar_id, payload)
