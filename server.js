import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { exec, spawn } from 'child_process';

// Charger les variables d'environnement
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin vers le script VBS de démarrage Windows
const startupVbsPath = path.join(
  process.env.APPDATA || '',
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup',
  'DiscordMediaCast.vbs'
);

function getStartupStatus() {
  try {
    return fs.existsSync(startupVbsPath);
  } catch (e) {
    return false;
  }
}

function handleWindowsStartup(enable) {
  try {
    if (enable) {
      if (!fs.existsSync(startupVbsPath)) {
        const launcherScript = path.join(__dirname, 'launcher.ps1');
        // Créer le script VBS qui lance le launcher PowerShell de manière invisible (0)
        const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run "powershell.exe -ExecutionPolicy Bypass -File ""${launcherScript}""", 0, False\n`;
        fs.writeFileSync(startupVbsPath, vbsContent, 'utf8');
        console.log('💻 Démarrage automatique Windows activé (VBS créé).');
      }
    } else {
      if (fs.existsSync(startupVbsPath)) {
        fs.unlinkSync(startupVbsPath);
        console.log('💻 Démarrage automatique Windows désactivé (VBS supprimé).');
      }
    }
  } catch (err) {
    console.error('⚠️ Erreur modification démarrage Windows :', err.message);
  }
}

// Charger les paramètres sauvegardés
let currentSettings = {
  overlayPosition: 'top-right',
  mediaDuration: 5000,
  textScale: 1.0,
  ambientGlow: true,
  windowsStartup: true
};
const settingsFilePath = path.join(__dirname, 'settings.json');
try {
  if (fs.existsSync(settingsFilePath)) {
    const data = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
    currentSettings = { ...currentSettings, ...data };
    console.log(`💾 Paramètres restaurés depuis la sauvegarde.`);
  }
} catch (e) {
  console.warn("⚠️ Impossible de lire les paramètres sauvegardés :", e.message);
}
// Toujours synchroniser l'état avec la réalité du système Windows
currentSettings.windowsStartup = getStartupStatus();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Historique des 10 derniers médias diffusés
const mediaHistory = [];
const MAX_HISTORY = 10;

// État de la connexion Discord
let botStatus = {
  connected: false,
  ready: false,
  error: null,
  botName: null,
  channelName: null,
  settings: currentSettings, // Utiliser les paramètres restaurés
  configured: !!(process.env.DISCORD_TOKEN && process.env.CHANNEL_ID)
};

// Client Discord
let discordClient = null;

function initDiscord() {
  const token = process.env.DISCORD_TOKEN;
  const channelId = process.env.CHANNEL_ID;

  if (!token || !channelId) {
    console.warn('⚠️ Token Discord ou ID de salon manquant. L\'application démarrera en mode démo / guide de configuration.');
    botStatus.configured = false;
    return;
  }

  botStatus.configured = true;
  botStatus.error = null;

  console.log('🤖 Connexion du bot Discord...');
  
  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  discordClient.once('ready', async () => {
    try {
      botStatus.connected = true;
      botStatus.ready = true;
      botStatus.botName = discordClient.user.tag;
      
      const channel = await discordClient.channels.fetch(channelId);
      if (channel) {
        botStatus.channelName = channel.name;
        console.log(`✅ Bot Discord connecté sous le nom de : ${botStatus.botName}`);
        console.log(`📺 Surveillance du salon : #${botStatus.channelName} (${channelId})`);
      } else {
        throw new Error('Salon introuvable');
      }

      // Diffuser le nouvel état aux clients connectés
      io.emit('status_change', botStatus);
    } catch (err) {
      console.error('❌ Erreur de récupération du salon Discord:', err.message);
      botStatus.ready = false;
      botStatus.error = `Impossible d'accéder au salon : ${err.message}`;
      io.emit('status_change', botStatus);
    }
  });

  discordClient.on('messageCreate', async (message) => {
    // Ne pas traiter les messages du bot lui-même
    if (message.author && message.author.bot && message.author.id === discordClient.user.id) return;
    
    // Vérifier si c'est le bon salon
    if (message.channel.id !== channelId) return;

    console.log(`📩 Nouveau message reçu de ${message.author.username} dans #${botStatus.channelName}`);
    await processMessage(message);
  });

  discordClient.on('messageUpdate', async (oldMessage, newMessage) => {
    try {
      // S'assurer que le salon correspond
      if (newMessage.channel.id !== channelId) return;
      
      // Ne pas traiter les messages des bots
      if (newMessage.author && newMessage.author.bot) return;

      // Trouver si le message a déjà été traité
      const previousIndex = mediaHistory.findIndex(h => h.id === newMessage.id);
      const prevMedia = previousIndex !== -1 ? mediaHistory[previousIndex].media : null;
      const wasTextOnly = prevMedia && prevMedia.type === 'text';
      const wasScraped = prevMedia && prevMedia.isScraped === true;
      
      // Si non traité, ou si traité mais c'était juste du texte (ou un scrape instable) avant la résolution de l'embed
      if (newMessage.embeds && newMessage.embeds.length > 0 && (previousIndex === -1 || wasTextOnly || wasScraped)) {
        console.log(`📩 Message mis à jour avec des embeds dans #${botStatus.channelName}`);
        
        // Retirer l'ancienne version texte de l'historique pour éviter les doublons
        if (previousIndex !== -1) {
          mediaHistory.splice(previousIndex, 1);
        }
        
        await processMessage(newMessage);
      }
    } catch (e) {
      console.error("⚠️ Erreur lors de la capture de messageUpdate :", e.message);
    }
  });

  discordClient.login(token).catch(err => {
    console.error('❌ Échec de la connexion du bot Discord:', err.message);
    botStatus.ready = false;
    botStatus.connected = false;
    botStatus.error = `Erreur de connexion Discord : ${err.message}`;
    io.emit('status_change', botStatus);
  });
}

