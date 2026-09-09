from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    project_root: str
    host: str
    port: int
