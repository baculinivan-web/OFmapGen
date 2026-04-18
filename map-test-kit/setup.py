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

def install_go():
    """Download and install Go automatically"""
    system = platform.system().lower()
    machine = platform.machine().lower()
    
    # Determine Go version and architecture
    go_version = "1.22.0"
    
    if system == "windows":
        if "amd64" in machine or "x86_64" in machine:
            go_file = f"go{go_version}.windows-amd64.zip"
        else:
            go_file = f"go{go_version}.windows-386.zip"
        extract_cmd = "zip"
    elif system == "darwin":  # macOS
        if "arm" in machine or "aarch64" in machine:
            go_file = f"go{go_version}.darwin-arm64.tar.gz"
        else:
            go_file = f"go{go_version}.darwin-amd64.tar.gz"
        extract_cmd = "tar"
    elif system == "linux":
        if "arm" in machine or "aarch64" in machine:
            go_file = f"go{go_version}.linux-arm64.tar.gz"
        else:
            go_file = f"go{go_version}.linux-amd64.tar.gz"
        extract_cmd = "tar"
    else:
        return False
    
    go_url = f"https://go.dev/dl/{go_file}"
    go_local_dir = Path.home() / ".openfront-tools"
    go_local_dir.mkdir(exist_ok=True)
    go_archive = go_local_dir / go_file
    go_install_dir = go_local_dir / "go"
    
    print(f"\n  \033[1;33mInstalling Go {go_version} locally...\033[0m")
    print(f"  Download: {go_url}")
    print(f"  Install to: {go_install_dir}")
    print()
    
    try:
        # Download
        print("  Downloading Go (~150 MB, this may take a minute)...")
        import urllib.request
        urllib.request.urlretrieve(go_url, go_archive)
        ok("Downloaded")
        
        # Extract
        print("  Extracting...")
        if go_install_dir.exists():
            shutil.rmtree(go_install_dir)
        
        if extract_cmd == "tar":
            run(["tar", "-xzf", str(go_archive), "-C", str(go_local_dir)])
        else:  # zip for Windows
            import zipfile
            with zipfile.ZipFile(go_archive, 'r') as zip_ref:
                zip_ref.extractall(go_local_dir)
        
        go_archive.unlink()  # Remove archive
        ok("Extracted")
        
        # Add to PATH for this session
        go_bin = go_install_dir / "bin"
        os.environ["PATH"] = f"{go_bin}{os.pathsep}{os.environ['PATH']}"
        
        # Verify
        if shutil.which("go"):
            ok(f"Go installed successfully")
            return True
        else:
            return False
            
    except Exception as e:
        print(f"\n  \033[1;31mFailed to install Go: {e}\033[0m")
        return False

def install_nodejs():
    """Download and install Node.js automatically"""
    system = platform.system().lower()
    machine = platform.machine().lower()
    
    # Determine Node version and architecture
    node_version = "20.11.0"
    
    if system == "windows":
        if "amd64" in machine or "x86_64" in machine:
            node_file = f"node-v{node_version}-win-x64.zip"
            node_folder = f"node-v{node_version}-win-x64"
        else:
            node_file = f"node-v{node_version}-win-x86.zip"
            node_folder = f"node-v{node_version}-win-x86"
        extract_cmd = "zip"
    elif system == "darwin":  # macOS
        if "arm" in machine or "aarch64" in machine:
            node_file = f"node-v{node_version}-darwin-arm64.tar.gz"
            node_folder = f"node-v{node_version}-darwin-arm64"
        else:
            node_file = f"node-v{node_version}-darwin-x64.tar.gz"
            node_folder = f"node-v{node_version}-darwin-x64"
        extract_cmd = "tar"
    elif system == "linux":
        if "arm" in machine or "aarch64" in machine:
            node_file = f"node-v{node_version}-linux-arm64.tar.gz"
            node_folder = f"node-v{node_version}-linux-arm64"
        else:
            node_file = f"node-v{node_version}-linux-x64.tar.gz"
            node_folder = f"node-v{node_version}-linux-x64"
        extract_cmd = "tar"
    else:
        return False
    
    node_url = f"https://nodejs.org/dist/v{node_version}/{node_file}"
    node_local_dir = Path.home() / ".openfront-tools"
    node_local_dir.mkdir(exist_ok=True)
    node_archive = node_local_dir / node_file
    node_install_dir = node_local_dir / "node"
    
    print(f"\n  \033[1;33mInstalling Node.js {node_version} locally...\033[0m")
    print(f"  Download: {node_url}")
    print(f"  Install to: {node_install_dir}")
    print()
    
    try:
        # Download
        print("  Downloading Node.js (~50 MB, this may take a minute)...")
        import urllib.request
        urllib.request.urlretrieve(node_url, node_archive)
        ok("Downloaded")
        
        # Extract
        print("  Extracting...")
        if node_install_dir.exists():
            shutil.rmtree(node_install_dir)
        
        if extract_cmd == "tar":
            run(["tar", "-xzf", str(node_archive), "-C", str(node_local_dir)])
            # Rename extracted folder to "node"
            (node_local_dir / node_folder).rename(node_install_dir)
        else:  # zip for Windows
            import zipfile
            with zipfile.ZipFile(node_archive, 'r') as zip_ref:
                zip_ref.extractall(node_local_dir)
            (node_local_dir / node_folder).rename(node_install_dir)
        
        node_archive.unlink()  # Remove archive
        ok("Extracted")
        
        # Add to PATH for this session
        node_bin = node_install_dir / "bin" if system != "windows" else node_install_dir
        os.environ["PATH"] = f"{node_bin}{os.pathsep}{os.environ['PATH']}"
        
        # Verify
        if shutil.which("node") and shutil.which("npm"):
            ok(f"Node.js and npm installed successfully")
            return True
        else:
            return False
            
    except Exception as e:
        print(f"\n  \033[1;31mFailed to install Node.js: {e}\033[0m")
        return False

