#!/usr/bin/env python3
"""
OpenFront Map Tester
Clones OpenFrontIO, registers your map, generates it, and starts a local dev server.
"""

import os
import sys
import json
import shutil
import subprocess
import platform
import webbrowser
import time
import re
from pathlib import Path

REPO_URL = "https://github.com/OpenFrontIO/OpenFrontIO.git"
REPO_DIR = Path(__file__).parent / "OpenFrontIO"
MAP_DIR = Path(__file__).parent

# ── helpers ──────────────────────────────────────────────────────────────────

def step(msg):
    print(f"\n\033[1;34m▶ {msg}\033[0m")

def ok(msg):
    print(f"  \033[1;32m✓ {msg}\033[0m")

def fail(msg):
    print(f"\n\033[1;31m✗ {msg}\033[0m")
    input("\nPress Enter to exit...")
    sys.exit(1)

def run(cmd, cwd=None, capture=False):
    result = subprocess.run(
        cmd, cwd=cwd, shell=isinstance(cmd, str),
        capture_output=capture, text=True
    )
    if result.returncode != 0:
        fail(f"Command failed: {cmd}\n{result.stderr or ''}")
    return result

def check_tool(name, install_hint):
    if shutil.which(name) is None:
        fail(f"'{name}' not found.\n  Install it: {install_hint}")
    ok(f"{name} found")

# ── detect map name from info.json ───────────────────────────────────────────

def get_map_info():
    info_path = MAP_DIR / "info.json"
    if not info_path.exists():
        fail("info.json not found next to setup.py")
    with open(info_path) as f:
        data = json.load(f)
    raw_name = data.get("name", "")
    if not raw_name:
        fail("info.json must have a 'name' field")

    # If name is generic, ask the user
    if raw_name.lower() in ("custom_map", "custom map", "map", ""):
        print("\033[1;33m  Your info.json has a generic map name: '{}'\033[0m".format(raw_name))
        raw_name = input("  Enter a name for your map (e.g. 'My Island'): ").strip()
        if not raw_name:
            fail("Map name cannot be empty")

    # folder name = lowercase, no spaces
    folder_name = raw_name.lower().replace(" ", "").replace("_", "")
    # display name = title case
    display_name = raw_name.replace("_", " ").title()
    return folder_name, display_name, data

# ── patch Game.ts ─────────────────────────────────────────────────────────────

def patch_game_ts(folder_name, display_name, repo=None):
    game_ts = (repo or REPO_DIR) / "src" / "core" / "game" / "Game.ts"
    content = game_ts.read_text()

    enum_key = "".join(w.title() for w in folder_name.replace("_", " ").split())
    enum_entry = f'  {enum_key} = "{display_name}",'

    # Check already registered
    if f'= "{display_name}"' in content:
        ok(f"Game.ts already has {display_name}")
        return enum_key

    # Add to enum — insert before closing brace of GameMapType enum
    content = re.sub(
        r'(}\s*\nexport type GameMapName)',
        f'  {enum_entry}\n}}\nexport type GameMapName',
        content,
        count=1
    )

    # Add to regional category — append before closing bracket of regional array
    content = re.sub(
        r'(  \],\s*\n  fantasy:)',
        f'    GameMapType.{enum_key},\n  ],\n  fantasy:',
        content,
        count=1
    )

    game_ts.write_text(content)
    ok(f"Game.ts patched with {enum_key}")
    return enum_key

# ── patch en.json ─────────────────────────────────────────────────────────────

def patch_en_json(folder_name, display_name, repo=None):
    en_json = (repo or REPO_DIR) / "resources" / "lang" / "en.json"
    content = en_json.read_text()

    key = folder_name
    entry = f'"{key}": "{display_name}"'

    if entry in content:
        ok("en.json already has map entry")
        return

    # Find the last map entry and append after it
    content = re.sub(
        r'("[\w]+": "[\w ]+")(\s*\n\s*\})',
        f'\\1,\n    {entry}\\2',
        content,
        count=1,
        flags=re.MULTILINE
    )
    # If the last entry already has a comma, just append
    if entry not in content:
        content = re.sub(
            r'("caucasus"[^,\n]*)',
            f'\\1,\n    {entry}',
            content
        )
    en_json.write_text(content)
    ok("en.json patched")

# ── patch main.go ─────────────────────────────────────────────────────────────

def patch_main_go(folder_name, repo=None):
    main_go = (repo or REPO_DIR) / "map-generator" / "main.go"
    content = main_go.read_text()

    entry = f'\t{{Name: "{folder_name}"}},'

    if f'Name: "{folder_name}"' in content:
        ok("main.go already has map entry")
        return

    content = re.sub(
        r'(\{Name: "caucasus"\},)',
        f'{{Name: "caucasus"}},\n\t{entry}',
        content
    )
    main_go.write_text(content)
    ok("main.go patched")

# ── main ──────────────────────────────────────────────────────────────────────

