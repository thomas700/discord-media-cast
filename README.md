# 📺 Discord Media Cast ✨

> Diffusez en temps réel sur grand écran (PC, TV, tablette, smartphone) tout ce qui est partagé dans votre salon Discord (images, vidéos, musiques/audios, textes) grâce à une interface web ultra-premium et animée.

---

## 🌟 Fonctionnalités Premium

- **Temps Réel Ultra-Rapide (<100ms)** : Liaison bidirectionnelle avec Socket.io de votre salon Discord à vos navigateurs.
- **Ambient Glow Backing** : Effet d'arrière-plan flouté dynamique basé sur le média affiché pour une immersion totale.
- **Lecteur Intelligent Multi-Format** :
  - **Images** : Mode cinéma plein écran avec un effet de zoom lent (Ken Burns).
  - **Vidéos** : Lecteur HTML5 plein écran personnalisé avec démarrage automatique.
  - **Audios & Musique** : Visualiseur de spectre d'ondes sonores (Spectrum Analyzer) réactif qui bouge au rythme du son.
  - **Textes** : Cartouche d'annonce "breaking news" holographique et lumineuse.
- **Synthèse Vocale (TTS)** : Option pour lire les textes et annonces à voix haute (Web Speech API).
- **Simulateur de Cast Intégré** : Un tiroir de test pour simuler des diffusions en 1 clic sans avoir configuré Discord (idéal pour tester immédiatement !).
- **Guide pas à pas interactif** : Si votre bot n'est pas encore prêt, le site vous accompagne de A à Z.

---

## 🚀 Démarrage Rapide

### 1. Prérequis
Assurez-vous que [Node.js](https://nodejs.org/) est installé sur votre ordinateur.

### 2. Lancer l'application
Ouvrez votre terminal dans le dossier du projet (`C:\Users\lerda\.gemini\antigravity\scratch\discord-media-cast`) et exécutez la commande suivante :

```bash
npm start
```

Le serveur web va démarrer. Vous pouvez accéder à l'interface à cette adresse :
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🧪 Tester Immédiatement (Sans Discord)

Si vous voulez voir l'effet spectaculaire immédiatement sans créer de bot Discord :
1. Lancez le serveur avec `npm start` et ouvrez **[http://localhost:3000](http://localhost:3000)**.
2. Cliquez sur l'icône de fiole 🧪 en bas à droite de l'écran pour ouvrir le **Simulateur de Cast**.
3. Remplissez le texte de test ou laissez par défaut, et cliquez sur **Image**, **Vidéo** ou **Musique**.
4. Regardez la magie opérer en direct à l'écran ! 🌟 *(Vous pouvez même ouvrir plusieurs onglets du navigateur en même temps : ils se synchroniseront instantanément !)*

---

## 🤖 Guide de Configuration Discord (Optionnel)

Pour relier l'application à votre propre serveur Discord, suivez ces étapes simples :

### Étape A : Créer le Bot Discord
1. Rendez-vous sur le **[Discord Developer Portal](https://discord.com/developers/applications)**.
2. Cliquez sur **New Application** en haut à droite, nommez-la (ex: *MediaCastBot*) et validez.
3. Allez dans l'onglet **Bot** à gauche.
4. Activez l'option **Message Content Intent** (Indispensable pour lire le texte et récupérer les pièces jointes).
5. Cliquez sur **Reset Token** et copiez le **Token** affiché (gardez-le secret !).

### Étape B : Inviter le Bot sur votre Serveur
1. Allez dans l'onglet **OAuth2** puis sous-onglet **URL Generator** à gauche.
2. Cochez la case `bot` dans la grille *Scopes*.
3. Dans la grille *Bot Permissions* qui s'affiche en dessous, cochez :
   - `Read Messages/View Channels` (Voir le salon)
   - `Read Message History` (Historique si besoin)
4. Copiez le lien généré tout en bas, collez-le dans un nouvel onglet de navigateur, et invitez le bot sur votre serveur.

### Étape C : Récupérer l'ID du Salon Discord
1. Sur Discord, ouvrez vos **Paramètres utilisateur** > **Avancés**.
2. Activez le **Mode Développeur**.
3. Faites un clic droit sur le salon textuel où vous publierez vos médias, et cliquez sur **Copier l'identifiant**.

### Étape D : Lier à l'Application
Vous avez deux méthodes au choix :

- **Méthode 1 (Web)** : Ouvrez la page **[http://localhost:3000](http://localhost:3000)**, cliquez sur le bouton orange "Non configuré" ou "Déconnecté" en bas à gauche, allez dans l'onglet **Éditer Config**, collez votre Token et votre ID de Salon, et cliquez sur **Sauvegarder**.
- **Méthode 2 (Fichier)** : Ouvrez le fichier `.env` à la racine du projet, collez vos valeurs comme ceci, puis relancez le serveur :
  ```env
  PORT=3000
  DISCORD_TOKEN=MTAxNDk... (votre token)
  CHANNEL_ID=1029384... (votre ID de salon)
  ```

Dès que le bot est en ligne, la pilule en bas à gauche passe au vert **"En ligne : #nom-du-salon"**. Vous pouvez maintenant poster des images, des fichiers audios/mp3 ou des vidéos directement sur Discord pour qu'ils s'affichent instantanément à l'écran !
