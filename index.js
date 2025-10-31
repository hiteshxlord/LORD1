import 'dotenv/config';
import express from 'express';
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

// === Discord Client Setup ===
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
      Routes.applicationGuildCommands('1432713271043035136', '1430907724224266333'),
      { body: commands }
    );
    console.log('✅ Commands registered');
  } catch (err) {
    console.error('Command registration failed:', err);
  }
})();

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

// === Command Handler ===
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const warnings = getWarnings();
  const timestamp = new Date().toLocaleString();
  const staffMember = interaction.user.tag;

  // --- WARN ---
  if (commandName === 'warn') {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    if (!warnings[user.id]) warnings[user.id] = [];
    warnings[user.id].push({ reason, time: timestamp });
    saveWarnings(warnings);
    logAction('warn', user.id, staffMember, reason, timestamp);

    const warnEmbed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('⚠️ Warning Notice')
      .addFields(
        { name: 'Server', value: interaction.guild.name, inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Time', value: timestamp, inline: false }
      );

    try {
      await user.send({ embeds: [warnEmbed] });
    } catch {
      console.log(`⚠️ Could not DM ${user.tag}`);
    }

    await interaction.reply(`<@${user.id}> has been warned for: **${reason}**`);
  }

  // --- PURGE ---
  else if (commandName === 'purge') {
    const amount = interaction.options.getInteger('amount');
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply('❌ You lack Manage Messages permission.');
    if (amount < 1 || amount > 100)
      return interaction.reply('Please choose a number between 1 and 100.');

    const fetched = await interaction.channel.messages.fetch({ limit: amount });
    const deleted = await interaction.channel.bulkDelete(fetched, true);

    let attachmentCount = 0;
    const messagesContent = [...fetched.values()]
      .reverse()
      .map(m => {
        attachmentCount += m.attachments.size;
        return `**${m.author.tag}:** ${m.content || (m.attachments.size ? '*[Attachment]*' : '*[Embed]*')}`;
      })
      .join('\n')
      .slice(0, 1900);

    await interaction.reply(`🧹 Deleted **${deleted.size}** messages (${attachmentCount} attachments).`);

    const channelId = getLogChannel();
    if (channelId) {
      const logChannel = client.channels.cache.get(channelId);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle('🪵 PURGE Logged')
          .addFields(
            { name: 'Staff', value: staffMember, inline: true },
            { name: 'Count', value: `${deleted.size}`, inline: true },
            { name: 'Attachments', value: `${attachmentCount}`, inline: true },
            { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: false },
            { name: 'Messages', value: messagesContent || '*No readable messages*', inline: false },
            { name: 'Time', value: timestamp, inline: false }
          )
          .setFooter({ text: 'Snapshot of deleted messages' });
        await logChannel.send({ embeds: [embed] });
      }
    }
  }

  // --- LOGS ---
  else if (commandName === 'logs') {
    const channel = interaction.options.getChannel('channel');
    if (channel && channel.type === ChannelType.GuildText) {
      setLogChannel(channel.id);
      await interaction.reply(`✅ Log channel set to <#${channel.id}>`);
    } else {
      const current = getLogChannel();
      await interaction.reply(current ? `📝 Current log channel: <#${current}>` : '⚠️ No log channel set.');
    }
  }

  // --- DELWARN ---
  else if (commandName === 'delwarn') {
    const user = interaction.options.getUser('user');
    if (warnings[user.id]?.length > 0) {
      warnings[user.id].pop();
      saveWarnings(warnings);
      logAction('delwarn', user.id, staffMember, 'Removed last warning', timestamp);
      await interaction.reply(`Last warning removed for <@${user.id}>.`);
    } else {
      await interaction.reply(`<@${user.id}> has no warnings.`);
    }
  }

  // --- NICKNAME ---
  else if (commandName === 'nickname') {
    const user = interaction.options.getUser('user');
    const nickname = interaction.options.getString('nickname');
    const member = await interaction.guild.members.fetch(user.id);
    try {
      await member.setNickname(nickname);
      await interaction.reply(`<@${user.id}>’s nickname has been changed to **${nickname}**.`);
      logAction('nickname', user.id, staffMember, nickname, timestamp);
    } catch {
      await interaction.reply(`Failed to change nickname for <@${user.id}>.`);
    }
  }

  // --- TEMPBAN ---
  else if (commandName === 'tempban') {
    const user = interaction.options.getUser('user');
    const time = interaction.options.getInteger('time');
    const unit = interaction.options.getString('unit');
    const member = await interaction.guild.members.fetch(user.id);
    let duration;

    if (unit === 's') duration = time * 1000;
    else if (unit === 'h') duration = time * 60 * 60 * 1000;
    else if (unit === 'd') duration = time * 24 * 60 * 60 * 1000;
    else return interaction.reply('Invalid unit. Use `s`, `h`, or `d`.');

    try {
      await member.ban({ reason: `Temp ban for ${time}${unit}` });
      await interaction.reply(`<@${user.id}> has been temporarily banned for **${time}${unit}**.`);
      logAction('tempban', user.id, staffMember, `${time}${unit}`, timestamp);
      setTimeout(async () => {
        await interaction.guild.members.unban(user.id);
      }, duration);
    } catch {
      await interaction.reply(`Failed to temp-ban <@${user.id}>.`);
    }
  }

  // --- WARNINGS ---
  else if (commandName === 'warnings') {
    const user = interaction.options.getUser('user');
    if (warnings[user.id]?.length) {
      const list = warnings[user.id].map((w, i) => `**#${i + 1}:** ${w.reason} (${w.time})`).join('\n');
      await interaction.reply(`<@${user.id}> has the following warnings:\n${list}`);
    } else {
      await interaction.reply(`<@${user.id}> has no warnings.`);
    }
  }

  // --- TEMPROLE ---
  else if (commandName === 'temprole') {
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const time = interaction.options.getInteger('time');
    const unit = interaction.options.getString('unit');
    let ms;

    if (unit === 's') ms = time * 1000;
    else if (unit === 'h') ms = time * 60 * 60 * 1000;
    else if (unit === 'd') ms = time * 24 * 60 * 60 * 1000;
    else return interaction.reply('Invalid time unit. Use `s`, `h`, or `d`.');

    const member = await interaction.guild.members.fetch(user.id);
    try {
      await member.roles.add(role);
      await interaction.reply(`<@${user.id}> has been given the **${role.name}** role for **${time}${unit}**.`);
      logAction('temprole', user.id, staffMember, `${role.name} for ${time}${unit}`, timestamp);
      setTimeout(async () => {
        await member.roles.remove(role);
      }, ms);
    } catch {
      await interaction.reply(`Failed to assign ${role.name} to <@${user.id}>.`);
    }
  }
});

// === Ready Event ===
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// === Start Discord Bot ===
client.login(process.env.DISCORD_TOKEN);

// === Tiny web server to keep Render happy ===
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server listening on port ${PORT}`));
