"""Prueba de punta a punta del puente entre VS Code y Claude Code.

Abre `claude` de verdad (con el plugin cargado desde esta carpeta) en una
terminal virtual y hace de extension de VS Code escribiendo los archivos de
su puente con el mismo formato. El puente vive en una carpeta temporal
(`LATIGO_HOME`), asi la prueba no toca el de la persona ni sus sesiones abiertas.
Revisa en la pantalla y en disco que cada cosa llegue al otro lado.

Uso: python scripts/e2e_puente.py --claude <ruta al binario>
Sale con codigo 0 si todo pasa.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import capturas_terminal as ct  # noqa: E402

BRIDGE = ct.BRIDGE
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASA' if ok else 'FALLA'}  {name}{'  · ' + detail if detail and not ok else ''}")


def read(name: str) -> dict:
    try:
        return json.loads((BRIDGE / name).read_text())
    except (OSError, ValueError):
        return {}


def write(name: str, data: dict) -> None:
    BRIDGE.mkdir(exist_ok=True)
    tmp = BRIDGE / f".{name}.tmp"
    tmp.write_text(json.dumps({"version": 1, **data}))
    tmp.replace(BRIDGE / name)


def band(session: ct.Session) -> str:
    return next((line for line in session.screen.display if "╾" in line), "")


def wait_until(session: ct.Session, condition, timeout: float = 5.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        session.pump(0.1)
        if condition():
            return True
    return False


def run(claude: str) -> None:
    write("config.json", {"enabled": True, "sound": False})
    write("stats.json", {"stats": {"total": 10, "onModel": 5, "onEffort": 5, "bestCombo": 2, "byDay": {}}})
    write("effort.json", {"seq": 4, "at": 1})
    session = ct.Session(claude, ct.REPO)
    try:
        if not session.wait_for("╾", 20) and "trust this folder" in session.text():
            session.send(b"\x1b[B")
            session.pump(0.3)
            session.send(b"\r")
        check("la banda aparece en Claude Code", session.wait_for("╾", 40))
        session.pump(1.0)

        check("toma los conteos que ya estaban en disco", "10 latigazos" in band(session), band(session))
        check("los 4 latigazos al effort de antes no se aplican", "effort:" not in band(session), band(session))

        presence_ok = wait_until(session, lambda: read("presence.json").get("model"), 6)
        check("Claude Code avisa que esta vivo (presence.json)", presence_ok, str(read("presence.json")))

        # VS Code: latigazo al effort.
        write("effort.json", {"seq": 5, "at": int(time.time() * 1000)})
        ok = wait_until(session, lambda: "effort: high ⚡" in band(session))
        check("un latigazo al effort desde VS Code sube el effort en Claude Code", ok, band(session))
        ok = wait_until(session, lambda: read("presence.json").get("boost") == "high")
        check("la presencia le cuenta a VS Code el effort forzado", ok, str(read("presence.json")))

        # VS Code: dos latigazos de golpe.
        write("effort.json", {"seq": 7, "at": int(time.time() * 1000)})
        ok = wait_until(session, lambda: "effort: max ⚡" in band(session))
        check("dos latigazos juntos desde VS Code suben dos niveles", ok, band(session))

        # VS Code: un latigazo con combo se anima tambien en la banda.
        write("stats.json", {"stats": {"total": 13, "onModel": 6, "onEffort": 7, "bestCombo": 3, "byDay": {}}})
        write("lash.json", {"id": "v-e2e-1", "at": int(time.time() * 1000), "target": "model", "combo": 3, "total": 13, "source": "vscode"})
        ok = wait_until(session, lambda: "x3 ¡TRIPLE!" in band(session), 3)
        check("un combo dado en VS Code se anima en la banda", ok, band(session))
        ok = wait_until(session, lambda: "13 latigazos" in band(session), 3)
        check("los conteos de VS Code se ven en Claude Code", ok, band(session))

        # Tecla de VS Code: apagar y prender.
        write("config.json", {"enabled": False, "sound": False})
        ok = wait_until(session, lambda: "látigo apagado" in session.text())
        check("apagar desde VS Code apaga la banda", ok)
        write("config.json", {"enabled": True, "sound": False})
        ok = wait_until(session, lambda: "[ apagar ]" in band(session) or "apagar" in band(session))
        check("prender desde VS Code la vuelve a mostrar", ok, band(session))

        # Claude Code: latigazo en la banda llega a disco para VS Code.
        session.send(b"\x18\t")
        session.pump(0.4)
        session.send(b"m")
        ok = wait_until(session, lambda: read("lash.json").get("source") == "terminal")
        check("un latigazo en Claude Code queda en lash.json para VS Code", ok, str(read("lash.json")))
        stats = read("stats.json").get("stats", {})
        check("y suma en stats.json", stats.get("total") == 14 and stats.get("onModel") == 7, str(stats))

        # Claude Code: /latigo off llega a config.json.
        session.send(b"\x1b")
        session.pump(0.3)
        session.send(b"/latigo off")
        session.pump(0.5)
        session.send(b"\r")
        ok = wait_until(session, lambda: read("config.json").get("enabled") is False, 6)
        check("/latigo off en Claude Code apaga tambien VS Code", ok, str(read("config.json")))
        session.send(b"/latigo on")
        session.pump(0.5)
        session.send(b"\r")
        ok = wait_until(session, lambda: read("config.json").get("enabled") is True, 6)
        check("/latigo on lo vuelve a prender", ok, str(read("config.json")))

        # /clear empieza una sesion nueva con el estado en blanco: la banda debe recargarse.
        session.send(b"/clear")
        session.pump(0.5)
        session.send(b"\r")
        ok = wait_until(session, lambda: "14 latigazos" in band(session), 4)
        check("tras /clear la banda conserva los conteos", ok, band(session))
        session.send(b"/latigo ayuda")
        session.pump(0.5)
        session.send(b"\r")
        ok = wait_until(session, lambda: "Látigo · ayuda" in session.text(), 6)
        check("tras /clear el comando /latigo sigue disponible", ok)
        write("config.json", {"enabled": False, "sound": False})
        wait_until(session, lambda: "látigo apagado" in session.text())
        session.send(b"/clear")
        session.pump(0.5)
        session.send(b"\r")
        session.pump(1.5)
        check("tras /clear un latigo apagado sigue apagado", "látigo apagado" in session.text() and "latigazos" not in band(session), band(session))

        # Al cerrar Claude Code, la presencia queda vencida enseguida para VS Code.
        session.send(b"\x03")
        session.pump(0.3)
        session.send(b"\x03")
        end = time.time() + 6
        while time.time() < end and read("presence.json").get("at") != 0:
            session.pump(0.2)
        check("al cerrar Claude Code, VS Code sabe enseguida que no hay sesion", read("presence.json").get("at") == 0, str(read("presence.json")))
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--claude", required=True)
    args = parser.parse_args()
    with ct.Sandbox():
        ct.clear_plugin_store()
        run(args.claude)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} pasan")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
