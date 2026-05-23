// Client-side Application Logic for Discord Media Cast

// Variables globales
let socket;
let currentBotStatus = {};
let currentSettings = { mediaDuration: 5000, textScale: 1.0, ambientGlow: true, overlayPosition: 'top-right', windowsStartup: true };
let mediaHistoryList = [];
let activeMediaId = null;
let mediaTimeout = null;

// Paramètres utilisateur
let ttsEnabled = false;
const defaultAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';

// Web Audio API pour le visualiseur de spectre
let audioCtx = null;
let analyser = null;
let source = null;
let animationFrameId = null;
let syntheticWavePhase = 0; // Fallback d'onde synthétique si pas d'interaction utilisateur

// Éléments du DOM
const ambientBackdrop = document.getElementById('ambientBackdrop');
const theaterViewport = document.getElementById('theaterViewport');
const idleScreen = document.getElementById('idleScreen');
const mediaDisplayContainer = document.getElementById('mediaDisplayContainer');
const mediaHeader = document.getElementById('mediaHeader');
const authorAvatar = document.getElementById('authorAvatar');
const authorName = document.getElementById('authorName');
const actionTag = document.getElementById('actionTag');
const mediaCaption = document.getElementById('mediaCaption');
const captionText = document.getElementById('captionText');

// Présentateurs individuels
const imagePresenter = document.getElementById('imagePresenter');
const displayedImage = document.getElementById('displayedImage');

const videoPresenter = document.getElementById('videoPresenter');
const displayedVideo = document.getElementById('displayedVideo');

const audioPresenter = document.getElementById('audioPresenter');
const displayedAudio = document.getElementById('displayedAudio');
const audioCover = document.getElementById('audioCover');
const audioFilename = document.getElementById('audioFilename');
const audioAuthor = document.getElementById('audioAuthor');
const waveformCanvas = document.getElementById('waveformCanvas');

const textPresenter = document.getElementById('textPresenter');
const displayedText = document.getElementById('displayedText');

// Éléments de contrôle / statut
const botStatusPill = document.getElementById('botStatusPill');
const botStatusText = document.getElementById('botStatusText');
const historyListDiv = document.getElementById('historyList');
const ttsIcon = document.getElementById('ttsIcon');
const btnTTS = document.getElementById('btnTTS');

// Initialisation au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
  // Vérifier si on est en mode overlay (transparence)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('overlay') === 'true') {
    document.body.classList.add('overlay-mode');
  }

  initSocket();
  setupEventListeners();
  drawSyntheticWave(); // Lancer l'animation par défaut pour le visualiseur audio
});

// Connexion au serveur via Socket.io
function initSocket() {
  socket = io();

  // Événement d'initialisation (statut + historique existant)
  socket.on('init', (data) => {
    console.log('🔌 Connecté au serveur. Données d\'initialisation reçues:', data);
    updateBotStatus(data.botStatus);
    
    mediaHistoryList = data.mediaHistory || [];
    renderHistory();
    
    // Si un média a déjà été diffusé, l'afficher directement
    if (mediaHistoryList.length > 0) {
      displayMedia(mediaHistoryList[0]);
    }
  });

  // Changement de statut du bot
  socket.on('status_change', (status) => {
    console.log('🤖 Statut du bot mis à jour:', status);
    updateBotStatus(status);
  });

  // Nouveau média reçu en direct !
  socket.on('media_cast', (payload) => {
    console.log('📺 Nouveau média reçu pour diffusion:', payload);
    
    // Ajouter en tête de liste locale
    mediaHistoryList.unshift(payload);
    if (mediaHistoryList.length > 10) mediaHistoryList.pop();
    
    renderHistory();
    displayMedia(payload);
    
    // Jouer le TTS si activé
    if (ttsEnabled) {
      speakMessage(payload);
    }
  });

  // Mise à jour des paramètres par un autre client
  socket.on('settings_updated', (settings) => {
    applySettings(settings);
  });
}