// Fonction pour extraire l'image directe d'une URL de partage de GIF (Tenor/Giphy)
async function resolveGifUrl(url) {
  try {
    if (/https?:\/\/(www\.)?tenor\.com\/view\//i.test(url) || /https?:\/\/(www\.)?giphy\.com\/gifs\//i.test(url)) {
      console.log(`🔍 Tentative de résolution du lien de GIF : ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) return null;
      
      const html = await response.text();
      
      // Chercher og:image (balise standard pour la miniature/le GIF animé de prévisualisation)
      const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) 
                        || html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
      
      if (ogImageMatch && ogImageMatch[1]) {
        console.log(`🎯 GIF résolu avec succès : ${ogImageMatch[1]}`);
        return ogImageMatch[1];
      }
    }
  } catch (e) {
    console.error('⚠️ Erreur lors de la résolution du GIF:', e.message);
  }
  return null;
}

// Fonction de parsing et formatage du message (asynchrone pour la résolution de GIF)
async function processMessage(message) {
  const payload = {
    id: message.id,
    timestamp: message.createdAt || new Date(),
    author: {
      username: message.member ? message.member.displayName : message.author.username,
      avatar: message.author.displayAvatarURL ? message.author.displayAvatarURL({ dynamic: true }) : '/assets/default-avatar.png'
    },
    content: message.content,
    media: null
  };

  // 1. Analyse des pièces jointes (attachments)
  if (message.attachments && message.attachments.size > 0) {
    const attachment = message.attachments.first();
    const contentType = attachment.contentType || '';
    let type = 'image';

    if (contentType.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(attachment.name)) {
      type = 'video';
    } else if (contentType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(attachment.name)) {
      type = 'audio';
    } else if (contentType.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(attachment.name)) {
      type = 'image';
    }

    payload.media = {
      type: type,
      url: attachment.url,
      name: attachment.name
    };
  } 
  // 1.5. Analyse des intégrations (embeds) - Idéal pour les GIFs du sélecteur Discord
  else if (message.embeds && message.embeds.length > 0) {
    const embed = message.embeds[0];
    console.log(`🔍 Embed Discord détecté pour parsing: type=${embed.type || 'unknown'}, url=${embed.url || 'none'}`);
    
    const embedUrl = embed.url || '';
    const hasImage = embed.image || embed.thumbnail;
    const isGifUrl = /tenor\.com|giphy\.com/i.test(embedUrl);
    
    if (isGifUrl || hasImage) {
      // Priorité à la vidéo (les GIFs Discord sont souvent convertis en mp4 animés), puis l'image, puis la miniature
      const directMediaUrl = (embed.video && embed.video.url) || 
                             (embed.image && embed.image.url) || 
                             (embed.thumbnail && embed.thumbnail.url);
                             
      if (directMediaUrl) {
        // Explicitement vérifier si l'URL finit par une extension image, car parfois les webp/gif sont mis dans embed.video
        const isImageExt = /\.(gif|webp|png|jpg|jpeg)(\?.*)?$/i.test(directMediaUrl);
        const isVideoExt = /\.(mp4|webm|mov)(\?.*)?$/i.test(directMediaUrl);
        const isVideo = (!isImageExt && embed.video && embed.video.url) || isVideoExt;
        
        payload.media = {
          type: isVideo ? 'video' : 'image',
          url: directMediaUrl,
          name: isVideo ? 'embed_video.mp4' : 'embed_image.gif'
        };
        console.log(`🎯 Média extrait de l'embed Discord avec succès : [${payload.media.type}] ${directMediaUrl}`);
      }
    }
  }
  // 2. Analyse des URLs directes dans le contenu si pas d'attachment ni d'embed
  else {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = message.content.match(urlRegex);
    if (urls && urls.length > 0) {
      const firstUrl = urls[0];
      
      // Tenter de résoudre l'URL de GIF Tenor/Giphy
      const resolvedGif = await resolveGifUrl(firstUrl);
      if (resolvedGif) {
        payload.media = { type: 'image', url: resolvedGif, isScraped: true };
      } else {
        if (/\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(firstUrl)) {
          payload.media = { type: 'image', url: firstUrl };
        } else if (/\.(mp4|webm|mov)(\?.*)?$/i.test(firstUrl)) {
          payload.media = { type: 'video', url: firstUrl };
        } else if (/\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(firstUrl)) {
          payload.media = { type: 'audio', url: firstUrl };
        }
      }
    }
  }

  // Si aucun média n'est détecté mais qu'il y a du texte, on considère que c'est une annonce textuelle
  if (!payload.media && payload.content && payload.content.trim().length > 0) {
    payload.media = {
      type: 'text',
      url: null
    };
  }

  // Si on a un média ou texte à afficher
  if (payload.media) {
    // Ajouter à l'historique
    mediaHistory.unshift(payload);
    if (mediaHistory.length > MAX_HISTORY) {
      mediaHistory.pop();
    }

    // Diffuser à tous les navigateurs connectés
    io.emit('media_cast', payload);
    console.log(`📺 Média diffusé : [Type: ${payload.media.type}]`);
  }
}

