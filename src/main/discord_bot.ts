import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction
} from 'discord.js'
import { ipcMain } from 'electron'
import { buildModCatalog } from './modCatalog'
import { findModByQuery, getModFolderName } from './modScanner'
import type { ModManifest } from '../shared/types'

// التوكن يُقرأ من متغير البيئة فقط — لا يُكتب داخل الكود أبداً حتى لا يتسرب
// عند توزيع البرنامج. البوت مخصص للتشغيل عند المدير فقط (انظر index.ts).
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN || ''

const CATEGORY_NAMES = {
  graphics: 'الجرافكس',
  audio: 'أصوات الأسلحة',
  bloodfx: 'BloodFX',
  killfx: 'KillFX'
} as const

const slashCommands = [
  new SlashCommandBuilder()
    .setName('list')
    .setDescription('عرض قائمة المودات حسب التصنيف'),
  new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('تحديث قائمة المودات من التطبيق'),
  new SlashCommandBuilder()
    .setName('image')
    .setDescription('تغيير صورة غلاف مود')
    .addStringOption((opt) =>
      opt
        .setName('mod')
        .setDescription('اسم المود أو مجلده (مثل: naff)')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt.setName('url').setDescription('رابط الصورة').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('sound')
    .setDescription('ربط مقطع تجربة صوت (mp4 أقل من 5 ثواني) بمود صوتي')
    .addStringOption((opt) =>
      opt
        .setName('mod')
        .setDescription('اسم مود الصوت (مثل: naff)')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt.setName('url').setDescription('رابط مقطع الصوت mp4 (أقل من 5 ثواني)').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('video')
    .setDescription('ربط مقطع فيديو معاينة (5 ثواني) بأي مود — مثل killfx / bloodfx')
    .addStringOption((opt) =>
      opt
        .setName('mod')
        .setDescription('اسم المود أو مجلده')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt.setName('url').setDescription('رابط الفيديو mp4 (5 ثواني)').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('عرض أوامر البوت')
].map((cmd) => cmd.toJSON())

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

let mods: ModManifest[] = []
let botReady = false

ipcMain.on('mods-updated', (_event, modsList: ModManifest[]) => {
  mods = modsList
  console.log('[Discord Bot] Mods updated:', mods.length)
})

function modDisplayName(mod: ModManifest): string {
  return getModFolderName(mod)
}

async function registerSlashCommands(clientId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN)

  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: [] })
      console.log(`[Discord Bot] Cleared old guild commands in: ${guild.name}`)
    } catch (error) {
      console.error(`[Discord Bot] Failed to clear guild commands in ${guild.name}:`, error)
    }
  }

  await rest.put(Routes.applicationCommands(clientId), { body: slashCommands })
  console.log('[Discord Bot] Registered slash commands: /list /refresh /image /sound /video /help')
}

async function handleListCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const categories = ['graphics', 'audio', 'bloodfx', 'killfx'] as const

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`select-category:${interaction.user.id}`)
    .setPlaceholder('اختر التصنيف')
    .addOptions(
      categories.map((cat) => ({
        label: CATEGORY_NAMES[cat],
        value: cat
      }))
    )

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)

  const embed = new EmbedBuilder()
    .setTitle('قائمة المودات')
    .setDescription('اختر التصنيف لعرض المودات')
    .setColor('#1f4f95')

  await interaction.reply({ embeds: [embed], components: [row] })
}

async function handleCategorySelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const ownerId = interaction.customId.split(':')[1]
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: 'هذه القائمة ليست لك!', ephemeral: true })
    return
  }

  const selectedCategory = interaction.values[0]
  const categoryMods = mods.filter((m) => m.category === selectedCategory)

  if (categoryMods.length === 0) {
    await interaction.update({ content: 'لا توجد مودات في هذا التصنيف', embeds: [], components: [] })
    return
  }

  const modsList = categoryMods
    .map(
      (mod, index) =>
        `${index + 1}. **${mod.nameAr}** \`(${modDisplayName(mod)})\`\n   ${mod.descriptionAr}`
    )
    .join('\n\n')

  const listEmbed = new EmbedBuilder()
    .setTitle(`المودات في ${CATEGORY_NAMES[selectedCategory as keyof typeof CATEGORY_NAMES]}`)
    .setDescription(`${modsList}\n\n**لتغيير الغلاف:** \`/image mod:اسم_المود url:رابط_الصورة\``)
    .setColor('#1f4f95')

  await interaction.update({ embeds: [listEmbed], components: [] })
}

async function handleModAutocomplete(
  interaction: AutocompleteInteraction,
  categoryFilter?: ModManifest['category']
): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase()

  const choices = mods
    .filter((mod) => {
      if (categoryFilter && mod.category !== categoryFilter) return false
      const folder = modDisplayName(mod).toLowerCase()
      return (
        folder.includes(focused) ||
        mod.nameAr.toLowerCase().includes(focused) ||
        mod.name.toLowerCase().includes(focused) ||
        mod.id.toLowerCase().includes(focused)
      )
    })
    .slice(0, 25)
    .map((mod) => ({
      name: `${mod.nameAr} (${modDisplayName(mod)})`.slice(0, 100),
      value: modDisplayName(mod).slice(0, 100)
    }))

  await interaction.respond(choices)
}

client.once(Events.ClientReady, async (readyClient) => {
  botReady = true
  mods = await buildModCatalog()
  console.log(`[Discord Bot] Logged in as ${readyClient.user.tag}`)
  console.log('[Discord Bot] Initial mods loaded:', mods.length)

  try {
    await registerSlashCommands(readyClient.user.id)
  } catch (error) {
    console.error('[Discord Bot] Failed to register slash commands:', error)
  }
})

