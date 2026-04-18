@echo off
cd /d "%~dp0"

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [33mPython is not installed on your system.[0m
    echo Python is required to run the OpenFront Map Tester.
    echo.
    set /p install="Install Python automatically? (y/n): "
    
    if /i "%install%"=="y" (
        echo.
        echo [34mDownloading Python installer...[0m
        
        REM Download Python installer
        set PYTHON_VERSION=3.12.2
        set PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-amd64.exe
        set INSTALLER=%TEMP%\python-installer.exe
        
        powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%INSTALLER%'}"
        
        if errorlevel 1 (
            echo [31mFailed to download Python installer.[0m
            echo Please download manually from: https://www.python.org/downloads/
            pause
            exit /b 1
        )
        
        echo [32mDownloaded successfully[0m
        echo.
        echo [34mInstalling Python (this may take a minute)...[0m
        echo Please wait...
        
        REM Install Python silently with PATH
        "%INSTALLER%" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
        
        REM Clean up
        del "%INSTALLER%"
        
        echo [32mPython installed successfully[0m
        echo.
        echo [33mPlease close this window and run the script again.[0m
        pause
        exit /b 0
    ) else (
        echo.
        echo Python is required to continue.
        echo Download it from: https://www.python.org/downloads/
        echo Make sure to check "Add Python to PATH" during installation.
        pause
        exit /b 1
    )
)

python setup.py
pause
