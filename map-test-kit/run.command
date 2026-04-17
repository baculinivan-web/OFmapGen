#!/bin/bash
# macOS: double-click this file to open in Terminal
cd "$(dirname "$0")"

if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed."
    echo "Download it from: https://www.python.org/downloads/"
    read -p "Press Enter to exit..."
    exit 1
fi

python3 setup.py
