import json
import logging
from typing import Dict, Optional, Any
from fastapi import WebSocket

logger = logging.getLogger("webrtc.signaling")


class CameraRoom:
    def __init__(self, camera_id: str):
        self.camera_id = camera_id
        self.broadcaster: Optional[WebSocket] = None
        self.broadcaster_id: Optional[str] = None
        self.broadcaster_meta: Dict[str, Any] = {}
        self.viewers: Dict[str, WebSocket] = {}

    @property
    def has_broadcaster(self) -> bool:
        return self.broadcaster is not None

    @property
    def viewer_count(self) -> int:
        return len(self.viewers)


class SignalingManager:
    """
    Manages WebRTC signaling sessions partitioned by camera_id.
    Handles message dispatch between phone camera (broadcaster) and desktop dashboard (viewers).
    """

    def __init__(self):
        self._rooms: Dict[str, CameraRoom] = {}

    def _get_or_create_room(self, camera_id: str) -> CameraRoom:
        if camera_id not in self._rooms:
            self._rooms[camera_id] = CameraRoom(camera_id)
        return self._rooms[camera_id]

    async def register_broadcaster(
        self, camera_id: str, client_id: str, websocket: WebSocket
    ) -> bool:
        room = self._get_or_create_room(camera_id)
        # If another broadcaster was active, close the previous one or replace it
        if room.broadcaster and room.broadcaster != websocket:
            try:
                await room.broadcaster.send_json(
                    {"type": "error", "message": "Replaced by a newer broadcaster session."}
                )
                await room.broadcaster.close()
            except Exception:
                pass

        room.broadcaster = websocket
        room.broadcaster_id = client_id
        room.broadcaster_meta = {}
        logger.info(f"Broadcaster [{client_id}] registered for camera [{camera_id}]")

        # Notify all active viewers in the room that broadcaster is online
        await self.broadcast_to_viewers(
            camera_id,
            {
                "type": "broadcaster-status",
                "online": True,
                "camera_id": camera_id,
                "broadcaster_id": client_id,
            },
        )
        return True

    async def unregister_broadcaster(self, camera_id: str, client_id: str):
        if camera_id in self._rooms:
            room = self._rooms[camera_id]
            if room.broadcaster_id == client_id:
                room.broadcaster = None
                room.broadcaster_id = None
                room.broadcaster_meta = {}
                logger.info(f"Broadcaster [{client_id}] disconnected from camera [{camera_id}]")

                # Notify all viewers that the stream stopped
                await self.broadcast_to_viewers(
                    camera_id,
                    {
                        "type": "broadcaster-status",
                        "online": False,
                        "camera_id": camera_id,
                    },
                )

    async def register_viewer(
        self, camera_id: str, viewer_id: str, websocket: WebSocket
    ):
        room = self._get_or_create_room(camera_id)
        room.viewers[viewer_id] = websocket
        logger.info(f"Viewer [{viewer_id}] registered for camera [{camera_id}]")

        # Inform the viewer of current broadcaster state
        await websocket.send_json(
            {
                "type": "broadcaster-status",
                "online": room.has_broadcaster,
                "camera_id": camera_id,
                "meta": room.broadcaster_meta,
            }
        )

        # If broadcaster is currently active, notify it that a new viewer has joined
        if room.has_broadcaster and room.broadcaster:
            try:
                await room.broadcaster.send_json(
                    {
                        "type": "viewer-joined",
                        "viewer_id": viewer_id,
                        "camera_id": camera_id,
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to notify broadcaster of new viewer: {e}")

    async def unregister_viewer(self, camera_id: str, viewer_id: str):
        if camera_id in self._rooms:
            room = self._rooms[camera_id]
            if viewer_id in room.viewers:
                del room.viewers[viewer_id]
                logger.info(f"Viewer [{viewer_id}] disconnected from camera [{camera_id}]")

                # Inform broadcaster that this viewer disconnected
                if room.has_broadcaster and room.broadcaster:
                    try:
                        await room.broadcaster.send_json(
                            {
                                "type": "viewer-left",
                                "viewer_id": viewer_id,
                                "camera_id": camera_id,
                            }
                        )
                    except Exception as e:
                        logger.warning(f"Failed to notify broadcaster of viewer departure: {e}")

    async def send_to_broadcaster(self, camera_id: str, message: dict):
        if camera_id in self._rooms:
            room = self._rooms[camera_id]
            if room.broadcaster:
                await room.broadcaster.send_json(message)

    async def send_to_viewer(self, camera_id: str, viewer_id: str, message: dict):
        if camera_id in self._rooms:
            room = self._rooms[camera_id]
            if viewer_id in room.viewers:
                await room.viewers[viewer_id].send_json(message)

    async def broadcast_to_viewers(self, camera_id: str, message: dict):
        if camera_id in self._rooms:
            room = self._rooms[camera_id]
            stale_viewers = []
            for v_id, ws in room.viewers.items():
                try:
                    await ws.send_json(message)
                except Exception:
                    stale_viewers.append(v_id)
            for v_id in stale_viewers:
                del room.viewers[v_id]

    def update_broadcaster_meta(self, camera_id: str, meta: dict):
        if camera_id in self._rooms:
            self._rooms[camera_id].broadcaster_meta.update(meta)

    def get_room_status(self, camera_id: str) -> dict:
        if camera_id not in self._rooms:
            return {
                "camera_id": camera_id,
                "is_streaming": False,
                "viewer_count": 0,
                "meta": {},
            }
        room = self._rooms[camera_id]
        return {
            "camera_id": camera_id,
            "is_streaming": room.has_broadcaster,
            "viewer_count": room.viewer_count,
            "meta": room.broadcaster_meta,
        }

    def get_all_rooms_status(self) -> dict:
        return {
            cam_id: {
                "is_streaming": room.has_broadcaster,
                "viewer_count": room.viewer_count,
                "meta": room.broadcaster_meta,
            }
            for cam_id, room in self._rooms.items()
        }


signaling_manager = SignalingManager()
