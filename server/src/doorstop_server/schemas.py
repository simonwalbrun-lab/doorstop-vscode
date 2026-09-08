from typing import List, Literal, Optional

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"]
    projectRoot: str


class CreateDocumentRequest(BaseModel):
    prefix: str
    path: str
    parentPrefix: Optional[str] = None
    itemFormat: Optional[Literal["yaml", "markdown"]] = None
    digits: Optional[int] = None
    separator: Optional[str] = None


class DocumentResponse(BaseModel):
    prefix: str
    path: str


class AddItemRequest(BaseModel):
    level: Optional[str] = None


class ItemResponse(BaseModel):
    uid: str
    path: str
    level: str


class ReviewClearRequest(BaseModel):
    scope: Literal["item", "document", "all"]
    target: Optional[str] = None
    parents: Optional[List[str]] = None


class LinkRequest(BaseModel):
    parentUid: str


class LinkResponse(BaseModel):
    child: str
    parent: str


class ReorderRequest(BaseModel):
    mode: Literal["auto", "manual"]


class ReorderResponse(BaseModel):
    prefix: str
    mode: Literal["auto", "manual"]


class ReorderIndexResponse(BaseModel):
    prefix: str
    indexPath: str


class ImportRequest(BaseModel):
    sourcePath: str


class ExportRequest(BaseModel):
    format: Literal["yaml", "csv", "tsv", "xlsx"]
    destinationPath: str


class ExportResponse(BaseModel):
    path: str


class PublishRequest(BaseModel):
    format: Literal["markdown", "html", "latex"]
    destinationPath: str


class PublishResponse(BaseModel):
    path: str
