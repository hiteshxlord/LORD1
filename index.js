import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField
} from 'discord.js';
import { writeFileSync, readFileSync } from 'fs';
import express from 'express'; // <-- Added for web server

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// === File storage ===
const warningsFile = 'warnings.json';
const logChannelFile = 'logChannel.json';

function getWarnings() {
  try {
    return JSON.parse(readFileSync(warningsFile));
  } catch {
    return {};
  }
}

function saveWarnings(warnings) {
  writeFileSync(warningsFile, JSON.stringify(warnings, null, 2));
}

function getLogChannel() {
  try {
    return JSON.parse(readFileSync(logChannelFile)).channelId;
  } catch {
    return null;
  }
}

function setLogChannel(channelId) {
  writeFileSync(logChannelFile, JSON.stringify({ channelId }, null, 2));
}

// === Slash commands ===
const commands = [
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for ban')),

  new SlashCommandBuilder()
    .setName('delwarn')
    .setDescription('Delete the most recent warning from a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to delete warning from').setRequired(true)),

  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Set or view the log channel')
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel for logs')),

  new SlashCommandBuilder()
    .setName('nickname')
    .setDescription("Change a user's nickname")
    .addUserOption(opt => opt.setName('user').setDescription('User to change nickname').setRequired(true))
    .addStringOption(opt => opt.setName('nickname').setDescription('New nickname').setRequired(true)),

  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete multiple messages from a channel')
    .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to delete (1–100)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Temporarily ban a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
    .addIntegerOption(opt => opt.setName('time').setDescription('Duration').setRequired(true))
    .addStringOption(opt => opt.setName('unit').setDescription('Time unit: s/h/d').setRequired(true)),

  new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Assign a role to a user temporarily')
    .addUserOption(opt => opt.setName('user').setDescription('User to assign role').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role to assign').setRequired(true))
    .addIntegerOption(opt => opt.setName('time').setDescription('Duration').setRequired(true))
    .addStringOption(opt => opt.setName('unit').setDescription('Time unit (s/h/d)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for warning').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("View a user's warnings")
    .addUserOption(opt => opt.setName('user').setDescription('User to view warnings for').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true)),
].map(cmd => cmd.toJSON());

// === Register commands ===
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands('YOUR_CLIENT_ID', 'YOUR_GUILD_ID'),
      { body: commands }
    );
    console.log('✅ Commands registered');
  } catch (err) {
    console.error('Command registration failed:', err);
  }
})();

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// === Logging helper ===
function logAction(action, user, staff, reason, timestamp) {
  const channelId = getLogChannel();
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(`🪵 ${action.toUpperCase()} Logged`)
    .addFields(
      { name: 'User', value: user === 'N/A' ? 'N/A' : `<@${user}>`, inline: true },
      { name: 'Staff', value: staff, inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: false },
      { name: 'Time', value: timestamp, inline: false }
    );
  channel.send({ embeds: [embed] }).catch(() => {});
}

// === Command handler ===
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const warnings = getWarnings();
  const timestamp = new Date().toLocaleString();
  const staffMember = interaction.user.tag;

  // --- All your commands code here ---
  // (Keep your existing warn, purge, logs, delwarn, nickname, tempban, warnings, temprole handlers)
  // No changes needed in this part.
});

client.login(process.env.DISCORD_TOKEN);

// === Tiny web server to keep Render happy ===
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(PORT, () => {
  console.log(`✅ Web server listening on port ${PORT}`);
});
