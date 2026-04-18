#!/bin/bash
# macOS: double-click this file to open in Terminal
cd "$(dirname "$0")"

# Colors
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m' # No Color

if ! command -v python3 &> /dev/null; then
    echo ""
    echo -e "${YELLOW}Python 3 is not installed on your system.${NC}"
    echo "Python is required to run the OpenFront Map Tester."
    echo ""
    read -p "Install Python automatically? (y/n): " install
    
    if [[ "$install" == "y" || "$install" == "Y" ]]; then
        echo ""
        echo -e "${BLUE}Installing Python 3...${NC}"
        
        # Check if Homebrew is installed
        if command -v brew &> /dev/null; then
            echo "Installing via Homebrew..."
            brew install python3
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}Python 3 installed successfully${NC}"
                echo ""
            else
                echo -e "${RED}Failed to install Python via Homebrew${NC}"
                echo "Please install manually from: https://www.python.org/downloads/"
                read -p "Press Enter to exit..."
                exit 1
            fi
        else
            echo -e "${YELLOW}Homebrew not found. Installing Homebrew first...${NC}"
            echo "This will also install Xcode Command Line Tools if needed."
            echo ""
            
            # Install Homebrew
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            
            if [ $? -eq 0 ]; then
                # Add Homebrew to PATH for this session
                if [[ $(uname -m) == 'arm64' ]]; then
                    eval "$(/opt/homebrew/bin/brew shellenv)"
                else
                    eval "$(/usr/local/bin/brew shellenv)"
                fi
                
                echo ""
                echo -e "${GREEN}Homebrew installed${NC}"
                echo "Now installing Python 3..."
                brew install python3
                
                if [ $? -eq 0 ]; then
                    echo -e "${GREEN}Python 3 installed successfully${NC}"
                    echo ""
                else
                    echo -e "${RED}Failed to install Python${NC}"
                    echo "Please install manually from: https://www.python.org/downloads/"
                    read -p "Press Enter to exit..."
                    exit 1
                fi
            else
                echo -e "${RED}Failed to install Homebrew${NC}"
                echo "Please install Python manually from: https://www.python.org/downloads/"
                read -p "Press Enter to exit..."
                exit 1
            fi
        fi
    else
        echo ""
        echo "Python 3 is required to continue."
        echo "Download it from: https://www.python.org/downloads/"
        read -p "Press Enter to exit..."
        exit 1
    fi
fi

python3 setup.py
