import doorstop

from doorstop_server.config import Settings


def load_tree(settings: Settings) -> doorstop.Tree:
    """Build a fresh Tree from disk.

    Rebuilt on every request rather than cached: the user can hand-edit item
    files in VS Code between two server calls, and a cached tree would
    silently miss or clobber those edits. ``request_next_number=None`` is the
    ``--force`` equivalent the CLI uses to skip Doorstop's own numbering
    server -- safe here because this server is the only process ever
    mutating the project and every request is fully serialized.
    """
    return doorstop.build(
        cwd=settings.project_root,
        root=settings.project_root,
        request_next_number=None,
    )
