@echo off
setlocal EnableDelayedExpansion
title Discord Media Cast - Installation

:: ============================================================
:: CONFIGURATION DU BOT DISCORD (A remplir avant d'envoyer aux amis)
:: ============================================================
set "DISCORD_TOKEN=VOTRE_TOKEN_ICI"
set "CHANNEL_ID=VOTRE_CHANNEL_ID_ICI"

:: ============================================================
:: install.bat - Discord Media Cast
:: A exécuter UNE SEULE FOIS pour installer l'application.
:: Double-cliquez dessus et laissez faire !
:: ============================================================

echo.
echo  ========================================================
echo   Discord Media Cast - Installeur automatique
echo  ========================================================
echo.
echo  Ce script va installer automatiquement :
echo   - Git (si absent)
echo   - Node.js (si absent)
echo   - L'application Discord Media Cast
echo   - Le demarrage automatique au boot de Windows
echo.
echo  Patience, cela peut prendre quelques minutes...
echo.

set "INSTALL_DIR=%APPDATA%\DiscordMediaCast"
set "REPO_URL=https://github.com/thomas700/discord-media-cast.git"
set "LAUNCHER_SCRIPT=%INSTALL_DIR%\launcher.ps1"
set "TASK_NAME=DiscordMediaCastLauncher"

:: ---- Vérifier winget ----
winget --version >nul 2>&1
if errorlevel 1 (
    echo  [ERREUR] winget n'est pas disponible sur ce PC.
    echo  Veuillez mettre a jour Windows 10 ou passer a Windows 11.
    pause
    exit /b 1
)

:: ---- Installer Git si absent ----
git --version >nul 2>&1
if errorlevel 1 (
    echo  [1/4] Installation de Git...
    winget install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements
    :: Recharger le PATH pour que git soit disponible
    call refreshenv >nul 2>&1
    set "PATH=%PATH%;C:\Program Files\Git\cmd"
) else (
    echo  [1/4] Git est deja installe. OK
)

:: ---- Installer Node.js si absent ----
node --version >nul 2>&1
if errorlevel 1 (
    echo  [2/4] Installation de Node.js...
    winget install --id OpenJS.NodeJS.LTS -e --source winget --silent --accept-package-agreements --accept-source-agreements
    :: Recharger le PATH
    set "PATH=%PATH%;C:\Program Files\nodejs"
) else (
    echo  [2/4] Node.js est deja installe. OK
)

:: ---- Cloner ou mettre à jour le repo ----
echo  [3/4] Installation de Discord Media Cast...
if exist "%INSTALL_DIR%\.git" (
    echo        Dossier existant trouve, mise a jour...
    cd /d "%INSTALL_DIR%"
    git pull
) else (
    echo        Telechargement de l'application...
    git clone "%REPO_URL%" "%INSTALL_DIR%"
    if errorlevel 1 (
        echo  [ERREUR] Impossible de telecharger l'application.
        echo  Verifiez votre connexion internet et reessayez.
        pause
        exit /b 1
    )
)

:: ---- Installer les dépendances Node.js ----
echo        Installation des dependances...
cd /d "%INSTALL_DIR%"
call npm install --silent
if errorlevel 1 (
    echo  [ERREUR] Impossible d'installer les dependances.
    pause
    exit /b 1
)

echo        Telechargement et verification du moteur d'affichage...
call node node_modules/electron/install.js >nul 2>&1


:: ---- Configurer le .env (token Discord + salon) ----
if not exist "%INSTALL_DIR%\.env" (
    echo.
    echo  --------------------------------------------------------
    echo   Configuration du Bot Discord
    echo  --------------------------------------------------------
    echo.
    
    set "FINAL_TOKEN=%DISCORD_TOKEN%"
    set "FINAL_CHANNEL=%CHANNEL_ID%"
    
    if "!FINAL_TOKEN!"=="VOTRE_TOKEN_ICI" (
        echo  Demandez a votre ami Thomas le TOKEN du bot Discord.
        set /p FINAL_TOKEN="  Token du bot Discord : "
    ) else (
        echo        Token Discord pre-configure trouve. OK
    )
    
    if "!FINAL_CHANNEL!"=="VOTRE_CHANNEL_ID_ICI" (
        echo  Demandez a votre ami Thomas l'ID du salon a surveiller.
        set /p FINAL_CHANNEL="  ID du salon Discord   : "
    ) else (
        echo        ID du salon pre-configure trouve. OK
    )
    
    echo.
    (
        echo PORT=3000
        echo DISCORD_TOKEN=!FINAL_TOKEN!
        echo CHANNEL_ID=!FINAL_CHANNEL!
    ) > "%INSTALL_DIR%\.env"
    echo  Configuration sauvegardee.
) else (
    echo        Fichier de configuration existant. OK
)

:: ---- Configurer le démarrage automatique via le dossier Démarrage ----
echo  [4/4] Configuration du demarrage automatique...

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_SCRIPT=%STARTUP_DIR%\DiscordMediaCast.vbs"

:: Créer le script VBS qui lance le launcher PowerShell en arrière-plan (totalement invisible)
(
    echo Set WshShell = CreateObject^("WScript.Shell"^)
    echo WshShell.Run "powershell.exe -ExecutionPolicy Bypass -File ""%LAUNCHER_SCRIPT%""", 0, False
) > "%VBS_SCRIPT%"

if errorlevel 1 (
    echo  [ERREUR] Impossible de configurer le demarrage automatique.
    pause
    exit /b 1
)

:: ---- Lancer l'app immédiatement (sans attendre le prochain boot) ----
echo.
echo  ========================================================
echo   Installation terminee avec succes !
echo  ========================================================
echo.
echo  L'application Discord Media Cast va se lancer maintenant
echo  et demarrera automatiquement a chaque demarrage Windows.
echo.
echo  Aucune fenetre ne s'affichera - c'est normal !
echo  Rendez-vous sur http://localhost:3000 pour le tableau de bord.
echo.
pause

powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "%LAUNCHER_SCRIPT%"