// Route API pour mettre à jour la configuration en temps réel (optionnel)
app.post('/api/config', (req, res) => {
  const { token, channelId } = req.body;
  if (!token || !channelId) {
    return res.status(400).json({ error: 'Token et Channel ID requis' });
  }

  // Mettre à jour l'environnement en mémoire
  process.env.DISCORD_TOKEN = token;
  process.env.CHANNEL_ID = channelId;

  // Déconnecter l'ancien bot si existant
  if (discordClient) {
    try {
      discordClient.destroy();
    } catch (e) {
      console.error(e);
    }
  }

  // Re-initialiser
  initDiscord();
  res.json({ success: true, message: 'Configuration mise à jour et reconnexion lancée.' });
});

// Route API pour simuler l'envoi d'un média (pour tester sans bot)
app.post('/api/test-cast', async (req, res) => {
  const { author, content, mediaType, mediaUrl } = req.body;
  
  const mockMessage = {
    id: 'test_' + Date.now(),
    createdAt: new Date(),
    author: {
      username: author || 'Testeur VIP 🌟',
      displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png'
    },
    content: content || 'Ceci est un message de test en direct ! 🎉',
    attachments: new Map()
  };

  if (mediaType && mediaType !== 'text') {
    const defaultUrls = {
      image: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1080',
      video: 'https://assets.mixkit.co/videos/preview/mixkit-nebula-of-stars-in-space-18451-large.mp4',
      audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
    };

    mockMessage.attachments.set('1', {
      url: mediaUrl || defaultUrls[mediaType],
      name: `test_file.${mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'mp3'}`,
      contentType: `${mediaType}/${mediaType === 'image' ? 'jpeg' : mediaType === 'video' ? 'mp4' : 'mpeg'}`
    });
  }

  await processMessage(mockMessage);
  res.json({ success: true, message: 'Média de test diffusé avec succès.' });
});

