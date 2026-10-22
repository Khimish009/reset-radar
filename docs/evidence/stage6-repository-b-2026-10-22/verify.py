"""Offline integrity and semantic comparison of saved synthetic B evidence."""
import hashlib
import json
from pathlib import Path

folder = Path(__file__).resolve().parent
root = folder.parents[2]
before = json.loads((folder / "before.json").read_text())
after = json.loads((folder / "after.json").read_text())
context = json.loads((folder / "context.json").read_text())
assert len(before["scenarios"]) == len(after["scenarios"]) == 21
compared = 0
for left, right in zip(before["scenarios"], after["scenarios"]):
    assert left["scenario"] == right["scenario"]
    if left["scenario"] == "metrics-calibration":
        continue
    assert left["durableStateSha256"] == right["durableStateSha256"], left["scenario"]
    for sample in (left, right):
        metrics = sample["metrics"]
        assert metrics["metadata"]["unavailableFirstResults"] == 4
        assert not metrics["executionOutcomes"]["failed"]
        assert metrics["sqlStatements"]["total"] == (
            metrics["sqlStatements"]["batchStatements"]
            + sum(metrics["bindingCalls"][method] for method in ("all", "first", "run", "raw"))
        )
    assert right["metrics"]["sqlStatements"]["maxStatementBindCount"] <= 100
    assert right["metrics"]["sqlStatements"]["maxStatementSqlBytes"] <= 100_000
    assert right["metrics"]["sqlStatements"]["maxStatementEstimatedInputBytes"] <= 2_000_000
    compared += 1
for name, value in context["hashes"].items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == value["afterSha256"], name
print(f"PASS: {compared} matching durable state digests; saved metrics/coverage/bounds and source hashes verified offline.")
