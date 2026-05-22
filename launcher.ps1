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

# Lancer l'application Electron en arrière-plan
Write-Log "Lancement de l'application..."
try {
    Start-Process -FilePath "npm" -ArgumentList "run", "overlay" -WorkingDirectory $AppDir -WindowStyle Hidden
    Write-Log "Application lancée avec succès."
} catch {
    Write-Log "ERREUR au lancement : $_"
}
