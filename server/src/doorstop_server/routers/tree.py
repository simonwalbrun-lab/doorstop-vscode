from doorstop.common import DoorstopError
from fastapi import APIRouter, Depends

from doorstop_server.deps import get_tree
from doorstop_server.schemas import DocumentNode, ItemNode, LinkInfo, TreeResponse

router = APIRouter()


def _item_links(item, tree) -> list[LinkInfo]:
    links = []
    for uid in item.links:
        try:
            parent = tree.find_item(uid)
            suspect = uid.stamp != parent.stamp()
        except DoorstopError:
            # Dangling/renamed parent UID - treat as suspect rather than failing the request.
            suspect = True
        links.append(LinkInfo(uid=str(uid), suspect=suspect))
    return links


@router.get("/tree", response_model=TreeResponse)
async def get_tree_structure(tree=Depends(get_tree)) -> TreeResponse:
    tree.load()
    documents = [
        DocumentNode(
            prefix=str(document.prefix),
            markerPath=document.config,
            parentPrefix=document.parent or None,
            digits=document.digits,
            separator=document.sep,
            itemFormat=str(document.itemformat) if document.itemformat else None,
            items=[
                ItemNode(
                    uid=str(item.uid),
                    path=item.path,
                    level=str(item.level),
                    header=str(item.header) if item.header else None,
                    text=str(item.text) if item.text else None,
                    active=item.active,
                    normative=item.normative,
                    derived=item.derived,
                    reviewed=item.reviewed,
                    cleared=item.cleared,
                    links=_item_links(item, tree),
                )
                for item in document
            ],
        )
        for document in tree
    ]
    return TreeResponse(documents=documents)
