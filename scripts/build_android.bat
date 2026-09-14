@echo off
set "JAVA_HOME=C:\Users\a657e\Desktop\amycraft\jdk17\jdk-17.0.12+7"
set "ANDROID_HOME=C:\Users\a657e\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"
cd /d "c:\Users\a657e\Desktop\amymusic\android"
echo JAVA_HOME is %JAVA_HOME%
echo ANDROID_HOME is %ANDROID_HOME%
call gradlew.bat assembleDebug