// Configuration des écouteurs d'événements UI
function setupEventListeners() {
  // Ajuster la taille du canvas visualiseur lors du redimensionnement
  window.addEventListener('resize', () => {
    const canvas = document.getElementById('waveformCanvas');
    if (canvas) {
      canvas.width = canvas.parentElement.clientWidth;
    }
  });

  // Autoriser l'AudioContext sur interaction utilisateur
  document.body.addEventListener('click', initAudioContext, { once: true });
}

// Mise à jour visuelle du statut du bot Discord
function updateBotStatus(status) {
  currentBotStatus = status;

  // Mise à jour de la pilule de statut dans le footer
  botStatusPill.className = 'connection-pill';
  if (!status.configured) {
    botStatusPill.classList.add('status-disconnected');
    botStatusText.textContent = 'Non configuré ⚙️';
  } else if (status.error) {
    botStatusPill.classList.add('status-error');
    botStatusText.textContent = 'Erreur Bot ⚠️';
  } else if (status.ready) {
    botStatusPill.classList.add('status-connected');
    botStatusText.textContent = `En ligne : #${status.channelName}`;
  } else {
    botStatusPill.classList.add('status-disconnected');
    botStatusText.textContent = 'Connexion en cours...';
  }

  // Mises à jour des détails dans le modal de config
  const detailBotOnline = document.getElementById('detailBotOnline');
  const detailChannelName = document.getElementById('detailChannelName');
  const detailConfig = document.getElementById('detailConfig');
  const statusModalIcon = document.getElementById('statusModalIcon');
  const statusModalTitle = document.getElementById('statusModalTitle');
  const statusModalDesc = document.getElementById('statusModalDesc');

  if (status.settings) {
    applySettings(status.settings);
  }

  if (!status.configured) {
    detailBotOnline.className = 'badge badge-error';
    detailBotOnline.textContent = 'Non';
    detailChannelName.className = 'badge badge-neutral';
    detailChannelName.textContent = '-';
    detailConfig.className = 'badge badge-error';
    detailConfig.textContent = 'Incomplète';
    
    statusModalIcon.className = 'fa-solid fa-circle-info';
    statusModalIcon.style.color = 'var(--warning)';
    statusModalTitle.textContent = 'Configuration Requise';
    statusModalDesc.textContent = 'Le bot Discord n\'est pas configuré. Remplissez le formulaire d\'édition.';
  } else if (status.error) {
    detailBotOnline.className = 'badge badge-error';
    detailBotOnline.textContent = 'Erreur';
    detailChannelName.className = 'badge badge-neutral';
    detailChannelName.textContent = '-';
    detailConfig.className = 'badge badge-success';
    detailConfig.textContent = 'Configurée';

    statusModalIcon.className = 'fa-solid fa-triangle-exclamation';
    statusModalIcon.style.color = 'var(--danger)';
    statusModalTitle.textContent = 'Erreur de Connexion';
    statusModalDesc.textContent = status.error;
  } else if (status.ready) {
    detailBotOnline.className = 'badge badge-success';
    detailBotOnline.textContent = 'Oui';
    detailChannelName.className = 'badge badge-success';
    detailChannelName.textContent = `#${status.channelName}`;
    detailConfig.className = 'badge badge-success';
    detailConfig.textContent = 'Configurée';

    statusModalIcon.className = 'fa-solid fa-circle-check';
    statusModalIcon.style.color = 'var(--success)';
    statusModalTitle.textContent = 'Bot Connecté et Prêt !';
    statusModalDesc.textContent = `Le bot '${status.botName}' surveille activement le salon #${status.channelName}. Tout média posté sera diffusé instantanément.`;
  }
}

