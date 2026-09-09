from fastapi import APIRouter, Depends, Response

from doorstop_server.deps import get_tree
from doorstop_server.schemas import LinkRequest, LinkResponse

router = APIRouter(prefix="/items")


@router.post("/{child_uid}/links", response_model=LinkResponse)
async def link_item(child_uid: str, body: LinkRequest, tree=Depends(get_tree)) -> LinkResponse:
    child, parent = tree.link_items(child_uid, body.parentUid)
    return LinkResponse(child=str(child.uid), parent=str(parent.uid))


@router.delete("/{child_uid}/links/{parent_uid}", status_code=204)
async def unlink_item(child_uid: str, parent_uid: str, tree=Depends(get_tree)) -> Response:
    tree.unlink_items(child_uid, parent_uid)
    return Response(status_code=204)
