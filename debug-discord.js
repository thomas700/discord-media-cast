import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  console.log('--- Serveurs et Salons ---');
  
  client.guilds.cache.forEach(guild => {
    console.log(`\nServeur : ${guild.name} (ID: ${guild.id})`);
    
    const textChannels = guild.channels.cache.filter(c => c.isTextBased());
    if (textChannels.size === 0) {
      console.log(`  -> Aucun salon textuel trouvé.`);
    } else {
      textChannels.forEach(channel => {
        console.log(`  -> Salon : #${channel.name} (ID: ${channel.id})`);
      });
    }
  });

  console.log('\n--- Fin ---');
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(console.error);
