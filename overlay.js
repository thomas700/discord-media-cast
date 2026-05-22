import { app, BrowserWindow, screen, Notification, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// electron-updater utilise CommonJS, on doit l'importer via createRequire
const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');

// Démarrer le serveur Express & Socket.io local en même temps
import './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let overlayWindow;

// ---- Configuration des mises à jour automatiques ----
function setupAutoUpdater() {
  // Ne vérifier les mises à jour que dans l'app packagée (pas en développement)
  if (!app.isPackaged) {
    console.log('🔧 Mode développement : vérification des mises à jour désactivée.');
    return;
  }

  autoUpdater.autoDownload = true;       // Télécharger silencieusement en arrière-plan
  autoUpdater.autoInstallOnAppQuit = false; // On laisse l'utilisateur choisir quand redémarrer

  autoUpdater.on('checking-for-update', () => {
    console.log('🔍 Vérification des mises à jour...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`🆕 Mise à jour disponible : v${info.version}. Téléchargement en cours...`);
    // Petite notification Windows discrète
    if (Notification.isSupported()) {
      new Notification({
        title: 'Discord Media Cast',
        body: `Mise à jour v${info.version} en téléchargement...`,
        icon: path.join(__dirname, 'public', 'icon.ico')
      }).show();
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('✅ Application à jour.');
  });

  autoUpdater.on('error', (err) => {
    console.error('❌ Erreur de mise à jour :', err.message);
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`⬇️ Téléchargement : ${pct}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`✅ Mise à jour v${info.version} téléchargée !`);
    // Afficher une boîte de dialogue pour proposer le redémarrage
    dialog.showMessageBox({
      type: 'info',
      title: 'Mise à jour prête !',
      message: `La version ${info.version} est prête à être installée.`,
      detail: 'Voulez-vous redémarrer l\'application maintenant pour appliquer la mise à jour ?',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  // Vérifier les mises à jour 3 secondes après le démarrage
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.error('Impossible de vérifier les mises à jour :', err.message);
    });
  }, 3000);
}

function createOverlay() {
  // Récupérer la taille de l'écran principal
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    transparent: true,      // Rendre le fond de la fenêtre invisible
    frame: false,           // Supprimer la barre de titre et les bordures
    alwaysOnTop: true,      // Rester toujours au premier plan
    skipTaskbar: true,      // Cacher de la barre des tâches
    hasShadow: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Forcer l'overlay à un niveau maximal (passe par-dessus les jeux en Borderless Fullscreen)
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Rendre la fenêtre "fantôme" : la souris clique au travers, directement sur le jeu !
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // Empêcher la fenêtre de voler le focus de votre jeu (sinon le jeu se minimiserait)
  overlayWindow.setFocusable(false);

  // Maximiser la fenêtre pour couvrir tout l'écran
  overlayWindow.maximize();

  // Charger notre application locale avec un paramètre pour activer le CSS transparent
  overlayWindow.loadURL('http://localhost:' + (process.env.PORT || 3000) + '/?overlay=true');
}

// Désactiver l'accélération matérielle s'il y a des conflits de rendu (optionnel, mais parfois utile avec certains jeux)
// app.disableHardwareAcceleration();

app.whenReady().then(() => {
  // Configurer les mises à jour automatiques
  setupAutoUpdater();

  // On attend 1,5s pour être sûr que le serveur Express a fini de démarrer
  setTimeout(createOverlay, 1500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlay();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    process.exit(0); // Forcer la fermeture de server.js également
  }
});

