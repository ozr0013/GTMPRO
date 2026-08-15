"""
Minimal cross-platform image server for Flywheel hero art.

    pip install -r requirements-images.txt
    python scripts/image-server.py

Speaks the subset of the AUTOMATIC1111 API that Flywheel uses, so
IMAGE_PROVIDER=a1111 talks to this without any code change — and you can point
the same setting at a real A1111 install later if you outgrow it.

Why not just use A1111: it installs torch *and* a full web application, extension
system and model manager (~10 GB) to expose one endpoint. This is ~150 lines over
the same torch install, and the default model is 2.5 GB rather than 7-10.

Device is detected, not configured: CUDA on your Windows box, Metal (MPS) on an
Apple Silicon Mac, CPU anywhere else. Same command on every machine.
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# SD-Turbo: 2.5 GB, distilled for 1-4 steps, native 512x512. Fast enough to be
# usable on a laptop GPU and small enough to download over hotel wifi.
MODEL_ID = os.environ.get("IMAGE_SERVER_MODEL", "stabilityai/sd-turbo")
HOST = os.environ.get("IMAGE_SERVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("IMAGE_SERVER_PORT", "7860"))

_pipe = None
_device = "cpu"


def _select_device():
    import torch

    if torch.cuda.is_available():
        return "cuda", torch.float16
    # Apple Silicon. Some diffusers ops still lack MPS kernels; the env var below
    # lets them fall back to CPU instead of crashing mid-generation.
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        return "mps", torch.float16
    return "cpu", torch.float32


def load_pipeline():
    global _pipe, _device
    if _pipe is not None:
        return _pipe

    import torch
    from diffusers import AutoPipelineForText2Image

    _device, dtype = _select_device()
    print(f"[flywheel] device={_device} dtype={dtype} model={MODEL_ID}", flush=True)
    print("[flywheel] first run downloads the model (~2.5 GB) — later runs are cached", flush=True)

    pipe = AutoPipelineForText2Image.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        variant="fp16" if dtype == torch.float16 else None,
        safety_checker=None,
    )
    pipe = pipe.to(_device)
    pipe.set_progress_bar_config(disable=True)

    if _device == "cuda":
        # trades a little speed for a lot of headroom on an 8 GB laptop card
        pipe.enable_attention_slicing()

    _pipe = pipe
    print(f"[flywheel] ready on http://{HOST}:{PORT}", flush=True)
    return _pipe


def is_turbo() -> bool:
    """Turbo/Lightning models are distilled to run without guidance."""
    return any(tag in MODEL_ID.lower() for tag in ("turbo", "lightning", "lcm", "hyper"))


def generate(payload: dict) -> str:
    pipe = load_pipeline()

    prompt = payload.get("prompt") or "a photograph"
    negative = payload.get("negative_prompt") or None
    width = int(payload.get("width", 512))
    height = int(payload.get("height", 512))
    steps = int(payload.get("steps", 4 if is_turbo() else 25))
    cfg = float(payload.get("cfg_scale", 7.0))

    kwargs = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "num_inference_steps": steps,
    }

    if is_turbo():
        # A distilled model with guidance on produces washed-out mush, and the
        # negative prompt is meaningless without guidance — so both are dropped.
        kwargs["guidance_scale"] = 0.0
        kwargs["num_inference_steps"] = max(1, min(steps, 4))
    else:
        kwargs["guidance_scale"] = cfg
        if negative:
            kwargs["negative_prompt"] = negative

    started = time.time()
    image = pipe(**kwargs).images[0]
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    print(
        f"[flywheel] {width}x{height} {kwargs['num_inference_steps']} steps "
        f"in {time.time() - started:.1f}s",
        flush=True,
    )
    return base64.b64encode(buffer.getvalue()).decode("ascii")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        raw = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):  # noqa: N802
        # Flywheel probes this to decide whether the server is reachable
        if self.path.startswith("/sdapi/v1/options"):
            self._send(200, {"sd_model_checkpoint": MODEL_ID, "device": _device})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        if not self.path.startswith("/sdapi/v1/txt2img"):
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            self._send(200, {"images": [generate(payload)]})
        except Exception as exc:  # noqa: BLE001 - report, never die
            print(f"[flywheel] generation failed: {exc}", file=sys.stderr, flush=True)
            self._send(500, {"error": str(exc)})

    def log_message(self, *_args):
        pass  # we print our own, one line per image


if __name__ == "__main__":
    try:
        load_pipeline()
    except Exception as exc:  # noqa: BLE001
        print(f"[flywheel] could not load the model: {exc}", file=sys.stderr)
        print("[flywheel] pip install -r requirements-images.txt", file=sys.stderr)
        raise SystemExit(1)

    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
