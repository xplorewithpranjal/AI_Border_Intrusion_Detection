import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_webrtc_signaling_flow():
    cam_id = "CAM_TEST_STREAM"

    # 1. Connect Broadcaster (phone camera)
    with client.websocket_connect(f"/api/ws/signaling/{cam_id}?role=broadcaster&client_id=phone_01") as ws_broadcaster:
        reg_b = ws_broadcaster.receive_json()
        assert reg_b["type"] == "registered"
        assert reg_b["role"] == "broadcaster"
        print("PASS: Broadcaster connected & registered")

        # 2. Check stream status endpoint over HTTP
        res = client.get(f"/api/stream/{cam_id}/status")
        assert res.status_code == 200
        status_data = res.json()
        assert status_data["is_streaming"] is True
        assert status_data["viewer_count"] == 0
        print("PASS: HTTP stream status shows active broadcaster")

        # 3. Connect Viewer (desktop dashboard)
        with client.websocket_connect(f"/api/ws/signaling/{cam_id}?role=viewer&client_id=viewer_01") as ws_viewer:
            # Viewer gets broadcaster status and registration
            status_v = ws_viewer.receive_json()
            assert status_v["type"] == "broadcaster-status"
            assert status_v["online"] is True

            reg_v = ws_viewer.receive_json()
            assert reg_v["type"] == "registered"
            assert reg_v["role"] == "viewer"
            print("PASS: Viewer connected & received broadcaster-status")

            # Broadcaster should receive notification of new viewer
            viewer_joined = ws_broadcaster.receive_json()
            assert viewer_joined["type"] == "viewer-joined"
            assert viewer_joined["viewer_id"] == "viewer_01"
            print("PASS: Broadcaster notified of viewer-joined")

            # 4. Broadcaster sends camera metadata (resolution, facing mode, fps)
            ws_broadcaster.send_json({
                "type": "camera-meta",
                "meta": {
                    "resolution": "1920x1080",
                    "facing_mode": "environment",
                    "fps": 30
                }
            })
            meta_msg = ws_viewer.receive_json()
            assert meta_msg["type"] == "camera-meta"
            assert meta_msg["meta"]["resolution"] == "1920x1080"
            print("PASS: Camera metadata routed to viewer")

            # 5. Broadcaster sends SDP offer
            sample_offer = {"type": "offer", "sdp": "v=0\r\no=broadcaster 12345 2 IN IP4 127.0.0.1"}
            ws_broadcaster.send_json({
                "type": "offer",
                "sdp": sample_offer,
                "target": "viewer_01"
            })
            offer_received = ws_viewer.receive_json()
            assert offer_received["type"] == "offer"
            assert offer_received["sdp"] == sample_offer
            assert offer_received["sender"] == "phone_01"
            print("PASS: SDP offer routed to viewer")

            # 6. Viewer sends SDP answer
            sample_answer = {"type": "answer", "sdp": "v=0\r\no=viewer 67890 2 IN IP4 127.0.0.1"}
            ws_viewer.send_json({
                "type": "answer",
                "sdp": sample_answer,
                "target": "phone_01"
            })
            answer_received = ws_broadcaster.receive_json()
            assert answer_received["type"] == "answer"
            assert answer_received["sdp"] == sample_answer
            print("PASS: SDP answer routed to broadcaster")

            # 7. ICE Candidate exchange
            sample_candidate = {"candidate": "candidate:1 1 UDP 2130706431 192.168.1.77 50000 typ host", "sdpMid": "0"}
            ws_broadcaster.send_json({
                "type": "ice-candidate",
                "candidate": sample_candidate,
                "target": "viewer_01"
            })
            cand_received = ws_viewer.receive_json()
            assert cand_received["type"] == "ice-candidate"
            assert cand_received["candidate"] == sample_candidate
            print("PASS: ICE candidate routed to viewer")


if __name__ == "__main__":
    test_webrtc_signaling_flow()
    print("\nALL WEBRTC SIGNALING TESTS PASSED!")
