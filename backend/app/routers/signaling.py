import uuid
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from app.services.signaling_service import signaling_manager

logger = logging.getLogger("webrtc.router")

router = APIRouter(tags=["WebRTC Streaming & Signaling"])


@router.get("/stream/status")
def get_all_stream_statuses():
    """Retrieve status of all active streaming rooms."""
    return signaling_manager.get_all_rooms_status()


@router.get("/stream/{camera_id}/status")
def get_stream_status(camera_id: str):
    """Retrieve streaming and viewer status for a specific camera."""
    return signaling_manager.get_room_status(camera_id)


@router.websocket("/ws/signaling/{camera_id}")
async def websocket_signaling_endpoint(
    websocket: WebSocket,
    camera_id: str,
    role: str = Query(..., pattern="^(broadcaster|viewer)$"),
    client_id: Optional[str] = Query(None),
):
    """
    WebRTC Signaling WebSocket.
    Roles:
      - 'broadcaster': The mobile phone acting as the static camera video source.
      - 'viewer': The React desktop dashboard viewing the live camera feed.
    """
    await websocket.accept()
    if not client_id:
        client_id = f"{role}_{uuid.uuid4().hex[:8]}"

    try:
        if role == "broadcaster":
            await signaling_manager.register_broadcaster(camera_id, client_id, websocket)
            await websocket.send_json(
                {
                    "type": "registered",
                    "role": "broadcaster",
                    "client_id": client_id,
                    "camera_id": camera_id,
                    "message": "Broadcaster registered. Ready to stream.",
                }
            )
        else:
            await signaling_manager.register_viewer(camera_id, client_id, websocket)
            await websocket.send_json(
                {
                    "type": "registered",
                    "role": "viewer",
                    "client_id": client_id,
                    "camera_id": camera_id,
                    "message": "Viewer registered. Awaiting broadcaster stream.",
                }
            )

        # Message loop
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "camera-meta":
                # Broadcaster publishes camera hardware metadata (resolution, facing_mode, etc.)
                meta = data.get("meta", {})
                signaling_manager.update_broadcaster_meta(camera_id, meta)
                await signaling_manager.broadcast_to_viewers(
                    camera_id,
                    {
                        "type": "camera-meta",
                        "camera_id": camera_id,
                        "meta": meta,
                    },
                )

            elif msg_type == "offer":
                # Broadcaster sends SDP offer targeted to a specific viewer
                target_viewer_id = data.get("target")
                if target_viewer_id:
                    await signaling_manager.send_to_viewer(
                        camera_id,
                        target_viewer_id,
                        {
                            "type": "offer",
                            "sdp": data.get("sdp"),
                            "sender": client_id,
                            "camera_id": camera_id,
                        },
                    )

            elif msg_type == "answer":
                # Viewer sends SDP answer back to broadcaster
                await signaling_manager.send_to_broadcaster(
                    camera_id,
                    {
                        "type": "answer",
                        "sdp": data.get("sdp"),
                        "sender": client_id,
                        "camera_id": camera_id,
                    },
                )

            elif msg_type == "ice-candidate":
                # ICE Candidate routing
                target = data.get("target")
                candidate = data.get("candidate")
                if target:
                    if role == "broadcaster":
                        # Send to specific viewer
                        await signaling_manager.send_to_viewer(
                            camera_id,
                            target,
                            {
                                "type": "ice-candidate",
                                "candidate": candidate,
                                "sender": client_id,
                            },
                        )
                    else:
                        # Send to broadcaster
                        await signaling_manager.send_to_broadcaster(
                            camera_id,
                            {
                                "type": "ice-candidate",
                                "candidate": candidate,
                                "sender": client_id,
                            },
                        )

            elif msg_type == "leave":
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for [{role}] [{client_id}] on camera [{camera_id}]")
    except Exception as e:
        logger.error(f"Signaling error for [{role}] [{client_id}] on camera [{camera_id}]: {e}")
    finally:
        if role == "broadcaster":
            await signaling_manager.unregister_broadcaster(camera_id, client_id)
        else:
            await signaling_manager.unregister_viewer(camera_id, client_id)
