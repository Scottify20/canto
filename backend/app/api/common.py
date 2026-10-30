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
