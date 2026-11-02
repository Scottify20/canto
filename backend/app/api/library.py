from dataclasses import replace

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .. import deps
from ..core.jobs import jobs
from ..services.filesystem import list_directory
from ..services.health import system_health
from .common import guard

router = APIRouter(prefix="/api")


class ProviderUpdate(BaseModel):
    id: str
    enabled: bool = True
    keys: dict[str, str] = {}  # only the fields being changed; "" clears a stored value


class SettingsUpdate(BaseModel):
    input_path: str | None = None
    output_path: str | None = None
    folder_structure: str | None = None
    tolerance: float | None = Field(None, ge=0, le=1)
    discogs_token: str | None = None
    delete_originals: bool | None = None
    duplicate_action: str | None = Field(None, pattern="^(skip|keep|replace)$")
    prune_empty_dirs: bool | None = None
    multichannel_path: str | None = None
    multichannel_gain_offset: float | None = Field(None, ge=-24, le=24)
    lyrics_order: list[str] | None = None
    providers: list[ProviderUpdate] | None = None


class TagUpdate(BaseModel):
    id: int
    tags: dict[str, str | int | bool | None]


class MatchRequest(BaseModel):
    id: int


class RemoveRequest(BaseModel):
    ids: list[int]
    delete_files: bool = False


class ClearRequest(BaseModel):
    delete_files: bool = False


def settings_payload() -> dict:
    s = deps.engine.settings
    return {
        "input_path": s.input_path, "output_path": s.output_path, "folder_structure": s.folder_structure,
        "tolerance": s.tolerance, "delete_originals": s.delete_originals, "duplicate_action": s.duplicate_action,
        "prune_empty_dirs": s.prune_empty_dirs, "multichannel_path": s.multichannel_path,
        "multichannel_gain_offset": s.multichannel_gain_offset, "has_discogs_token": bool(s.discogs_token),
        "providers": deps.lyrics.provider_states(),
    }


@router.get("/status")
def status():
    return {"status": "online", "message": "Engine ready", "checks": system_health()}


@router.get("/settings")
def get_settings():
    return settings_payload()


@router.put("/settings")
def put_settings(body: SettingsUpdate):
    current = deps.engine.settings
    changes = body.model_dump(exclude_none=True)
    providers = {k: dict(v, keys=dict(v.get("keys", {}))) for k, v in current.lyrics_providers.items()}
    for update in changes.pop("providers", []):
        entry = providers.setdefault(update["id"], {"enabled": True, "keys": {}})
        entry["enabled"] = update["enabled"]
        for key, value in update["keys"].items():
            if value == "":
                entry["keys"].pop(key, None)
            else:
                entry["keys"][key] = value
    new = replace(current, **changes, lyrics_providers=providers)
    if new != current:
        if jobs.is_running():
            raise HTTPException(409, "Settings are locked while a job is running")
        guard(lambda: deps.engine.apply_settings(new))
    return settings_payload()


@router.get("/fs/list")
def fs_list(path: str | None = Query(None)):
    return guard(lambda: list_directory(path))


@router.get("/tracks")
def get_tracks():
    return {"status": "success", "data": guard(deps.tracks.list_tracks)}


@router.get("/tracks/{item_id}/details")
def track_details(item_id: int):
    return guard(lambda: deps.tracks.details(item_id))


@router.post("/match")
def fetch_match(body: MatchRequest):
    return {"status": "success", "candidates": guard(lambda: deps.matcher.propose(body.id))}


@router.post("/tags/update")
def update_tags(body: TagUpdate):
    return {"status": "success", "track": guard(lambda: deps.tracks.update_tags(body.id, body.tags))}


@router.post("/tracks/remove")
def remove_tracks(body: RemoveRequest):
    return {"removed": guard(lambda: deps.tracks.remove(body.ids, body.delete_files))}


@router.post("/library/clear")
def clear_library(body: ClearRequest):
    return {"removed": guard(lambda: deps.tracks.clear(body.delete_files))}


@router.post("/library/prune-missing")
def prune_missing():
    return {"removed": guard(deps.tracks.prune_missing)}


@router.get("/duplicates")
def duplicates():
    return {"groups": guard(deps.tracks.duplicates)}
