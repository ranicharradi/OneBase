from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.models.base import Base, json_type


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(50), nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(Integer, nullable=True)
    details = Column(json_type(), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
