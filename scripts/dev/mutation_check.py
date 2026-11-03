"""Mutación manual de controles críticos clínicos (Fase 4): cada mutación DEBE hacer fallar
algún test; si una "sobrevive", el test que debería protegerla no sirve.

Uso (desde la raíz, con Postgres y el venv activos):
    python scripts/dev/mutation_check.py                    # todas
    python scripts/dev/mutation_check.py "checklist vacío"  # una
Restaura siempre el archivo original (también si el test se interrumpe).
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "backend"
INT = "tests/integration/"
MUTATIONS = [
    ("checklist vacío", "app/domain/clinical_rules.py",
     "    missing: list[MissingItem] = []\n    if not (data.subjective",
     "    missing: list[MissingItem] = []\n    return missing\n    if not (data.subjective",
     [INT + "test_encounters_api.py"]),
    ("firmado editable", "app/domain/clinical_rules.py",
     "    return status == EncounterStatus.DRAFT\n",
     "    return True\n",
     [INT + "test_encounters_api.py"]),
    ("hash siempre válido", "app/domain/clinical_rules.py",
     "    return compute_content_hash(content) == expected\n",
     "    return True\n",
     [INT + "test_encounters_api.py"]),
    ("lectura sin relación", "app/services/clinical_access.py",
     'await self.deny(actor, patient.id, "sin relación terapéutica (clínico)", context)',
     "return patient",
     [INT + "test_encounters_api.py", INT + "test_clinical_history_api.py", INT + "test_attachments_api.py"]),
    ("escritura sin relación", "app/services/clinical_access.py",
     'await self.deny(actor, patient.id, "sin relación terapéutica (escritura)", context)',
     "pass",
     [INT + "test_encounters_api.py", INT + "test_clinical_history_api.py"]),
    ("firma sin auditar", "app/services/encounters.py",
     "            AuditAction.SIGN, actor, encounter.patient_id, RESOURCE_ENCOUNTER, encounter.id, context\n",
     "            AuditAction.READ, actor, encounter.patient_id, RESOURCE_ENCOUNTER, encounter.id, context\n",
     [INT + "test_encounters_api.py"]),
    ("firma de consentimiento sin relación", "app/services/consents.py",
     "        await self._access.patient_for_read(actor, consent.patient_id, context)\n",
     "",
     [INT + "test_consents_api.py"]),
    ("consentimiento verbal para todo", "app/services/consents.py",
     "VERBAL_ALLOWED = frozenset({ConsentType.GENERAL_CARE, ConsentType.PHOTO_USE})",
     "VERBAL_ALLOWED = frozenset(ConsentType)",
     [INT + "test_consents_api.py"]),
    ("sin verificar bytes reales", "app/domain/clinical_rules.py",
     "    if mime == \"image/webp\":",
     "    return True\n    if mime == \"image/webp\":",
     [INT + "test_attachments_api.py"]),
    ("trigger de encuentros desactivado", "alembic/versions/0005_clinical_core.py",
     '"FOR EACH ROW EXECUTE FUNCTION encounters_guard()"',
     '"FOR EACH ROW WHEN (false) EXECUTE FUNCTION encounters_guard()"',
     [INT + "test_encounters_api.py"]),
]

only = sys.argv[1:]
survivors = []
for name, rel, old, new, tests in MUTATIONS:
    if only and name not in only:
        continue
    path = ROOT / rel
    original = path.read_text()
    assert old in original, f"ancla no encontrada: {name}"
    backup = path.with_suffix(path.suffix + ".orig")
    shutil.copy(path, backup)
    try:
        path.write_text(original.replace(old, new, 1))
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", "--show-capture=no", "--tb=no", *tests],
            cwd=ROOT, capture_output=True, text=True,
        )
        killed = result.returncode != 0
        tail = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else result.stderr[-200:]
        print(f"{'MATADA ' if killed else 'SOBREVIVE'} | {name} | {tail}", flush=True)
        if not killed:
            survivors.append(name)
    finally:
        path.write_text(original)
        backup.unlink()
print("SOBREVIVIENTES:", survivors or "ninguno")
