"""MLModelVersion ORM model — tracks trained ML model artifacts and metadata.

Each model is scoped to one RecordType (the type whose signal vector it was
trained against). Loading a model for the wrong type would produce garbage
predictions, so the active-model lookup must always filter on record_type.
"""

from sqlalchemy import JSON, Boolean, Column, DateTime, Integer, String, func

from app.models.base import Base


class MLModelVersion(Base):
    __tablename__ = "ml_model_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_type = Column(String(50), nullable=False)  # "scorer" or "blocker"
    record_type = Column(String(50), nullable=False)  # RecordType.key
    filename = Column(String(255), nullable=False)  # path to .lgbm file
    feature_names = Column(JSON, nullable=False)  # ordered feature list
    metrics = Column(JSON, nullable=False)  # {precision, recall, f1, auc, threshold}
    feature_importances = Column(JSON, nullable=True)  # {feature: importance}
    sample_count = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=False)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