// Route API pour récupérer l'historique et le statut
app.get('/api/status', (req, res) => {
  res.json({ botStatus, mediaHistory });
});

// Route API pour fermer complètement l'application
app.post('/api/quit', (req, res) => {
  res.json({ success: true, message: 'Fermeture de l\'application...' });
  console.log('🛑 Demande de fermeture reçue depuis l\'interface web. Arrêt en cours...');
  
  if (discordClient) {
    try {
      discordClient.destroy();
    } catch (e) {}
  }
  
  // Laisser le temps à la réponse de partir avant de tuer le processus
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

// Route API pour vérifier et installer les mises à jour
app.post('/api/update', (req, res) => {
  console.log('🔄 Vérification des mises à jour demandée...');
  exec('git fetch', (err) => {
    if (err) {
      console.error('Erreur git fetch:', err);
      return res.json({ success: false, error: 'Impossible de joindre GitHub pour vérifier les mises à jour.' });
    }
    exec('git status -uno', (err2, stdout) => {
      if (stdout.includes('Your branch is behind')) {
        console.log('📥 Mise à jour trouvée ! Lancement du script de mise à jour...');
        res.json({ success: true, message: 'Mise à jour trouvée. Installation et redémarrage en cours...', updating: true });
        
        setTimeout(() => {
          const launcherPath = path.join(__dirname, 'launcher.ps1');
          console.log('🚀 Lancement de', launcherPath);
          
          // Utilisation de la commande "start" de Windows pour détacher complètement le processus PowerShell
          exec(`start powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "${launcherPath}"`);
          
          if (discordClient) {
            try { discordClient.destroy(); } catch (e) {}
          }
          console.log('🛑 Fermeture du processus actuel pour laisser le launcher prendre le relais.');
          process.exit(0);
        }, 1500);
      } else {
        console.log('✅ Application déjà à jour.');
        res.json({ success: true, message: 'L\'application est déjà à la dernière version.', updating: false });
      }
    });
  });
});

// Socket.io gestion de connexion
io.on('connection', (socket) => {
  console.log(`🔌 Nouveau client web connecté [ID: ${socket.id}]`);
  
  // Envoyer le statut et l'historique de démarrage
  socket.emit('init', {
    botStatus,
    mediaHistory
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client web déconnecté [ID: ${socket.id}]`);
  });

  // Gérer la mise à jour des paramètres depuis le tableau de bord
  socket.on('update_settings', (newSettings) => {
    currentSettings = { ...currentSettings, ...newSettings };
    botStatus.settings = currentSettings;
    console.log(`⚙️ Paramètres mis à jour :`, currentSettings);

    // Gérer l'ajout/suppression du démarrage automatique
    if (newSettings.windowsStartup !== undefined) {
      handleWindowsStartup(newSettings.windowsStartup);
    }
    
    // Sauvegarder les paramètres dans le fichier JSON pour qu'ils survivent aux redémarrages
    try {
      fs.writeFileSync(settingsFilePath, JSON.stringify(currentSettings, null, 2), 'utf8');
      console.log(`💾 Paramètres sauvegardés dans le fichier.`);
    } catch (e) {
      console.error("❌ Erreur lors de la sauvegarde des paramètres :", e.message);
    }

    // Diffuser les nouveaux paramètres à tous les autres clients (pour que l'overlay se mette à jour instantanément)
    io.emit('settings_updated', currentSettings);
  });
});

// Démarrer Discord
initDiscord();

// Démarrer le serveur HTTP
httpServer.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SERVEUR DISCORD MEDIA CAST DÉMARRÉ !`);
  console.log(`🌐 Écran de diffusion accessible sur : http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});

httpServer.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`❌ Le port ${PORT} est déjà utilisé ! L'application tourne probablement déjà en arrière-plan.`);
    process.exit(0);
  } else {
    console.error('Erreur serveur:', e);
  }
});