client.on(Events.Error, (error) => {
  console.error('[Discord Bot] Client error:', error)
})

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === 'image') {
        await handleModAutocomplete(interaction)
      } else if (interaction.commandName === 'sound') {
        await handleModAutocomplete(interaction, 'audio')
      } else if (interaction.commandName === 'video') {
        await handleModAutocomplete(interaction)
      }
      return
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select-category:')) {
      await handleCategorySelect(interaction)
      return
    }

    if (!interaction.isChatInputCommand()) return

    console.log(`[Discord Bot] /${interaction.commandName} from ${interaction.user.tag}`)

    switch (interaction.commandName) {
      case 'help':
        await interaction.reply({
          content:
            '**أوامر البوت:**\n' +
            '`/list` — عرض المودات\n' +
            '`/refresh` — تحديث قائمة المودات\n' +
            '`/image mod:naff url:https://...` — تغيير غلاف مود\n' +
            '`/sound mod:naff url:https://...` — ربط مقطع تجربة صوت (mp4 أقل من 5 ثواني)\n' +
            '`/video mod:naff url:https://...` — ربط مقطع فيديو معاينة (5 ثواني) يُعرض في الكرت\n' +
            '`/help` — هذه القائمة\n\n' +
            '**اسم المود** = اسم المجلد داخل `mods/` (مثل `naff`، `جرافكس ليو`)',
          ephemeral: true
        })
        break

      case 'refresh':
        ipcMain.emit('refresh-mods-request', null)
        mods = await buildModCatalog()
        await interaction.reply({ content: '✅ تم تحديث قائمة المودات', ephemeral: true })
        break

      case 'list':
        await handleListCommand(interaction)
        break

      case 'image': {
        const modQuery = interaction.options.getString('mod', true)
        const imageUrl = interaction.options.getString('url', true)
        const mod = findModByQuery(mods, modQuery)

        if (!mod) {
          const available = mods
            .map((m) => `\`${modDisplayName(m)}\``)
            .slice(0, 10)
            .join(', ')
          await interaction.reply({
            content: `❌ لم يتم العثور على المود **${modQuery}**\n\n**المودات المتاحة:** ${available}${mods.length > 10 ? '...' : ''}`,
            ephemeral: true
          })
          return
        }

        ipcMain.emit('update-mod-image', null, mod.id, imageUrl)
        await interaction.reply({
          content: `✅ تم تغيير غلاف المود **${mod.nameAr}** (\`${modDisplayName(mod)}\`)`,
          ephemeral: true
        })
        break
      }

      case 'sound': {
        const modQuery = interaction.options.getString('mod', true)
        const soundUrl = interaction.options.getString('url', true)

        if (!/^https?:\/\/.+/i.test(soundUrl)) {
          await interaction.reply({ content: '❌ الرابط غير صالح. لازم يبدأ بـ http/https', ephemeral: true })
          return
        }

        const audioMods = mods.filter((m) => m.category === 'audio')
        const mod = findModByQuery(audioMods, modQuery)

        if (!mod) {
          const available = audioMods
            .map((m) => `\`${modDisplayName(m)}\``)
            .slice(0, 10)
            .join(', ')
          await interaction.reply({
            content: `❌ لم يتم العثور على مود صوتي باسم **${modQuery}**\n\n**مودات الصوت المتاحة:** ${available || 'لا يوجد'}${audioMods.length > 10 ? '...' : ''}`,
            ephemeral: true
          })
          return
        }

        ipcMain.emit('update-mod-sound', null, mod.id, soundUrl)
        await interaction.reply({
          content: `✅ تم ربط مقطع تجربة الصوت بالمود **${mod.nameAr}** (\`${modDisplayName(mod)}\`)\nراح يظهر زر **Test Sound** في الكرت.`,
          ephemeral: true
        })
        break
      }

      case 'video': {
        const modQuery = interaction.options.getString('mod', true)
        const videoUrl = interaction.options.getString('url', true)

        if (!/^https?:\/\/.+/i.test(videoUrl)) {
          await interaction.reply({ content: '❌ الرابط غير صالح. لازم يبدأ بـ http/https', ephemeral: true })
          return
        }

        const mod = findModByQuery(mods, modQuery)

        if (!mod) {
          const available = mods
            .map((m) => `\`${modDisplayName(m)}\``)
            .slice(0, 10)
            .join(', ')
          await interaction.reply({
            content: `❌ لم يتم العثور على المود **${modQuery}**\n\n**المودات المتاحة:** ${available}${mods.length > 10 ? '...' : ''}`,
            ephemeral: true
          })
          return
        }

        ipcMain.emit('update-mod-video', null, mod.id, videoUrl)
        await interaction.reply({
          content: `✅ تم ربط مقطع الفيديو بالمود **${mod.nameAr}** (\`${modDisplayName(mod)}\`)\nراح يُعرض المقطع في خلفية الكرت.`,
          ephemeral: true
        })
        break
      }
    }
  } catch (error) {
    console.error('[Discord Bot] Interaction error:', error)
    const reply = { content: '❌ حدث خطأ أثناء تنفيذ الأمر', ephemeral: true }
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {})
      } else {
        await interaction.reply(reply).catch(() => {})
      }
    }
  }
})

export function startDiscordBot(): void {
  if (!DISCORD_TOKEN) {
    console.error('[Discord Bot] No token configured. Set DISCORD_BOT_TOKEN or update discord_bot.ts')
    return
  }

  client.login(DISCORD_TOKEN).catch((error) => {
    botReady = false
    console.error('[Discord Bot] Login failed:', error.message)
  })
}

export function isDiscordBotReady(): boolean {
  return botReady
}
