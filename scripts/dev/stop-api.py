"""Detiene cualquier uvicorn local inspeccionando /proc.

Existe porque `pkill -f uvicorn` o `ps | grep | kill` pueden coincidir con la propia línea de
comandos del shell que los ejecuta y matarlo. Aquí solo se compara el ejecutable real.
Uso: python3 scripts/dev/stop-api.py
"""

import os
import signal


def main() -> None:
    me = os.getpid()
    for pid in filter(str.isdigit, os.listdir("/proc")):
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as handle:
                cmd = handle.read().split(b"\0")
        except OSError:
            continue
        is_python = os.path.basename(cmd[0]).startswith(b"python")
        runs_uvicorn = any(b"uvicorn" in part for part in cmd[1:3])
        if is_python and runs_uvicorn and int(pid) != me:
            print("detenido", pid)  # noqa: T201
            os.kill(int(pid), signal.SIGTERM)


if __name__ == "__main__":
    main()