// Rendu et affichage d'un média à l'écran
function displayMedia(payload) {
  if (!payload || !payload.media) return;

  activeMediaId = payload.id;

  // Annuler le précédent compte à rebours de disparition
  if (mediaTimeout) {
    clearTimeout(mediaTimeout);
    mediaTimeout = null;
  }

  // Mettre à jour l'historique visuellement (active class)
  const items = document.querySelectorAll('.history-item');
  items.forEach(item => {
    if (item.dataset.id === payload.id) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Arrêter les lecteurs en cours
  stopActivePlayers();

  // Masquer l'écran d'attente (Idle) et afficher le conteneur principal
  idleScreen.classList.add('hidden');
  mediaDisplayContainer.classList.remove('hidden');

  // Remplir les métadonnées de l'auteur
  authorAvatar.src = payload.author.avatar || defaultAvatar;
  authorName.textContent = payload.author.username;
  
  // Tag d'action en fonction du type de média
  const mediaType = payload.media.type;
  if (mediaType === 'image') actionTag.textContent = 'a partagé une image 🖼️';
  else if (mediaType === 'video') actionTag.textContent = 'a partagé une vidéo 📹';
  else if (mediaType === 'audio') actionTag.textContent = 'a lancé une musique 🎵';
  else actionTag.textContent = 'a partagé un message 💬';

  // Cacher tous les présentateurs
  imagePresenter.classList.add('hidden');
  videoPresenter.classList.add('hidden');
  audioPresenter.classList.add('hidden');
  textPresenter.classList.add('hidden');

  // Si c'est du texte brut, l'utilisateur ne veut voir QUE le texte (pas d'en-tête de profil)
  if (mediaType === 'text') {
    mediaHeader.classList.add('hidden');
  } else {
    mediaHeader.classList.remove('hidden');
  }

  // Définir l'arrière-plan dynamique flouté (Ambient Blur)
  if (payload.media.url && mediaType !== 'text') {
    ambientBackdrop.style.backgroundImage = `url('${payload.media.url}')`;
  } else {
    // Si c'est du texte, mettre l'avatar flouté en fond pour rester stylé !
    ambientBackdrop.style.backgroundImage = `url('${payload.author.avatar || defaultAvatar}')`;
  }

  // Affichage selon le type de média
  switch (mediaType) {
    case 'image':
      displayedImage.src = payload.media.url;
      imagePresenter.classList.remove('hidden');
      break;

    case 'video':
      displayedVideo.src = payload.media.url;
      videoPresenter.classList.remove('hidden');
      
      // Configuration pour les GIFs en mp4 (Tenor/Giphy)
      const isGifVideo = /tenor\.com|giphy\.com|gfycat\.com/i.test(payload.media.url);
      displayedVideo.loop = false; // Ne pas boucler pour que le GIF/vidéo ait une durée limitée (jusqu'à sa fin)
      displayedVideo.autoplay = true;
      displayedVideo.setAttribute('playsinline', '');
      
      // Quand la vidéo ou le GIF mp4 est terminé, on cache le média immédiatement
      displayedVideo.onended = () => {
        hideMedia();
      };
      
      // En overlay, on mute par défaut pour éviter les surprises, et on cache les contrôles
      if (isOverlay) {
        displayedVideo.muted = true;
        displayedVideo.removeAttribute('controls');
      } else {
        displayedVideo.muted = isGifVideo; // Muted si c'est un GIF sur l'interface normale
        if (!isGifVideo) displayedVideo.setAttribute('controls', 'controls');
        else displayedVideo.removeAttribute('controls');
      }
      
      // Forcer le rechargement de la vidéo avec les nouveaux attributs
      displayedVideo.load();
      
      // Essayer de lancer la vidéo
      const playPromise = displayedVideo.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn("L'autoplay vidéo a été bloqué par le navigateur. Muting et tentative...", err);
          displayedVideo.muted = true;
          displayedVideo.play().catch(e => console.error("Echec total de lecture vidéo", e));
        });
      }
      break;

    case 'audio':
      displayedAudio.src = payload.media.url;
      audioPresenter.classList.remove('hidden');
      
      // Mettre à jour la carte audio
      audioFilename.textContent = payload.media.name || 'Fichier Audio';
      audioAuthor.textContent = `Posté par ${payload.author.username}`;
      audioCover.src = payload.author.avatar || defaultAvatar;

      // Essayer de lancer l'audio
      displayedAudio.play().then(() => {
        connectAudioVisualizer();
      }).catch(err => {
        console.warn("L'autoplay audio nécessite une action utilisateur préalable.", err);
      });
      break;

    case 'text':
      displayedText.textContent = payload.content;
      textPresenter.classList.remove('hidden');
      break;
  }

  // Afficher la légende textuelle s'il y en a une (en plus de l'image/vidéo/audio)
  if (mediaType !== 'text' && payload.content && payload.content.trim().length > 0) {
    // Si le contenu n'est pas juste l'URL du média lui-même
    if (payload.content.trim() !== payload.media.url) {
      captionText.textContent = payload.content;
      mediaCaption.classList.remove('hidden');
    } else {
      mediaCaption.classList.add('hidden');
    }
  } else {
    mediaCaption.classList.add('hidden');
  }

  // Déclencher une réanimation CSS pour donner un effet d'entrée premium
  mediaDisplayContainer.style.animation = 'none';
  mediaDisplayContainer.offsetHeight; // déclencher reflow
  mediaDisplayContainer.style.animation = 'mediaEnter 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards';

  // Programmer le masquage automatique du média (texte/image)
  // Pour les vidéos et audios, on donne un timeout de 30 secondes pour les laisser se terminer (onended s'en chargera plus tôt)
  const timeoutDuration = (mediaType === 'video' || mediaType === 'audio') ? 30000 : (currentSettings.mediaDuration || 5000);
  mediaTimeout = setTimeout(() => {
    hideMedia();
  }, timeoutDuration);
}

