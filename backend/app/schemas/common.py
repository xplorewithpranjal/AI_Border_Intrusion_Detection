from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(default="healthy", description="Service health status")
    app_name: str = Field(description="Name of the application")
    environment: str = Field(description="Runtime environment")
    version: str = Field(default="1.0.0-phase1", description="System phase and version")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="UTC server timestamp")
    database_connected: bool = Field(default=True, description="Database connectivity status")


class StatusResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None
