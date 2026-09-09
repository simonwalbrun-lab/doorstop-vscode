from pathlib import Path

from doorstop.core import exporter, importer, publisher
from fastapi import APIRouter, Depends

from doorstop_server.deps import get_tree
from doorstop_server.errors import DoorstopApiError
from doorstop_server.schemas import (
    AddItemRequest,
    CreateDocumentRequest,
    DocumentResponse,
    ExportRequest,
    ExportResponse,
    ImportRequest,
    ItemResponse,
    PublishRequest,
    PublishResponse,
    ReorderIndexResponse,
    ReorderRequest,
    ReorderResponse,
)

router = APIRouter(prefix="/documents")

_EXPORT_EXTENSIONS = {"yaml": ".yml", "csv": ".csv", "tsv": ".tsv", "xlsx": ".xlsx"}
_PUBLISH_EXTENSIONS = {"markdown": ".md", "html": ".html", "latex": ".tex"}


@router.post("", response_model=DocumentResponse)
async def create_document(body: CreateDocumentRequest, tree=Depends(get_tree)) -> DocumentResponse:
    document = tree.create_document(
        body.path,
        body.prefix,
        sep=body.separator,
        digits=body.digits,
        parent=body.parentPrefix,
        itemformat=body.itemFormat,
    )
    return DocumentResponse(prefix=str(document.prefix), path=document.path)


@router.post("/{prefix}/items", response_model=ItemResponse)
async def add_item(prefix: str, body: AddItemRequest, tree=Depends(get_tree)) -> ItemResponse:
    document = tree.find_document(prefix)
    item = document.add_item(level=body.level)
    return ItemResponse(uid=str(item.uid), path=item.path, level=str(item.level))


@router.post("/{prefix}/reorder/index", response_model=ReorderIndexResponse)
async def ensure_reorder_index(prefix: str, tree=Depends(get_tree)) -> ReorderIndexResponse:
    document = tree.find_document(prefix)
    if not document.index:
        document.index = True
    return ReorderIndexResponse(prefix=prefix, indexPath=document.index)


@router.delete("/{prefix}/reorder/index", status_code=204)
async def discard_reorder_index(prefix: str, tree=Depends(get_tree)) -> None:
    document = tree.find_document(prefix)
    del document.index


@router.post("/{prefix}/reorder", response_model=ReorderResponse)
async def reorder_document(prefix: str, body: ReorderRequest, tree=Depends(get_tree)) -> ReorderResponse:
    document = tree.find_document(prefix)
    if body.mode == "auto":
        document.reorder(manual=False)
    else:
        if not document.index:
            raise DoorstopApiError(
                409,
                "NO_REORDER_INDEX",
                "No index file to reorder from -- call POST /documents/{prefix}/reorder/index first.",
            )
        document.reorder(manual=True, automatic=False)
    return ReorderResponse(prefix=prefix, mode=body.mode)


@router.post("/{prefix}/import", response_model=DocumentResponse)
async def import_into_document(prefix: str, body: ImportRequest, tree=Depends(get_tree)) -> DocumentResponse:
    document = tree.find_document(prefix)
    ext = Path(body.sourcePath).suffix
    importer.import_file(body.sourcePath, document, ext)
    return DocumentResponse(prefix=str(document.prefix), path=document.path)


@router.post("/{prefix}/export", response_model=ExportResponse)
async def export_document(prefix: str, body: ExportRequest, tree=Depends(get_tree)) -> ExportResponse:
    document = tree.find_document(prefix)
    ext = _EXPORT_EXTENSIONS[body.format]
    path = exporter.export(document, body.destinationPath, ext=ext)
    return ExportResponse(path=path or body.destinationPath)


@router.post("/{prefix}/publish", response_model=PublishResponse)
async def publish_document(prefix: str, body: PublishRequest, tree=Depends(get_tree)) -> PublishResponse:
    document = tree.find_document(prefix)
    ext = _PUBLISH_EXTENSIONS[body.format]
    path = publisher.publish(document, body.destinationPath, ext=ext)
    return PublishResponse(path=path or body.destinationPath)
