#!/usr/bin/env python3
"""Generate index.html and speckit-demo.gif from steps.yml.

Setup (once):  pip install pyyaml pillow playwright && playwright install chromium
Run:           python build.py [--html-only]
The page loads mermaid from a CDN, so the run needs internet access.
"""
import io
import sys
from html import escape
from pathlib import Path

import yaml
from PIL import Image

HERE = Path(__file__).parent
MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11.4.0/dist/mermaid.min.js"

CSS = """
body{margin:0;background:#e5e7eb;font-family:system-ui,sans-serif}
.frame{width:%(w)dpx;height:%(h)dpx;margin:16px auto;background:#fff;display:flex;flex-direction:column;overflow:hidden}
.head{padding:14px 24px;background:#111827;color:#fff;font-size:20px}
.head b{color:#93c5fd;font-family:monospace}
.top{flex:0 0 25%%;display:flex;align-items:center;justify-content:center;border-bottom:2px solid #e5e7eb;padding:8px}
.top .mermaid{width:100%%}
.top svg{max-width:100%%;height:auto}
.bottom{flex:1;padding:16px 28px;background:#f9fafb}
pre{margin:0;font:15px/1.3 Consolas,monospace;color:#374151}
.new{background:#bbf7d0;color:#14532d;font-weight:bold}
.mod{background:#fde68a;color:#78350f;font-weight:bold}
#ctl{display:none;width:%(w)dpx;margin:16px auto 0;align-items:center;gap:8px;font:14px system-ui}
#ctl input{flex:1}#ctl button{font-size:16px;padding:4px 10px;cursor:pointer}
.player #ctl{display:flex}.player .frame{display:none;margin-top:8px}.player .frame.on{display:flex}
.legend{float:right;font:13px system-ui;color:#6b7280}
"""


# Slider/play controls; skipped when the page is opened with ?capture (GIF screenshots)
PLAYER = """
function player(){
  const F=[...document.querySelectorAll('.frame')],sl=document.getElementById('sl'),
    play=document.getElementById('play');let i=0,t=null;
  document.body.classList.add('player');sl.max=F.length-1;
  function show(n){i=Math.max(0,Math.min(F.length-1,n));F.forEach((f,k)=>f.classList.toggle('on',k==i));
    sl.value=i;lbl.textContent=(i+1)+' / '+F.length}
  function stop(){clearTimeout(t);t=null;play.textContent='Play'}
  function go(){play.textContent='Pause';t=setTimeout(()=>{if(i<F.length-1){show(i+1);go()}else stop()},+F[i].dataset.ms)}
  play.onclick=()=>t?stop():(i==F.length-1&&show(0),go());
  prev.onclick=()=>{stop();show(i-1)};next.onclick=()=>{stop();show(i+1)};
  sl.oninput=()=>{stop();show(+sl.value)};
  onkeydown=e=>{if(e.key=='ArrowLeft')prev.click();else if(e.key=='ArrowRight')next.click();else if(e.key==' '){e.preventDefault();play.click()}};
  show(0);go();
}
"""


def tree_lines(paths, prev_paths, new, mod, root, collapsed=()):
    """Render paths as a box-drawing tree; new/mod files and new dirs get a highlight."""
    prev_dirs = {d for p in prev_paths for d in _parents(p)}
    nested = {}
    for p in sorted(paths):
        node = nested
        for part in p.split("/"):
            node = node.setdefault(part, {})

    out = [escape(root)]

    def walk(node, prefix, path):
        items = sorted(node.items(), key=lambda kv: (not kv[1], kv[0]))  # dirs first
        for i, (name, child) in enumerate(items):
            full = f"{path}/{name}" if path else name
            last = i == len(items) - 1
            label = escape(name + ("/" if child else ""))
            if child and full not in prev_dirs and full not in {*prev_paths}:
                label = f'<span class="new">{label}</span>'
            elif full in new:
                label = f'<span class="new">{label}</span>'
            elif full in mod:
                label = f'<span class="mod">{label}</span>'
            hide = child and full in collapsed
            out.append(f"{prefix}{'└── ' if last else '├── '}{label}{' …' if hide else ''}")
            if not hide:
                walk(child, prefix + ("    " if last else "│   "), full)

    walk(nested, "", "")
    return "\n".join(out)


def _parents(p):
    parts = p.split("/")[:-1]
    return ["/".join(parts[: i + 1]) for i in range(len(parts))]


