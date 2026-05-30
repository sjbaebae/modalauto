"""Matmul problem scorer and verification helpers."""

from .matmul import (
    generate_baseline_4x4,
    generate_baseline_16x16,
    generate_tiled_16x16,
    score_1x1,
    score_4x4,
    score_16x16,
)

__all__ = [
    "score_1x1",
    "score_4x4",
    "score_16x16",
    "generate_baseline_4x4",
    "generate_baseline_16x16",
    "generate_tiled_16x16",
]

