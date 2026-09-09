from typing import Iterator, Optional

from doorstop.core.item import Item
from doorstop.core.tree import Tree
from fastapi import APIRouter, Depends

from doorstop_server.deps import get_tree
from doorstop_server.errors import DoorstopApiError
from doorstop_server.schemas import ReviewClearRequest

router = APIRouter()


def _iter_items(tree: Tree, scope: str, target: Optional[str]) -> Iterator[Item]:
    """Resolve {scope, target} to items, mirroring doorstop's own CLI disambiguation."""
    if scope == "all":
        for document in tree:
            yield from document
        return
    if not target:
        raise DoorstopApiError(422, "TARGET_REQUIRED", "target is required unless scope is 'all'.")
    if scope == "document":
        document = tree.find_document(target)
        yield from document
        return
    yield tree.find_item(target)


@router.post("/review", status_code=204)
async def review_items(body: ReviewClearRequest, tree=Depends(get_tree)) -> None:
    for item in _iter_items(tree, body.scope, body.target):
        item.review()


@router.post("/clear", status_code=204)
async def clear_items(body: ReviewClearRequest, tree=Depends(get_tree)) -> None:
    if body.parents:
        for parent_uid in body.parents:
            tree.find_item(parent_uid)
    for item in _iter_items(tree, body.scope, body.target):
        item.clear(parents=body.parents)
