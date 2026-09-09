import doorstop
from fastapi import Request

from doorstop_server.config import Settings
from doorstop_server.doorstop_tree import load_tree


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_tree(request: Request) -> doorstop.Tree:
    return load_tree(get_settings(request))