// Stopper tous les lecteurs actifs (vidéo, audio, parole TTS)
function stopActivePlayers() {
  try {
    if (displayedVideo) {
      displayedVideo.pause();
      displayedVideo.src = '';
    }
  } catch (e) {
    console.error("Erreur lors de l'arrêt de la vidéo :", e);
  }

  try {
    if (displayedAudio) {
      displayedAudio.pause();
      displayedAudio.src = '';
    }
  } catch (e) {
    console.error("Erreur lors de l'arrêt de l'audio :", e);
  }
  
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch (e) {
    console.error("Erreur lors de l'arrêt du TTS :", e);
  }
}

// Masquer le média et repasser en mode veille
function hideMedia() {
  stopActivePlayers();
  
  // Transition douce : retour à l'écran de veille
  mediaDisplayContainer.classList.add('hidden');
  idleScreen.classList.remove('hidden');
  
  // Vider le fond ambiant flouté pour effacer tout filtre ou résidu visuel
  if (ambientBackdrop) {
    ambientBackdrop.style.backgroundImage = 'none';
  }
  
  activeMediaId = null;
  
  // Mettre à jour l'historique visuellement pour enlever l'état actif
  const items = document.querySelectorAll('.history-item');
  items.forEach(item => item.classList.remove('active'));
  
  if (mediaTimeout) {
    clearTimeout(mediaTimeout);
    mediaTimeout = null;
  }
}

// ==========================================================================
// Rendu et Gestion de l'Historique dans le Footer
// ==========================================================================
function renderHistory() {
  historyListDiv.innerHTML = '';
  
  if (mediaHistoryList.length === 0) {
    historyListDiv.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem; line-height: 40px;">Aucun historique</span>';
    return;
  }

  mediaHistoryList.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'history-item';
    itemDiv.dataset.id = item.id;
    itemDiv.title = `Partagé par ${item.author.username}`;

    if (item.id === activeMediaId) {
      itemDiv.classList.add('active');
    }

    // Afficher une miniature en fonction du média
    if (item.media.type === 'image') {
      const img = document.createElement('img');
      img.src = item.media.url;
      itemDiv.appendChild(img);
    } else if (item.media.type === 'video') {
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-video';
      itemDiv.appendChild(icon);
    } else if (item.media.type === 'audio') {
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-music';
      itemDiv.appendChild(icon);
    } else {
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-comment-dots';
      itemDiv.appendChild(icon);
    }

    // Clic pour rejouer/réafficher
    itemDiv.addEventListener('click', () => {
      displayMedia(item);
    });

    historyListDiv.appendChild(itemDiv);
  });
}

