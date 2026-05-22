@echo off
setlocal EnableDelayedExpansion
title Discord Media Cast - Installation

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

:: ---- Configurer le .env (token Discord + salon) ----
if not exist "%INSTALL_DIR%\.env" (
    echo.
    echo  --------------------------------------------------------
    echo   Configuration du Bot Discord
    echo  --------------------------------------------------------
    echo.
    echo  Demandez a votre ami Thomas le TOKEN du bot Discord
    echo  et l'ID du salon a surveiller.
    echo.
    set /p DISCORD_TOKEN="  Token du bot Discord : "
    set /p CHANNEL_ID="  ID du salon Discord   : "
    echo.
    (
        echo PORT=3000
        echo DISCORD_TOKEN=!DISCORD_TOKEN!
        echo CHANNEL_ID=!CHANNEL_ID!
    ) > "%INSTALL_DIR%\.env"
    echo  Configuration sauvegardee.
) else (
    echo        Fichier de configuration existant. OK
)

:: ---- Configurer le démarrage automatique via le Planificateur de tâches ----
echo  [4/4] Configuration du demarrage automatique...

:: Supprimer l'ancienne tâche si elle existe
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Créer la nouvelle tâche (lance launcher.ps1 au login, sans fenêtre)
schtasks /create ^
    /tn "%TASK_NAME%" ^
    /tr "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%LAUNCHER_SCRIPT%\"" ^
    /sc onlogon ^
    /f >nul

if errorlevel 1 (
    echo  [ERREUR] Impossible de creer la tache planifiee.
    echo  Essayez de relancer ce script en tant qu'administrateur.
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
