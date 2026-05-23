# ============================================================
# launcher.ps1 - Discord Media Cast
# Lance l'app en arrière-plan, vérifie les mises à jour
# ============================================================

$AppDir = "$env:APPDATA\DiscordMediaCast"
$LogFile = "$AppDir\launcher.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Out-File -Append -FilePath $LogFile -Encoding UTF8
}

Write-Log "=== Démarrage de Discord Media Cast ==="

# Vérifier que le dossier existe
if (-not (Test-Path $AppDir)) {
    Write-Log "ERREUR : Le dossier d'installation est introuvable : $AppDir"
    Write-Log "Veuillez relancer install.bat pour réinstaller l'application."
    exit 1
}

Set-Location $AppDir

# Tirer les dernières mises à jour depuis GitHub
Write-Log "Vérification des mises à jour..."
try {
    # Annuler tout changement local pour s'assurer que le pull ne bloque pas (ex: modifications manuelles des fichiers de l'app)
    & git reset --hard HEAD 2>&1 | Out-Null
    $gitOutput = & git pull 2>&1
    Write-Log "Git pull : $gitOutput"
} catch {
    Write-Log "Impossible de vérifier les mises à jour (pas de connexion internet ?). Lancement de la version locale."
}

# Installer les nouvelles dépendances si le package.json a changé
Write-Log "Vérification des dépendances Node.js..."
try {
    & npm install --silent 2>&1 | Out-Null
    Write-Log "Dépendances vérifiées."
} catch {
    Write-Log "Erreur npm install : $_"
}

# Vérifier que le binaire Electron est bien installé
$electronPath = "$AppDir\node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electronPath)) {
    Write-Log "Electron manquant ! Téléchargement du binaire..."
    try {
        & node "$AppDir\node_modules\electron\install.js" 2>&1 | Out-Null
        if (Test-Path $electronPath) {
            Write-Log "Electron téléchargé avec succès."
        } else {
            Write-Log "ERREUR : Impossible de télécharger Electron. Vérifiez la connexion internet."
            exit 1
        }
    } catch {
        Write-Log "ERREUR téléchargement Electron : $_"
        exit 1
    }
}

# Lancer l'application Electron en arrière-plan
Write-Log "Lancement de l'application..."
try {
    Write-Log "PATH: $env:PATH"
    $npmPath = Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    $nodePath = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    Start-Process -FilePath $electronPath -ArgumentList "overlay.js" -WorkingDirectory $AppDir -RedirectStandardOutput "$AppDir\app.log" -RedirectStandardError "$AppDir\app_error.log"
    # Ouvrir le tableau de bord automatiquement après 3 secondes pour laisser le temps au serveur de démarrer
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:3000"
    Write-Log "Application lancée avec succès."
} catch {
    Write-Log "ERREUR au lancement : $_"
}