// ==========================================================================
// Synthèse Vocale (TTS - Text to Speech)
// ==========================================================================
function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  
  if (ttsEnabled) {
    ttsIcon.className = 'fa-solid fa-volume-high text-success';
    btnTTS.title = 'Synthèse Vocale (TTS) activée';
    
    // Annonce vocale
    const announce = new SpeechSynthesisUtterance("Synthèse vocale activée.");
    announce.lang = 'fr-FR';
    window.speechSynthesis.speak(announce);
  } else {
    ttsIcon.className = 'fa-solid fa-volume-xmark text-danger';
    btnTTS.title = 'Synthèse Vocale (TTS) désactivée';
    window.speechSynthesis.cancel();
  }
}

function speakMessage(payload) {
  if (!window.speechSynthesis) return;

  // Annuler toute lecture en cours
  window.speechSynthesis.cancel();

  // Texte à prononcer : Auteur + message
  let speechText = '';
  if (payload.media.type === 'text') {
    speechText = `${payload.author.username} annonce : ${payload.content}`;
  } else if (payload.content && payload.content.trim().length > 0 && payload.content.trim() !== payload.media.url) {
    speechText = `${payload.author.username} dit : ${payload.content}`;
  } else {
    speechText = `Nouveau média de ${payload.author.username}`;
  }

  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.lang = 'fr-FR';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  // Choisir une voix française élégante si dispo
  const voices = window.speechSynthesis.getVoices();
  const frVoice = voices.find(v => v.lang.startsWith('fr'));
  if (frVoice) {
    utterance.voice = frVoice;
  }

  window.speechSynthesis.speak(utterance);
}

// ==========================================================================
// Visualiseur de Spectre Audio (Web Audio API & Canvas)
// ==========================================================================
function initAudioContext() {
  if (audioCtx) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;

    // Connecter la balise HTML5 audio à l'analyser
    source = audioCtx.createMediaElementSource(displayedAudio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
  } catch (e) {
    console.error("Impossible d'initialiser l'AudioContext pour le visualiseur :", e);
  }
}

function connectAudioVisualizer() {
  if (!audioCtx) {
    initAudioContext();
  }

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  drawWaveform();
}

function drawWaveform() {
  const canvas = waveformCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth;
  
  const width = canvas.width;
  const height = canvas.height;
  
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  const bufferLength = analyser ? analyser.frequencyBinCount : 0;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    animationFrameId = requestAnimationFrame(draw);

    ctx.clearRect(0, 0, width, height);

    if (analyser && !displayedAudio.paused) {
      // Analyse en direct de la musique
      analyser.getByteFrequencyData(dataArray);

      const barWidth = (width / bufferLength) * 1.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 1.5;

        // Créer un dégradé cyberpunk pour chaque barre
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, '#5865F2'); // Discord Blue
        gradient.addColorStop(1, '#00f2fe'); // Cyber Teal

        ctx.fillStyle = gradient;
        
        // Dessiner des barres arrondies élégantes
        const y = height - barHeight;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth - 2, barHeight, 4);
        } else {
          ctx.rect(x, y, barWidth - 2, barHeight);
        }
        ctx.fill();

        x += barWidth;
      }
    } else {
      // Si en pause ou AudioContext indisponible, dessiner une onde synthétique fluide
      drawSyntheticWaveInternal(ctx, width, height);
    }
  }

  draw();
}

// Onde synthétique de secours animée
function drawSyntheticWave() {
  const canvas = waveformCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth;

  function loop() {
    animationFrameId = requestAnimationFrame(loop);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSyntheticWaveInternal(ctx, canvas.width, canvas.height);
  }
  
  loop();
}