def install_git():
    """Install Git using system package manager or portable version"""
    system = platform.system().lower()
    
    print(f"\n  \033[1;33mInstalling Git...\033[0m\n")
    
    try:
        if system == "darwin":  # macOS
            print("  Attempting to install via Homebrew...")
            if shutil.which("brew"):
                run(["brew", "install", "git"])
                ok("Git installed via Homebrew")
                return True
            else:
                print("  \033[1;33mHomebrew not found. Trying Xcode Command Line Tools...\033[0m")
                run(["xcode-select", "--install"])
                print("  \033[1;33mPlease complete the Xcode installation and run this script again.\033[0m")
                return False
        elif system == "linux":
            # Try different package managers
            if shutil.which("apt-get"):
                print("  Installing via apt-get...")
                run(["sudo", "apt-get", "update"])
                run(["sudo", "apt-get", "install", "-y", "git"])
                ok("Git installed via apt-get")
                return True
            elif shutil.which("yum"):
                print("  Installing via yum...")
                run(["sudo", "yum", "install", "-y", "git"])
                ok("Git installed via yum")
                return True
            elif shutil.which("dnf"):
                print("  Installing via dnf...")
                run(["sudo", "dnf", "install", "-y", "git"])
                ok("Git installed via dnf")
                return True
            elif shutil.which("pacman"):
                print("  Installing via pacman...")
                run(["sudo", "pacman", "-S", "--noconfirm", "git"])
                ok("Git installed via pacman")
                return True
        elif system == "windows":
            # Download portable Git for Windows
            git_version = "2.43.0"
            machine = platform.machine().lower()
            
            if "amd64" in machine or "x86_64" in machine:
                git_file = f"PortableGit-{git_version}-64-bit.7z.exe"
            else:
                git_file = f"PortableGit-{git_version}-32-bit.7z.exe"
            
            git_url = f"https://github.com/git-for-windows/git/releases/download/v{git_version}.windows.1/{git_file}"
            git_local_dir = Path.home() / ".openfront-tools"
            git_local_dir.mkdir(exist_ok=True)
            git_installer = git_local_dir / git_file
            git_install_dir = git_local_dir / "git"
            
            print(f"  Downloading Git for Windows (~50 MB)...")
            print(f"  From: {git_url}")
            
            import urllib.request
            urllib.request.urlretrieve(git_url, git_installer)
            ok("Downloaded")
            
            print("  Extracting...")
            if git_install_dir.exists():
                shutil.rmtree(git_install_dir)
            git_install_dir.mkdir()
            
            # PortableGit is a self-extracting 7z archive
            run([str(git_installer), "-o" + str(git_install_dir), "-y"], capture=True)
            git_installer.unlink()
            ok("Extracted")
            
            # Add to PATH
            git_bin = git_install_dir / "cmd"
            os.environ["PATH"] = f"{git_bin}{os.pathsep}{os.environ['PATH']}"
            
            if shutil.which("git"):
                ok("Git installed successfully")
                return True
            else:
                return False
        
        return False
    except Exception as e:
        print(f"\n  \033[1;31mFailed to install Git: {e}\033[0m")
        return False

def check_or_install_tool(name, installer_func, manual_url):
    """Check if tool exists, offer to install if not"""
    if shutil.which(name) is not None:
        ok(f"{name} found")
        return True
    
    # Check if already installed locally in .openfront-tools
    tools_dir = Path.home() / ".openfront-tools"
    
    # Check for Go
    if name == "go":
        go_bin = tools_dir / "go" / "bin"
        if (go_bin / "go").exists() or (go_bin / "go.exe").exists():
            os.environ["PATH"] = f"{go_bin}{os.pathsep}{os.environ['PATH']}"
            if shutil.which("go"):
                ok("go found (local installation)")
                return True
    
    # Check for Node/npm
    if name in ("node", "npm"):
        node_bin = tools_dir / "node" / "bin" if platform.system().lower() != "windows" else tools_dir / "node"
        node_exe = node_bin / "node" if platform.system().lower() != "windows" else node_bin / "node.exe"
        npm_exe = node_bin / "npm" if platform.system().lower() != "windows" else node_bin / "npm.cmd"
        
        if node_exe.exists() and npm_exe.exists():
            os.environ["PATH"] = f"{node_bin}{os.pathsep}{os.environ['PATH']}"
            if shutil.which(name):
                ok(f"{name} found (local installation)")
                return True
    
    # Check for Git on Windows
    if name == "git" and platform.system().lower() == "windows":
        git_bin = tools_dir / "git" / "cmd"
        git_exe = git_bin / "git.exe"
        if git_exe.exists():
            os.environ["PATH"] = f"{git_bin}{os.pathsep}{os.environ['PATH']}"
            if shutil.which("git"):
                ok("git found (local installation)")
                return True
    
    print(f"\n\033[1;33m  {name} is not installed on your system.\033[0m")
    print(f"  {name} is required to run OpenFront.")
    print()
    choice = input(f"  Install {name} automatically? (y/n): ").strip().lower()
    print()
    
    if choice == "y":
        if installer_func():
            return True
        else:
            fail(f"{name} installation failed.\n  Please install manually: {manual_url}")
    else:
        fail(f"{name} is required.\n  Install it manually: {manual_url}")

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
    check_or_install_tool("git", install_git, "https://git-scm.com/downloads")
    check_or_install_tool("go", install_go, "https://go.dev/dl/")
    check_or_install_tool("node", install_nodejs, "https://nodejs.org/")
    check_or_install_tool("npm", install_nodejs, "https://nodejs.org/")

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
