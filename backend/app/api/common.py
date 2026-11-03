from fastapi import HTTPException


def guard(call):
    """Translate service errors into HTTP responses."""
    try:
        return call()
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except (NotADirectoryError, PermissionError, FileNotFoundError, ValueError) as exc:
        raise HTTPException(400, str(exc))
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"{type(exc).__name__}: {exc}")


def ensure_space(keys: tuple[str, ...] = ("output", "multichannel")) -> None:
    check_space(keys)


def check_space(keys: tuple[str, ...]) -> None:
    """Refuse writing actions while a library drive is under the free-space limit (HTTP 507)."""
    from .. import deps
    from ..services.storage import low_space_message

    message = low_space_message(deps.engine.settings, keys)
    if message:
        raise HTTPException(507, message)


def space_guard():
    from fastapi import Depends

    # FastAPI would treat a tuple parameter of the dependency itself as a second body field
    return Depends(lambda: check_space(("output", "multichannel")))