function drawSyntheticWaveInternal(ctx, width, height) {
  ctx.strokeStyle = 'rgba(88, 101, 242, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();

  syntheticWavePhase += 0.05;

  // Dessiner 3 ondes sinus superposées pour un effet d'énergie holographique
  for (let waveIndex = 0; waveIndex < 3; waveIndex++) {
    ctx.beginPath();
    ctx.strokeStyle = waveIndex === 0 
      ? 'rgba(88, 101, 242, 0.5)' 
      : waveIndex === 1 
      ? 'rgba(0, 242, 254, 0.4)' 
      : 'rgba(255, 255, 255, 0.15)';
    
    ctx.lineWidth = waveIndex === 0 ? 3 : 1.5;

    for (let x = 0; x < width; x++) {
      const freq = 0.01 + (waveIndex * 0.005);
      const amp = (height / 3) - (waveIndex * 5);
      const y = (height / 2) + Math.sin(x * freq + syntheticWavePhase + (waveIndex * 2)) * amp;

      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ==========================================================================
// Simulation / Test de Cast (Pour tester immédiatement en local)
// ==========================================================================
function toggleTestPanel() {
  const panel = document.getElementById('testPanel');
  panel.classList.toggle('open');
}

function triggerMockCast(type) {
  const author = document.getElementById('testUser').value || 'Super Testeur 🚀';
  const content = document.getElementById('testText').value;
  
  console.log(`🧪 Déclenchement d'un faux cast de type [${type}]...`);

  fetch('/api/test-cast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author,
      content,
      mediaType: type
    })
  })
  .then(res => res.json())
  .then(data => {
    console.log('✅ Mock cast envoyé :', data);
    // Fermer le panneau après validation
    toggleTestPanel();
  })
  .catch(err => {
    console.error('❌ Erreur de mock cast :', err);
    alert('Erreur lors du test de cast. Le serveur est-il démarré ?');
  });
}

// ==========================================================================
// Plein Écran & Modals
// ==========================================================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.error(`Erreur d'activation plein écran: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

function toggleSetupModal() {
  const modal = document.getElementById('setupModal');
  modal.classList.toggle('hidden');
  
  // Charger les valeurs actuelles si le modal s'ouvre
  if (!modal.classList.contains('hidden')) {
    // Si le token est connu, on le pré-remplit (à moitié masqué pour la sécurité)
    document.getElementById('discordToken').value = '';
    document.getElementById('channelId').value = process.env?.CHANNEL_ID || '';
  }
}

function switchTab(tabId) {
  // Masquer tous les contenus
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  // Enlever la classe active de tous les boutons
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  // Afficher le bon contenu et activer le bon bouton
  document.getElementById(tabId).classList.remove('hidden');
  
  // Retrouver le bouton cliqué pour l'activer
  const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
  if (btn) btn.classList.add('active');
}

function togglePasswordVisibility() {
  const pwdInput = document.getElementById('discordToken');
  const eyeIcon = document.querySelector('.btn-toggle-pwd i');
  
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    eyeIcon.className = 'fa-solid fa-eye-slash';
  } else {
    pwdInput.type = 'password';
    eyeIcon.className = 'fa-solid fa-eye';
  }
}

// Enregistrer la configuration en direct via l'API
function saveConfig(event) {
  event.preventDefault();
  
  const token = document.getElementById('discordToken').value;
  const channelId = document.getElementById('channelId').value;

  console.log('💾 Sauvegarde de la nouvelle configuration Discord...');

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, channelId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert('Configuration mise à jour ! Connexion en cours...');
      toggleSetupModal();
    } else {
      alert('Erreur : ' + data.error);
    }
  })
  .catch(err => {
    console.error('❌ Erreur de sauvegarde config :', err);
    alert('Erreur lors de l\'enregistrement de la configuration.');
  });
}

// ==========================================================================
// Settings Management
// ==========================================================================

function toggleSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  panel.classList.toggle('open');
}

function updateSetting(key, value) {
  if (currentSettings[key] === value) return; // Pas de changement
  currentSettings[key] = value;
  applySettings(currentSettings);
  
  if (socket) {
    socket.emit('update_settings', { [key]: value });
  }
}

