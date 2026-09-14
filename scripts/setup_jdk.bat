@echo off
if not exist "C:\Users\a657e\.jdk" mkdir "C:\Users\a657e\.jdk"
cd /d "C:\Users\a657e\.jdk"
if not exist "jdk-21.zip" (
    echo Downloading Microsoft OpenJDK 21...
    curl.exe -L -o jdk-21.zip "https://aka.ms/download-jdk/microsoft-jdk-21.0.6-windows-x64.zip"
)
if not exist "jdk-21" (
    echo Extracting OpenJDK 21...
    powershell -Command "Expand-Archive -Path 'jdk-21.zip' -DestinationPath 'jdk-21' -Force"
)
echo JDK 21 setup complete!
