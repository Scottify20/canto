import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable

MAX_LOG_LINES = 5000


@dataclass
class Job:
    id: str
    kind: str
    status: str = "running"  # running | done | error | cancelled
    total: int = 0
    done: int = 0
    message: str = ""
    log: list[str] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    on_cancel: Callable[[], None] | None = None

    def write(self, line: str) -> None:
        self.log.append(line)
        if len(self.log) > MAX_LOG_LINES:
            del self.log[: len(self.log) - MAX_LOG_LINES]

    @property
    def cancelled(self) -> bool:
        return self.cancel_event.is_set()

    def snapshot(self, since: int = 0) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "total": self.total,
            "done": self.done,
            "message": self.message,
            "log": self.log[since:],
            "log_length": len(self.log),
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


class JobManager:
    """Runs one long task at a time in a background thread."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._current: Job | None = None

    @property
    def current(self) -> Job | None:
        return self._current

    def is_running(self) -> bool:
        return self._current is not None and self._current.status == "running"

    def start(self, kind: str, target: Callable[[Job], None]) -> Job:
        with self._lock:
            if self.is_running():
                raise RuntimeError(f"A {self._current.kind} job is already running")
            job = Job(id=uuid.uuid4().hex[:8], kind=kind)
            self._current = job

        def runner() -> None:
            try:
                target(job)
                job.status = "cancelled" if job.cancelled else "done"
            except Exception as exc:  # noqa: BLE001 - surfaced to the UI log
                job.write(f"[Error] {exc}")
                job.message = str(exc)
                job.status = "error"
            finally:
                job.finished_at = time.time()

        threading.Thread(target=runner, name=f"job-{kind}", daemon=True).start()
        return job

    def cancel(self) -> bool:
        job = self._current
        if not job or job.status != "running":
            return False
        job.cancel_event.set()
        if job.on_cancel:
            job.on_cancel()
        return True


jobs = JobManager()