function applySettings(settings) {
  currentSettings = { ...currentSettings, ...settings };
  
  // 1. Position de l'overlay
  if (settings.overlayPosition) {
    const vp = document.getElementById('theaterViewport');
    if (vp) {
      vp.className = 'theater-viewport';
      vp.classList.add('pos-' + settings.overlayPosition);
    }
    const buttons = document.querySelectorAll('.pos-btn');
    if (buttons.length > 0) {
      buttons.forEach(btn => btn.classList.remove('active'));
      const activeBtn = document.getElementById('pos-' + settings.overlayPosition);
      if (activeBtn) activeBtn.classList.add('active');
    }
  }

  // 2. Durée d'affichage
  if (settings.mediaDuration !== undefined) {
    const slider = document.getElementById('mediaDurationSlider');
    const valDisplay = document.getElementById('mediaDurationValue');
    if (slider && valDisplay) {
      slider.value = settings.mediaDuration / 1000;
      valDisplay.textContent = (settings.mediaDuration / 1000) + 's';
    }
  }

  // 3. Échelle du texte
  if (settings.textScale !== undefined) {
    document.documentElement.style.setProperty('--text-scale', settings.textScale);
    const slider = document.getElementById('textScaleSlider');
    const valDisplay = document.getElementById('textScaleValue');
    if (slider && valDisplay) {
      slider.value = settings.textScale;
      valDisplay.textContent = settings.textScale.toFixed(1) + 'x';
    }
  }

  // 4. Glossy Glow (Ambient background)
  if (settings.ambientGlow !== undefined) {
    if (settings.ambientGlow) {
      document.body.classList.remove('no-glow');
    } else {
      document.body.classList.add('no-glow');
    }
    const toggle = document.getElementById('ambientGlowToggle');
    if (toggle) toggle.checked = settings.ambientGlow;
  }

  // 5. Démarrage avec Windows
  if (settings.windowsStartup !== undefined) {
    const toggle = document.getElementById('windowsStartupToggle');
    if (toggle) toggle.checked = settings.windowsStartup;
  }
}

// ==========================================================================
// Application Lifecycle
// ==========================================================================

function quitApplication() {
  if (confirm("Êtes-vous sûr de vouloir fermer complètement l'application Discord Media Cast ? L'overlay disparaîtra et le bot sera déconnecté.")) {
    fetch('/api/quit', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        console.log(data.message);
        // Fermer la fenêtre si possible, sinon afficher un message
        document.body.innerHTML = `
          <div style="display:flex; height:100vh; align-items:center; justify-content:center; flex-direction:column; background:#070913; color:#fff; font-family:Outfit,sans-serif;">
            <i class="fa-solid fa-power-off" style="font-size: 4rem; color: var(--danger); margin-bottom: 1rem;"></i>
            <h2>Application fermée</h2>
            <p style="color: var(--text-muted); margin-top: 1rem;">Vous pouvez fermer cette fenêtre.</p>
          </div>
        `;
        if (window.require) {
          try {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('quit-app');
          } catch(e) {}
        }
      })
      .catch(err => console.error("Erreur lors de la fermeture:", err));
  }
}

function checkForUpdates() {
  const icon = document.getElementById('updateIcon');
  if (icon) icon.classList.add('fa-spin');
  
  fetch('/api/update', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (icon) icon.classList.remove('fa-spin');
      if (!data.success) {
        alert("Erreur: " + data.error);
      } else if (data.updating) {
        alert("Une mise à jour a été trouvée et est en cours d'installation. L'application va redémarrer dans un instant. L'écran va se recharger automatiquement.");
        // Recharger la page après 8 secondes pour laisser le temps au redémarrage
        setTimeout(() => {
          window.location.reload();
        }, 8000);
      } else {
        alert(data.message);
      }
    })
    .catch(err => {
      if (icon) icon.classList.remove('fa-spin');
      console.error('Erreur lors de la vérification de mise à jour:', err);
      alert("Impossible de vérifier les mises à jour (le serveur est peut-être éteint).");
    });
}


