"""Regenerate the USE/REQ Doorstop documents from every feature's spec.md.

Parses ``specs/NNN-*/spec.md`` (GitHub Spec-Kit template) for:
  - ``### User Story <n> - <title> (Priority: PX)`` sections -> USE items
  - ``**FR-<nnn>**: <text>`` bullets under Requirements           -> REQ items

USE items get level ``<feature>.<storyIndex>`` (e.g. feature 015, story 3 -> "15.3").
REQ items get level ``<feature>.<frIndex>`` and link to every USE item of the
same feature, since functional requirements in the source spec are not
individually tagged to one user story.

Idempotent: deletes previously generated USE-*.yml / REQ-*.yml item files and
recreates them from the current spec.md content, so UID assignment stays
stable across reruns as long as feature/story/FR ordering doesn't change.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import doorstop

REPO_ROOT = Path(__file__).resolve().parents[2]
SPECS_DIR = REPO_ROOT / "specs"
SUMMARY_DIR = Path(__file__).resolve().parent
USE_DIR = SUMMARY_DIR / "USE"
REQ_DIR = SUMMARY_DIR / "REQ"

FEATURE_RE = re.compile(r"^(\d+)-")
STORY_HEADING_RE = re.compile(
    r"^### User Story (\d+) - (.+?) \(Priority: (P\d+)\)\s*$", re.MULTILINE
)
FR_RE = re.compile(r"^-\s*\*\*FR-(\d+)\*\*:\s*(.+)$", re.MULTILINE)
HEADING_RE = re.compile(r"^#{2,3} ", re.MULTILINE)


@dataclass
class UserStory:
    index: int
    title: str
    priority: str
    narrative: str


@dataclass
class Requirement:
    index: int
    text: str


@dataclass
class Feature:
    number: int
    slug: str
    title: str
    stories: list[UserStory] = field(default_factory=list)
    requirements: list[Requirement] = field(default_factory=list)


def _section_body(full_text: str, heading_start: int, heading_end: int) -> str:
    """Text between the end of one heading line and the start of the next ## / ### heading."""
    next_heading = HEADING_RE.search(full_text, heading_end)
    stop = next_heading.start() if next_heading else len(full_text)
    return full_text[heading_end:stop].strip()


def _clean_narrative(body: str) -> str:
    """Keep the story narrative and its 'Why this priority' line; drop test/acceptance detail."""
    lines: list[str] = []
    for block in body.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        if block.startswith("**Independent Test**") or block.startswith("**Acceptance Scenarios**"):
            break
        lines.append(block)
    return "\n\n".join(lines).strip()


def parse_feature(spec_path: Path) -> Feature:
    folder = spec_path.parent.name
    match = FEATURE_RE.match(folder)
    if not match:
        raise ValueError(f"Feature folder does not start with digits: {folder}")
    number = int(match.group(1))

    text = spec_path.read_text(encoding="utf-8")

    title_match = re.search(r"^# Feature Specification:\s*(.+)$", text, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else folder

    feature = Feature(number=number, slug=folder, title=title)

    for m in STORY_HEADING_RE.finditer(text):
        story_index = int(m.group(1))
        story_title = m.group(2).strip()
        priority = m.group(3).strip()
        narrative = _clean_narrative(_section_body(text, m.start(), m.end()))
        feature.stories.append(UserStory(story_index, story_title, priority, narrative))
    feature.stories.sort(key=lambda s: s.index)

    for m in FR_RE.finditer(text):
        fr_index = int(m.group(1))
        fr_text = m.group(2).strip()
        feature.requirements.append(Requirement(fr_index, fr_text))
    feature.requirements.sort(key=lambda r: r.index)

    return feature


def load_features() -> list[Feature]:
    features = []
    for spec_path in sorted(SPECS_DIR.glob("*/spec.md")):
        if spec_path.parent.name == "000-summary":
            continue
        features.append(parse_feature(spec_path))
    features.sort(key=lambda f: f.number)
    return features


def _clear_items(document_dir: Path, prefix: str) -> None:
    if not document_dir.exists():
        return
    for item_file in document_dir.glob(f"{prefix}-*.yml"):
        item_file.unlink()


def _ensure_documents(tree: doorstop.Tree) -> tuple[doorstop.Document, doorstop.Document]:
    try:
        use_doc = tree.find_document("USE")
    except doorstop.DoorstopError:
        use_doc = tree.create_document(str(USE_DIR), "USE", sep="-", digits=3, itemformat="yaml")

    try:
        req_doc = tree.find_document("REQ")
    except doorstop.DoorstopError:
        req_doc = tree.create_document(
            str(REQ_DIR), "REQ", sep="-", digits=3, itemformat="yaml", parent="USE"
        )

    return use_doc, req_doc


def build() -> None:
    features = load_features()

    # Scoped to specs/000-summary so the whole-repo Doorstop tree (e.g.
    # testdata/regression's unrelated fixture documents) never collides with
    # this tree's root document.
    tree = doorstop.build(cwd=str(SUMMARY_DIR), root=str(SUMMARY_DIR), request_next_number=None)
    use_doc, req_doc = _ensure_documents(tree)

    _clear_items(USE_DIR, "USE")
    _clear_items(REQ_DIR, "REQ")

    # Reload so the documents forget the items we just deleted from disk.
    tree = doorstop.build(cwd=str(SUMMARY_DIR), root=str(SUMMARY_DIR), request_next_number=None)
    use_doc = tree.find_document("USE")
    req_doc = tree.find_document("REQ")

    use_count = 0
    req_count = 0

    for feat in features:
        feature_use_items = []
        for story in feat.stories:
            level = f"{feat.number}.{story.index}"
            item = use_doc.add_item(level=level)
            item.header = f"{story.title} (Priority: {story.priority})"
            item.text = story.narrative
            feature_use_items.append(item)
            use_count += 1

        for req in feat.requirements:
            level = f"{feat.number}.{req.index}"
            item = req_doc.add_item(level=level)
            item.text = req.text
            for use_item in feature_use_items:
                item.link(str(use_item.uid))
            req_count += 1

    print(f"Generated {use_count} USE items and {req_count} REQ items from {len(features)} features.")


if __name__ == "__main__":
    build()
