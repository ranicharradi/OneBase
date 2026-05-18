"""RecordSet — typed enumerable of refs into staged_records or unified_records."""

from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy.orm import Session

from app.models.enums import RecordStatus
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord

Kind = Literal["staged", "unified"]


@dataclass(frozen=True)
class RecordRef:
    id: int
    kind: Kind


@dataclass
class RecordSet:
    """One side of a comparison: a typed list of record references."""

    type_key: str
    refs: list[RecordRef] = field(default_factory=list)

    @classmethod
    def from_batch(cls, db: Session, batch_id: int) -> "RecordSet":
        from app.models.batch import ImportBatch

        batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
        type_key = batch.data_source.type
        rows = (
            db.query(StagedRecord.id)
            .filter(
                StagedRecord.import_batch_id == batch_id,
                StagedRecord.status == RecordStatus.ACTIVE,
            )
            .all()
        )
        return cls(type_key=type_key, refs=[RecordRef(id=r.id, kind="staged") for r in rows])

    @classmethod
    def from_source(cls, db: Session, source_id: int) -> "RecordSet":
        """All ACTIVE staged records currently belonging to a DataSource.

        Used by the matching pipeline so that a re-upload (which may produce
        a batch with zero linked rows when nothing changed) never silently
        empties the scope. The scope follows the source's live state, not a
        specific upload event.
        """
        from app.models.source import DataSource

        src = db.query(DataSource).filter(DataSource.id == source_id).one()
        rows = (
            db.query(StagedRecord.id)
            .filter(
                StagedRecord.data_source_id == source_id,
                StagedRecord.status == RecordStatus.ACTIVE,
            )
            .all()
        )
        return cls(type_key=src.type, refs=[RecordRef(id=r.id, kind="staged") for r in rows])

    @classmethod
    def from_unified(cls, db: Session, type_key: str) -> "RecordSet":
        rows = db.query(UnifiedRecord.id).filter(UnifiedRecord.type == type_key).all()
        return cls(type_key=type_key, refs=[RecordRef(id=r.id, kind="unified") for r in rows])

    @property
    def size(self) -> int:
        return len(self.refs)

    @property
    def is_empty(self) -> bool:
        return not self.refs

    @property
    def ids_by_kind(self) -> dict[Kind, list[int]]:
        out: dict[Kind, list[int]] = {"staged": [], "unified": []}
        for ref in self.refs:
            out[ref.kind].append(ref.id)
        return out
