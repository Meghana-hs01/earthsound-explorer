"""Request models. Validation errors return HTTP 422."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class AnalyzeRequest(BaseModel):
    max_per_region: int = Field(default=40, ge=5, le=60)
    spacing_deg: float = Field(default=1.0, ge=0.25, le=5.0)


class ScoreRequest(BaseModel):
    candidate_id: str
    target: Literal["moon", "mars"]
    region: str
    weights: Optional[dict[str, float]] = None


class CompareRequest(BaseModel):
    earth_id: str
    moon_region: str
    mars_region: str


class ExplainRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    candidate_id: Optional[str] = None
    target: Optional[Literal["moon", "mars"]] = None
    region: Optional[str] = None
    weights: Optional[dict[str, float]] = None

    @field_validator("question")
    @classmethod
    def strip_question(cls, v: str) -> str:
        return v.strip()
