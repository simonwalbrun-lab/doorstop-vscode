import argparse

import uvicorn

from doorstop_server.app import create_app
from doorstop_server.config import Settings


def parse_args(argv=None) -> Settings:
    parser = argparse.ArgumentParser(prog="doorstop-vscode-server")
    parser.add_argument("--project", required=True, help="path to the root of the Doorstop project")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7867)
    args = parser.parse_args(argv)
    return Settings(project_root=args.project, host=args.host, port=args.port)


def main(argv=None) -> None:
    settings = parse_args(argv)
    app = create_app(settings)
    # workers=1, no reload: exactly one process, one event loop -- required for
    # the request-serialization guarantee in lock.py to hold.
    uvicorn.run(app, host=settings.host, port=settings.port, workers=1, reload=False)


if __name__ == "__main__":
    main()
