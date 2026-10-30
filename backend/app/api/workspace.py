from fastapi import APIRouter
from pydantic import BaseModel

from .. import deps
from ..services import maintenance as maint_module
from ..services.maintenance import MaintenanceService
from ..services.structure import preview
from .common import guard

router = APIRouter(prefix="/api")
maintenance = MaintenanceService(deps.engine, deps.tracks)


class ScanRequest(BaseModel):
    path: str | None = None


class StructureRequest(BaseModel):
    template: str


class MaintenanceRequest(BaseModel):
    actions: list[str]


@router.post("/inbox/scan")
def scan_inbox(body: ScanRequest):
    return guard(lambda: deps.inbox.scan(body.path or deps.engine.settings.input_path))


@router.post("/structure/preview")
def structure_preview(body: StructureRequest):
    return {"samples": guard(lambda: preview(body.template))}


@router.get("/maintenance/scan")
def maintenance_scan():
    return guard(maintenance.scan)


@router.post("/maintenance/run")
def maintenance_run(body: MaintenanceRequest):
    actions = [a for a in body.actions if a in maint_module.ACTIONS]
    return {"done": guard(lambda: maintenance.run(actions))}