def main():
    print("\033[1;36m")
    print("╔══════════════════════════════════════╗")
    print("║     OpenFront Map Tester v1.0        ║")
    print("╚══════════════════════════════════════╝")
    print("\033[0m")

    print("This script will do the following:\n")
    print("  1. Download the OpenFrontIO game (~200 MB) to this folder")
    print("  2. Copy your map files into the game")
    print("  3. Generate the map using Go (~1–2 min)")
    print("  4. Install game dependencies via npm (~300 MB, one-time)")
    print("  5. Start a local game server and open it in your browser")
    print()
    print("\033[90mTotal download: ~500 MB on first run.")
    print("On repeat runs the repo is reused — no re-download.\033[0m")
    print()
    confirm = input("Press Enter to continue, or Ctrl+C to cancel... ")
    print()

    # Ask about existing repo
    print("─" * 42)
    print("\033[1mDo you already have the OpenFrontIO source code on your computer?\033[0m")
    print()
    print("  (This is NOT the game you play in the browser — it's the source")
    print("   code folder you'd get by cloning the repo from GitHub.)")
    print("   It usually contains folders like: src/, map-generator/, resources/")
    print()
    has_repo = input("Do you have it? (y/n): ").strip().lower()
    print()

    custom_repo_path = None
    if has_repo == "y":
        path_input = input("Paste the full path to the OpenFrontIO folder: ").strip().strip('"').strip("'")
        candidate = Path(path_input)
        if not (candidate / "map-generator").exists():
            print(f"\n\033[1;33m  ⚠ Could not find map-generator/ in that folder. Will clone fresh instead.\033[0m\n")
        else:
            custom_repo_path = candidate
            ok(f"Using existing repo at: {custom_repo_path}")

    # 1. Check dependencies
    step("Checking dependencies...")
    check_tool("git", "https://git-scm.com/downloads")
    check_tool("go", "https://go.dev/dl/")
    check_tool("node", "https://nodejs.org/")
    check_tool("npm", "https://nodejs.org/")

    # 2. Read map info
    step("Reading map info...")
    folder_name, display_name, info_data = get_map_info()
    ok(f"Map: '{display_name}' (folder: {folder_name})")

    if not (MAP_DIR / "image.png").exists():
        fail("image.png not found next to setup.py")

    # 3. Clone or update repo
    step("Setting up OpenFrontIO repository...")
    repo = custom_repo_path if custom_repo_path else REPO_DIR
    if custom_repo_path:
        update = input("Update it to the latest version from GitHub? (y/n): ").strip().lower()
        print()
        if update == "y":
            ok("Pulling latest main...")
            run(["git", "fetch", "origin"], cwd=repo)
            run(["git", "checkout", "main"], cwd=repo)
            run(["git", "reset", "--hard", "origin/main"], cwd=repo)
        else:
            ok("Using repo as-is, skipping update")
    elif REPO_DIR.exists():
        ok("Repo already exists, pulling latest main...")
        run(["git", "fetch", "origin"], cwd=REPO_DIR)
        run(["git", "checkout", "main"], cwd=REPO_DIR)
        run(["git", "reset", "--hard", "origin/main"], cwd=REPO_DIR)
    else:
        print("  Cloning OpenFrontIO (this may take a minute)...")
        run(["git", "clone", "--depth=1", REPO_URL, str(REPO_DIR)])
        ok("Cloned successfully")
        repo = REPO_DIR

    # 4. Copy map files
    step("Copying map files...")
    map_asset_dir = repo / "map-generator" / "assets" / "maps" / folder_name
    map_asset_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(MAP_DIR / "image.png", map_asset_dir / "image.png")
    shutil.copy(MAP_DIR / "info.json", map_asset_dir / "info.json")
    ok(f"Files copied to map-generator/assets/maps/{folder_name}/")

    # 5. Patch game files
    step("Registering map in game files...")
    patch_main_go(folder_name, repo)
    patch_game_ts(folder_name, display_name, repo)
    patch_en_json(folder_name, display_name, repo)

    # 6. Generate map
    step("Generating map (running Go script)...")
    run(["go", "run", ".", f"--maps={folder_name}"], cwd=repo / "map-generator")
    ok("Map generated successfully")

    # 7. Install npm deps
    step("Installing npm dependencies...")
    run(["npm", "run", "inst"], cwd=repo)
    ok("Dependencies installed")

    # 8. Start dev server
    step("Starting dev server...")
    print("  \033[1;33mServer will be available at http://localhost:9000\033[0m")
    print("  \033[90mPress Ctrl+C to stop\033[0m\n")

    # Open browser after short delay
    def open_browser():
        import urllib.request
        for _ in range(60):
            try:
                urllib.request.urlopen("http://localhost:9000", timeout=2)
                webbrowser.open("http://localhost:9000")
                return
            except Exception:
                time.sleep(2)
        webbrowser.open("http://localhost:9000")

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    # Run dev server (blocking)
    subprocess.run(["npm", "run", "dev"], cwd=repo)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n\033[90mStopped.\033[0m\n")
