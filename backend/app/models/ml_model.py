"""MLModelVersion ORM model — tracks trained ML model artifacts and metadata."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, func

from app.models.base import Base


class MLModelVersion(Base):
    __tablename__ = "ml_model_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_type = Column(String(50), nullable=False)      # "scorer" or "blocker"
    filename = Column(String(255), nullable=False)        # path to .lgbm file
    feature_names = Column(JSON, nullable=False)          # ordered feature list
    metrics = Column(JSON, nullable=False)                # {precision, recall, f1, auc, threshold}
    feature_importances = Column(JSON, nullable=True)     # {feature: importance}
    sample_count = Column(Integer, nullable=False)        # training examples used
    is_active = Column(Boolean, default=False)            # currently used by pipeline
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