def mermaid_src(cfg, active, visited):
    ids = list(cfg["states"])
    lines = [
        "stateDiagram-v2",
        "  direction LR",
        "  classDef active fill:#2563eb,color:#fff,stroke:#1e3a8a,stroke-width:3px",
        "  classDef done fill:#dcfce7,color:#14532d,stroke:#16a34a",
        f"  [*] --> {ids[0]}",
    ]
    lines += [f"  {i} : {label}" for i, label in cfg["states"].items()]
    lines += ["  " + t.replace("->", "-->") for t in cfg["transitions"]]
    done = [s for s in visited if s != active]
    if done:
        lines.append(f"  class {','.join(done)} done")
    lines.append(f"  class {active} active")
    return "\n".join(lines)


def expand(cfg):
    """Repeat the step cycle once per loop, substituting <placeholders>."""
    def sub(v, vars):
        if isinstance(v, str):
            for k, x in vars.items():
                v = v.replace("<%s>" % k, x)
            return v
        return [sub(i, vars) for i in v] if isinstance(v, list) else v

    out = []
    loops = cfg.get("loops", [{}])
    for n, vars in enumerate(loops, 1):
        collapsed = {sub(c, v) for v in loops[: n - 1] for c in cfg.get("collapse_previous", [])}
        for s in cfg["steps"]:
            if (n > 1 and s.get("once")) or n not in s.get("only", [n]):
                continue
            out.append({**{k: sub(v, vars) for k, v in s.items()}, "loop": n, "collapsed": collapsed})
    return out


def build_html(cfg):
    files = list(cfg.get("initial", []))
    visited, frames = [], []
    steps = expand(cfg)
    loops = len(cfg.get("loops", [1]))
    for n, step in enumerate(steps, 1):
        if step["loop"] != (steps[n - 2]["loop"] if n > 1 else 1):
            visited = []  # new loop: reset progress colouring
        prev = set(files)
        add = step.get("add", [])
        mod = set(step.get("modify", []))
        files += [f for f in add if f not in files]
        visited.append(step["active"])
        cmd = escape(cfg["states"][step["active"]])
        frames.append(
            f'<section class="frame" data-ms="{step.get("duration", cfg.get("duration", 2000))}">'
            f'<div class="head">Loop {step["loop"]}/{loops} &middot; Step {n}/{len(steps)}: <b>{cmd}</b> &mdash; {escape(step.get("caption", ""))}</div>'
            f'<div class="top"><pre class="mermaid">{escape(mermaid_src(cfg, step["active"], visited))}</pre></div>'
            f'<div class="bottom"><span class="legend"><span class="new">new</span> '
            f'<span class="mod">changed</span></span>'
            f'<pre>{tree_lines(files, prev, set(add), mod, cfg.get("root", "project/"), step["collapsed"])}</pre></div>'
            "</section>"
        )
    css = CSS % {"w": cfg.get("width", 1000), "h": cfg.get("height", 820)}
    return (
        f'<!doctype html><meta charset="utf-8"><title>{escape(cfg.get("title", "demo"))}</title>'
        f'<style>{css}</style><div id="ctl"><button id="prev">&#9664;</button><button id="play"></button>'
        '<button id="next">&#9654;</button><input id="sl" type="range" min="0" value="0"><span id="lbl"></span></div>'
        f"{''.join(frames)}"
        f'<script src="{MERMAID}"></script>'
        '<script>mermaid.initialize({startOnLoad:false,theme:"neutral",themeVariables:{fontSize:"16px"}});'
        "mermaid.run().then(()=>{window.ready=true;if(!location.search.includes('capture'))player()});"
        + PLAYER + "</script>"
    )


def build_gif(cfg, html_path, gif_path):
    from playwright.sync_api import sync_playwright

    images, durations = [], []
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": cfg.get("width", 1000) + 40, "height": cfg.get("height", 820) + 40})
        page.goto(html_path.as_uri() + "?capture")
        page.wait_for_function("window.ready === true", timeout=30000)
        for f in page.query_selector_all(".frame"):
            images.append(Image.open(io.BytesIO(f.screenshot())).convert("RGB"))
            durations.append(int(f.get_attribute("data-ms")))
        b.close()
    images[0].save(
        gif_path, save_all=True, append_images=images[1:], duration=durations, loop=0, optimize=True
    )


if __name__ == "__main__":
    cfg = yaml.safe_load((HERE / "steps.yml").read_text(encoding="utf-8"))
    html_path = HERE / "index.html"
    html_path.write_text(build_html(cfg), encoding="utf-8")
    print("wrote", html_path)
    if "--html-only" not in sys.argv:
        build_gif(cfg, html_path, HERE / "speckit-demo.gif")
        print("wrote", HERE / "speckit-demo.gif")
