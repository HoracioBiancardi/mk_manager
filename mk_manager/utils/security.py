"""Path-sandboxing helpers shared by anything that writes/reads files based on
user-supplied path fragments (folder names, asset names, etc.).

This mirrors the pattern already proven in
`mk_manager.repositories.markdown` (`_sanitize_folder` / `_is_contained` /
`_ensure_within_root`): reject obvious traversal segments in the raw string
first, then re-verify containment against the *resolved* filesystem path
before touching disk. Both checks matter — the textual check catches the
common case cheaply, while the resolved-path check is what actually defeats
tricks like symlinks or unexpected `..` segments that survive naive string
filtering.
"""
from __future__ import annotations

from pathlib import Path


class PathTraversalError(ValueError):
    """Raised when a user-supplied path would escape an allowed root directory."""


def sanitize_relative_path(value: str, *, label: str = "path") -> str:
    """Strip surrounding slashes and reject absolute paths / '..' segments.

    This is a first line of defense against obviously malicious input before
    any `Path` is built from it. Callers must still call `ensure_within_root`
    (or `is_contained`) on the final resolved path — this function never
    touches the filesystem.
    """
    cleaned = (value or "").strip("/")
    if not cleaned:
        return ""
    if Path(cleaned).is_absolute():
        raise PathTraversalError(f"Invalid {label}: '{value}'")
    if ".." in Path(cleaned).parts:
        raise PathTraversalError(f"Invalid {label}: '{value}'")
    return cleaned


def is_contained(root: Path, path: Path) -> bool:
    """Return True if `path`, once resolved, is `root` or lives under it."""
    root_resolved = root.resolve()
    resolved = path.resolve()
    return resolved == root_resolved or root_resolved in resolved.parents


def ensure_within_root(root: Path, path: Path, *, label: str = "path") -> Path:
    """Raise PathTraversalError unless `path` resolves to somewhere under `root`."""
    if not is_contained(root, path):
        raise PathTraversalError(f"{label} '{path}' escapes the allowed directory.")
    return path
