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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// === File storage for warnings and log channel ===
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
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for warning').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("View a user's warnings")
    .addUserOption(opt => opt.setName('user').setDescription('User to view warnings for').setRequired(true)),

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
    .setName('kick')
    .setDescription('Kick a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for ban')),

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
].map(cmd => cmd.toJSON());

// === Register slash commands ===
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

// === Slash command handler with proper error handling ===
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const warnings = getWarnings();
  const timestamp = new Date().toLocaleString();
  const staffMember = interaction.user.tag;

  try {
    // WARN
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

    // WARNINGS
    else if (commandName === 'warnings') {
      const user = interaction.options.getUser('user');
      const userWarnings = warnings[user.id] || [];
      if (userWarnings.length === 0) {
        await interaction.reply({ content: `${user.tag} has no warnings.`, ephemeral: true });
        return;
      }
      const warnList = userWarnings.map((w, i) => `**${i + 1}.** ${w.reason} (${w.time})`).join('\n');
      await interaction.reply({ content: `Warnings for ${user.tag}:\n${warnList}`, ephemeral: true });
    }

    // DELWARN
    else if (commandName === 'delwarn') {
      const user = interaction.options.getUser('user');
      if (!warnings[user.id] || warnings[user.id].length === 0) {
        await interaction.reply({ content: `${user.tag} has no warnings.`, ephemeral: true });
        return;
      }
      const removed = warnings[user.id].pop();
      saveWarnings(warnings);
      logAction('delwarn', user.id, staffMember, removed.reason, timestamp);
      await interaction.reply(`✅ Removed last warning from ${user.tag}: **${removed.reason}**`);
    }

    // NICKNAME
    else if (commandName === 'nickname') {
      const user = interaction.options.getUser('user');
      const nickname = interaction.options.getString('nickname');
      const member = interaction.guild.members.cache.get(user.id);
      if (!member) {
        await interaction.reply('❌ User not found in guild.');
        return;
      }
      try {
        await member.setNickname(nickname);
      } catch {
        await interaction.reply('❌ Failed to change nickname.');
        return;
      }
      logAction('nickname', user.id, staffMember, nickname, timestamp);
      await interaction.reply(`✅ Changed nickname of ${user.tag} to **${nickname}**`);
    }

    // PURGE
    else if (commandName === 'purge') {
      const amount = interaction.options.getInteger('amount');
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await interaction.reply('❌ You lack Manage Messages permission.');
        return;
      }
      if (amount < 1 || amount > 100) {
        await interaction.reply('Please choose a number between 1 and 100.');
        return;
      }

      // Defer reply because bulkDelete might take a moment
      await interaction.deferReply();

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

      await interaction.editReply(`🧹 Deleted **${deleted.size}** messages (${attachmentCount} attachments).`);

      const logId = getLogChannel();
      if (logId) {
        const logChannel = client.channels.cache.get(logId);
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

    // LOGS channel setup/view
    else if (commandName === 'logs') {
      const channel = interaction.options.getChannel('channel');
      if (channel && channel.type === ChannelType.GuildText) {
        setLogChannel(channel.id);
        await interaction.reply(`✅ Log channel set to <#${channel.id}>`);
      } else if (!channel) {
        const logId = getLogChannel();
        await interaction.reply(`📌 Current log channel: ${logId ? `<#${logId}>` : 'Not set'}`);
      } else {
        await interaction.reply('❌ Please provide a valid text channel.');
      }
    }

    // Add handlers for other commands (kick, ban, tempban, temprole) here if you want.

  } catch (error) {
    console.error('Error handling command:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred while executing that command.', ephemeral: true });
    } else if (interaction.deferred && !interaction.replied) {
      await interaction.editReply('❌ An error occurred while executing that command.');
    }
  }
});

// === Tiny web server to keep Render happy ===
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server listening on port ${PORT}`));

// === Login ===
client.login(process.env.DISCORD_TOKEN);
