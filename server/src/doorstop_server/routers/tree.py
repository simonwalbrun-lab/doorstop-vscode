from fastapi import APIRouter, Depends

from doorstop_server.deps import get_tree
from doorstop_server.schemas import DocumentNode, ItemNode, TreeResponse

router = APIRouter()


@router.get("/tree", response_model=TreeResponse)
async def get_tree_structure(tree=Depends(get_tree)) -> TreeResponse:
    tree.load()
    documents = [
        DocumentNode(
            prefix=str(document.prefix),
            markerPath=document.config,
            parentPrefix=document.parent or None,
            items=[
                ItemNode(
                    uid=str(item.uid),
                    path=item.path,
                    level=str(item.level),
                    header=str(item.header) if item.header else None,
                    text=str(item.text) if item.text else None,
                )
                for item in document
            ],
        )
        for document in tree
    ]
    return TreeResponse(documents=documents)
