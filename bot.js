require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { evaluate } = require('mathjs');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
// const ytdl = require('@distube/ytdl-core'); // Devre dışı - play-dl kullanıyoruz
const youtubeSr = require('youtube-sr').default;
const playdl = require('play-dl');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates // Ses kanalı bilgileri için gerekli
    ]
});

const PREFIX = '!';

// Bot logging system
const logFile = path.join(__dirname, 'bot_log.txt');

function botLog(level, message, error = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    // Console'a yazdır
    if (level === 'error') {
        console.error(logMessage);
        if (error) {
            console.error('Error details:', error);
        }
    } else if (level === 'warn') {
        console.warn(logMessage);
    } else {
        console.log(logMessage);
    }
    
    // Dosyaya yazdır
    try {
        const fileMessage = error ? `${logMessage}\nError: ${error.stack || error}\n---\n` : `${logMessage}\n`;
        fs.appendFileSync(logFile, fileMessage);
    } catch (writeError) {
        console.error('Log yazma hatası:', writeError);
    }
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Rate limiting for API calls
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 10;

// Conversation memory storage
const conversationMemory = new Map();
const userProfiles = new Map();

// Bot personality storage (per server)
const serverPersonalities = new Map();

// Music system storage
const musicQueues = new Map();
const voiceConnections = new Map();

// Available personalities
const personalities = {
    'arkadaş': {
        name: 'Arkadaş Canlısı',
        description: 'Samimi, dostane ve rahat konuşma tarzı',
        prompt: 'Sen çok arkadaş canlısı, samimi ve eğlenceli bir botsun. Rahat konuş, emoji kullan ve dostane ol.'
    },
    'resmi': {
        name: 'Resmi',
        description: 'Kibar, resmi ve profesyonel konuşma tarzı',
        prompt: 'Sen kibar, resmi ve profesyonel bir botsun. Saygılı konuş ve fazla emoji kullanma.'
    },
    'komik': {
        name: 'Komik',
        description: 'Şakacı, eğlenceli ve mizahi konuşma tarzı',
        prompt: 'Sen çok komik, şakacı ve eğlenceli bir botsun. Şaka yap, komik emojiler kullan ve gülmeli yanıtlar ver.'
    },
    'bilgili': {
        name: 'Bilgili',
        description: 'Eğitici, detaylı ve öğretici konuşma tarzı',
        prompt: 'Sen çok bilgili ve eğitici bir botsun. Detaylı açıklamalar yap ve öğretici ol.'
    },
    'motivasyon': {
        name: 'Motivasyon',
        description: 'İlham verici, pozitif ve destekleyici konuşma tarzı',
        prompt: 'Sen çok pozitif, ilham verici ve motivasyonel bir botsun. İnsanları motive et ve pozitif enerjin ver.'
    }
};

// Conversation context tracking
function getConversationContext(userId) {
    if (!conversationMemory.has(userId)) {
        conversationMemory.set(userId, {
            lastTopic: null,
            messageHistory: [],
            conversationStartTime: Date.now(),
            userMood: 'neutral',
            interests: [],
            questionCount: 0
        });
    }
    return conversationMemory.get(userId);
}

function updateConversationContext(userId, input, response, topic = null) {
    const context = getConversationContext(userId);
    
    // Add to message history (keep last 10 messages)
    context.messageHistory.push({
        input: input,
        response: response,
        timestamp: Date.now(),
        topic: topic
    });
    
    if (context.messageHistory.length > 10) {
        context.messageHistory.shift();
    }
    
    // Update topic if provided
    if (topic) {
        context.lastTopic = topic;
    }
    
    // Update question count
    if (input.includes('?')) {
        context.questionCount++;
    }
    
    // Memory cleanup - 24 saatten eski konuşmaları temizle
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    if (conversationMemory.size > 500) {
        for (const [id, ctx] of conversationMemory.entries()) {
            if (now - ctx.conversationStartTime > dayInMs) {
                conversationMemory.delete(id);
            }
        }
    }
}

function analyzeUserMood(input) {
    if (input.match(/harika|mükemmel|süper|çok iyi|mutlu|sevindim|güzel/i)) {
        return 'happy';
    } else if (input.match(/kötü|üzgün|berbat|sinirli|kızgın|mutsuz/i)) {
        return 'sad';
    } else if (input.match(/sıkıldım|can sıkıntısı|ne yapacağım|boş/i)) {
        return 'bored';
    } else if (input.match(/merak|ilginç|öğren|bilgi/i)) {
        return 'curious';
    }
    return 'neutral';
}

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Bot start time
const botStartTime = Date.now();

// API Routes
app.get('/api/status', (req, res) => {
    const uptime = Math.floor((Date.now() - botStartTime) / 1000);
    const memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    res.json({
        online: client.isReady(),
        servers: client.guilds.cache.size,
        users: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
        uptime: uptime,
        memory: memoryUsage,
        lastUpdate: new Date().toISOString()
    });
});

app.post('/api/control/:action', (req, res) => {
    const { action } = req.params;
    
    switch (action) {
        case 'start':
            if (!client.isReady()) {
                client.login(process.env.DISCORD_TOKEN);
                res.json({ success: true, message: 'Bot başlatılıyor...' });
            } else {
                res.json({ success: false, message: 'Bot zaten çalışıyor!' });
            }
            break;
            
        case 'stop':
            if (client.isReady()) {
                client.destroy();
                res.json({ success: true, message: 'Bot durduruluyor...' });
            } else {
                res.json({ success: false, message: 'Bot zaten durdurulmuş!' });
            }
            break;
            
        case 'restart':
            if (client.isReady()) {
                client.destroy();
                setTimeout(() => {
                    client.login(process.env.DISCORD_TOKEN);
                }, 2000);
                res.json({ success: true, message: 'Bot yeniden başlatılıyor...' });
            } else {
                client.login(process.env.DISCORD_TOKEN);
                res.json({ success: true, message: 'Bot başlatılıyor...' });
            }
            break;
            
        default:
            res.status(400).json({ success: false, message: 'Geçersiz işlem!' });
    }
});

app.get('/api/logs', (req, res) => {
    try {
        const logs = fs.readFileSync(logFile, 'utf8');
        res.type('text/plain').send(logs);
    } catch (error) {
        res.status(500).json({ error: 'Loglar okunamadı!' });
    }
});

// Start web server
app.listen(PORT, () => {
    botLog('info', `Web dashboard started on port ${PORT}`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
});

// Bot ready event
client.once('ready', () => {
    botLog('info', `Bot ${client.user.tag} is online!`);
    client.user.setActivity('!help ile komutları gör', { type: 0 }); // 0 = Playing
});

// Client error handling
client.on('error', (error) => {
    botLog('error', 'Discord client error', error);
});

client.on('warn', (warning) => {
    botLog('warn', `Discord client warning: ${warning}`);
});

client.on('disconnect', () => {
    botLog('warn', 'Bot disconnected from Discord');
});

client.on('reconnecting', () => {
    botLog('info', 'Bot is reconnecting to Discord...');
});

// Message event handler
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // Komut kontrolü önce
    if (message.content.startsWith(PREFIX)) {
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

    try {
        switch (command) {
            // MATH COMMANDS
            case 'calc':
            case 'hesapla':
                await handleCalculator(message, args);
                break;
            case 'random':
            case 'rastgele':
                await handleRandom(message, args);
                break;
            case 'sqrt':
            case 'karekok':
                await handleSqrt(message, args);
                break;

            // ADMIN COMMANDS
            case 'kick':
            case 'at':
                await handleKick(message, args);
                break;
            case 'ban':
            case 'yasakla':
                await handleBan(message, args);
                break;
            case 'clear':
            case 'temizle':
                await handleClear(message, args);
                break;
            case 'mute':
            case 'sustur':
                await handleMute(message, args);
                break;
            case 'rol_oluştur':
            case 'createrole':
                await handleCreateRole(message, args);
                break;
            case 'kanal_oluştur':
            case 'createchannel':
                await handleCreateChannel(message, args);
                break;
            case 'tempban':
            case 'geçici_ban':
                await handleTempBan(message, args);
                break;

            // FUN COMMANDS
            case 'joke':
            case 'şaka':
                await handleJoke(message);
                break;
            case '8ball':
            case 'sihirli':
                await handle8Ball(message, args);
                break;
            case 'dice':
            case 'zar':
                await handleDice(message, args);
                break;
            case 'avatar':
                await handleAvatar(message, args);
                break;
            case 'serverinfo':
            case 'sunucubilgi':
                await handleServerInfo(message);
                break;

            // HELP COMMAND
            case 'help':
            case 'yardım':
                await handleHelp(message);
                break;
                
            // CHATBOT COMMAND
            case 'chat':
            case 'sohbet':
                await handleChat(message, args);
                break;
            case 'memory':
            case 'hafıza':
                await handleMemory(message);
                break;
            
            // UTILITY COMMANDS
            case 'search':
            case 'ara':
                await handleWebSearch(message, args);
                break;
            case 'web_arama':
                await handleWebUrlSearch(message, args);
                break;
            case 'music':
            case 'müzik':
                await handleMusic(message, args);
                break;
            case 'stop':
            case 'dur':
                await handleMusicStop(message);
                break;
            case 'volume':
            case 'ses':
                await handleVolume(message, args);
                break;
            case 'kişilik_ayarı':
            case 'personality':
                await handlePersonality(message, args);
                break;
            case 'resim':
            case 'image':
                await handleImageGeneration(message, args);
                break;
            case 'party':
            case 'izle':
                await handleWatchParty(message, args);
                break;

            default:
                message.reply('❌ Bilinmeyen komut! `!help` yazarak komutları görebilirsin.');
        }
    } catch (error) {
        console.error('Command error:', error);
        message.reply('❌ Komut çalıştırılırken bir hata oluştu!');
    }
        return; // Komut işlendiyse mention kontrolüne geçme
    }
    
    // Handle bot mentions for natural chat (sadece mention varsa ve komut değilse)
    if (message.mentions.has(client.user)) {
        await handleNaturalChat(message);
        return;
    }
});

// MATH FUNCTIONS
async function handleCalculator(message, args) {
    if (!args.length) {
        return message.reply('❌ Lütfen bir matematik işlemi girin! Örnek: `!calc 2 + 2`');
    }

    try {
        const expression = args.join(' ');
        const result = evaluate(expression);
        
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🧮 Hesap Makinesi')
            .addFields(
                { name: 'İşlem', value: `\`${expression}\``, inline: false },
                { name: 'Sonuç', value: `\`${result}\``, inline: false }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
    } catch (error) {
        message.reply('❌ Geçersiz matematik işlemi! Örnek: `!calc 2 + 2 * 3`');
    }
}

async function handleRandom(message, args) {
    if (args.length === 0) {
        const randomNum = Math.floor(Math.random() * 100) + 1;
        return message.reply(`🎲 Rastgele sayı (1-100): **${randomNum}**`);
    }

    if (args.length === 1) {
        const max = parseInt(args[0]);
        if (isNaN(max) || max <= 0) {
            return message.reply('❌ Lütfen geçerli bir pozitif sayı girin!');
        }
        const randomNum = Math.floor(Math.random() * max) + 1;
        return message.reply(`🎲 Rastgele sayı (1-${max}): **${randomNum}**`);
    }

    if (args.length === 2) {
        const min = parseInt(args[0]);
        const max = parseInt(args[1]);
        if (isNaN(min) || isNaN(max) || min >= max) {
            return message.reply('❌ Lütfen geçerli sayı aralığı girin! (min < max)');
        }
        const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
        return message.reply(`🎲 Rastgele sayı (${min}-${max}): **${randomNum}**`);
    }
}

async function handleSqrt(message, args) {
    if (!args.length) {
        return message.reply('❌ Lütfen bir sayı girin! Örnek: `!sqrt 16`');
    }

    const num = parseFloat(args[0]);
    if (isNaN(num) || num < 0) {
        return message.reply('❌ Lütfen geçerli bir pozitif sayı girin!');
    }

    const result = Math.sqrt(num);
    message.reply(`📐 √${num} = **${result}**`);
}

// ADMIN FUNCTIONS
async function handleKick(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return message.reply('❌ Bu komutu kullanmak için yetkiniz yok!');
    }

    const user = message.mentions.users.first();
    if (!user) {
        return message.reply('❌ Lütfen atılacak kullanıcıyı etiketleyin!');
    }

    const member = message.guild.members.cache.get(user.id);
    if (!member) {
        return message.reply('❌ Kullanıcı sunucuda bulunamadı!');
    }

    if (!member.kickable) {
        return message.reply('❌ Bu kullanıcıyı atamazsınız!');
    }

    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';

    try {
        await member.kick(reason);
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('👢 Kullanıcı Atıldı')
            .addFields(
                { name: 'Atılan', value: `${user.tag}`, inline: true },
                { name: 'Atan', value: `${message.author.tag}`, inline: true },
                { name: 'Sebep', value: reason, inline: false }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
    } catch (error) {
        message.reply('❌ Kullanıcı atılırken bir hata oluştu!');
    }
}

async function handleBan(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return message.reply('❌ Bu komutu kullanmak için yetkiniz yok!');
    }

    const user = message.mentions.users.first();
    if (!user) {
        return message.reply('❌ Lütfen yasaklanacak kullanıcıyı etiketleyin!');
    }

    const member = message.guild.members.cache.get(user.id);
    if (member && !member.bannable) {
        return message.reply('❌ Bu kullanıcıyı yasaklayamazsınız!');
    }

    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';

    try {
        await message.guild.members.ban(user, { reason });
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🔨 Kullanıcı Yasaklandı')
            .addFields(
                { name: 'Yasaklanan', value: `${user.tag}`, inline: true },
                { name: 'Yasaklayan', value: `${message.author.tag}`, inline: true },
                { name: 'Sebep', value: reason, inline: false }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
    } catch (error) {
        message.reply('❌ Kullanıcı yasaklanırken bir hata oluştu!');
    }
}

async function handleClear(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply('❌ Bu komutu kullanmak için yetkiniz yok!');
    }

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0 || amount > 100) {
        return message.reply('❌ Lütfen 1-100 arası bir sayı girin!');
    }

    try {
        const deleted = await message.channel.bulkDelete(amount + 1, true);
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🧹 Mesajlar Temizlendi')
            .setDescription(`**${deleted.size - 1}** mesaj silindi.`)
            .setTimestamp();

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (error) {
        message.reply('❌ Mesajlar silinirken bir hata oluştu!');
    }
}

async function handleMute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('❌ Bu komutu kullanmak için yetkiniz yok!');
    }

    const user = message.mentions.users.first();
    if (!user) {
        return message.reply('❌ Lütfen susturulacak kullanıcıyı etiketleyin!');
    }

    const member = message.guild.members.cache.get(user.id);
    if (!member) {
        return message.reply('❌ Kullanıcı sunucuda bulunamadı!');
    }

    const duration = parseInt(args[1]) || 10; // dakika
    const reason = args.slice(2).join(' ') || 'Sebep belirtilmedi';

    try {
        await member.timeout(duration * 60 * 1000, reason);
        const embed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('🔇 Kullanıcı Susturuldu')
            .addFields(
                { name: 'Susturulan', value: `${user.tag}`, inline: true },
                { name: 'Süre', value: `${duration} dakika`, inline: true },
                { name: 'Sebep', value: reason, inline: false }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
    } catch (error) {
        message.reply('❌ Kullanıcı susturulurken bir hata oluştu!');
    }
}

// FUN FUNCTIONS
async function handleJoke(message) {
    const jokes = [
        'Neden bilgisayarlar soğuk olur? Çünkü pencerelerini açık bırakırlar!',
        'Programcı neden gece çalışır? Çünkü bug\'lar geceleyin çıkar!',
        'Neden kodcular çay içer? Çünkü Java çok sıcak!',
        'CSS ile ilgili en kötü şey nedir? Hiçbir şey center\'lanmaz!',
        'Neden arrays 0\'dan başlar? Çünkü programcılar sayamaz!',
        'Git commit mesajı: "It works on my machine" 🤷‍♂️',
        'HTML bir programlama dili değildir. Değişmez!'
    ];

    const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
    
    const embed = new EmbedBuilder()
        .setColor('#ffff00')
        .setTitle('😂 Rastgele Şaka')
        .setDescription(randomJoke)
        .setTimestamp();

    message.reply({ embeds: [embed] });
}

async function handle8Ball(message, args) {
    if (!args.length) {
        return message.reply('❌ Lütfen bir soru sorun! Örnek: `!8ball Bugün şanslı mıyım?`');
    }

    const responses = [
        'Evet, kesinlikle!',
        'Hayır, asla!',
        'Belki...',
        'Büyük ihtimalle evet',
        'Pek sanmıyorum',
        'Elbette!',
        'Hiç şüphe yok',
        'Tekrar sor',
        'Net değil',
        'Daha sonra sor',
        'Şu anda söyleyemem',
        'Çok şüpheli',
        'Üzerinde düşün',
        'İmkansız!',
        'Tabii ki!'
    ];

    const question = args.join(' ');
    const answer = responses[Math.floor(Math.random() * responses.length)];

    const embed = new EmbedBuilder()
        .setColor('#800080')
        .setTitle('🎱 Sihirli 8-Ball')
        .addFields(
            { name: 'Soru', value: question, inline: false },
            { name: 'Cevap', value: answer, inline: false }
        )
        .setTimestamp();

    message.reply({ embeds: [embed] });
}

async function handleDice(message, args) {
    const sides = parseInt(args[0]) || 6;
    const count = parseInt(args[1]) || 1;

    if (sides < 2 || sides > 100) {
        return message.reply('❌ Zar yüzü sayısı 2-100 arasında olmalı!');
    }

    if (count < 1 || count > 10) {
        return message.reply('❌ Zar sayısı 1-10 arasında olmalı!');
    }

    const results = [];
    let total = 0;

    for (let i = 0; i < count; i++) {
        const roll = Math.floor(Math.random() * sides) + 1;
        results.push(roll);
        total += roll;
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎲 Zar Atışı')
        .addFields(
            { name: 'Zar Türü', value: `${count}d${sides}`, inline: true },
            { name: 'Sonuçlar', value: results.join(', '), inline: true },
            { name: 'Toplam', value: total.toString(), inline: true }
        )
        .setTimestamp();

    message.reply({ embeds: [embed] });
}

async function handleAvatar(message, args) {
    const user = message.mentions.users.first() || message.author;
    
    const embed = new EmbedBuilder()
        .setColor('#ff00ff')
        .setTitle(`${user.username}'in Avatarı`)
        .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setTimestamp();

    message.reply({ embeds: [embed] });
}

async function handleServerInfo(message) {
    const guild = message.guild;
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📊 Sunucu Bilgileri')
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: 'Sunucu Adı', value: guild.name, inline: true },
            { name: 'Üye Sayısı', value: guild.memberCount.toString(), inline: true },
            { name: 'Oluşturulma Tarihi', value: guild.createdAt.toLocaleDateString('tr-TR'), inline: true },
            { name: 'Sahip', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Kanal Sayısı', value: guild.channels.cache.size.toString(), inline: true },
            { name: 'Rol Sayısı', value: guild.roles.cache.size.toString(), inline: true }
        )
        .setTimestamp();

    message.reply({ embeds: [embed] });
}

async function handleHelp(message) {
    const embed = new EmbedBuilder()
        .setColor('#00ff99')
        .setTitle('🤖 Bot Komutları')
        .setDescription('Tüm komutlar için `!` prefix\'ini kullanın')
        .addFields(
            {
                name: '🧮 Matematik Komutları',
                value: '`!calc <işlem>` - Hesap makinesi\n`!random [max] [min]` - Rastgele sayı\n`!sqrt <sayı>` - Karekök hesapla',
                inline: false
            },
            {
                name: '⚡ Admin Komutları',
                value: '`!kick @kullanıcı [sebep]` - Kullanıcı at\n`!ban @kullanıcı [sebep]` - Kullanıcı yasakla\n`!clear <sayı>` - Mesaj sil\n`!mute @kullanıcı [dakika] [sebep]` - Sustur\n`!rol_oluştur <ad>` - Rol oluştur\n`!kanal_oluştur <tip> <ad>` - Kanal oluştur\n`!tempban @kullanıcı <gün> [sebep]` - Geçici ban',
                inline: false
            },
            {
                name: '🎉 Eğlence Komutları',
                value: '`!joke` - Rastgele şaka\n`!8ball <soru>` - Sihirli 8-ball\n`!dice [yüz] [adet]` - Zar at\n`!avatar [@kullanıcı]` - Avatar göster\n`!serverinfo` - Sunucu bilgileri',
                inline: false
            },
            {
                name: '🤖 AI Chatbot (Gemini Flash)',
                value: '`!chat <mesaj>` - Gemini AI ile sohbet et\n`@bot <mesaj>` - Botu etiketleyerek doğal AI sohbet\n`!memory` - Sohbet hafızamı gör\n**🚀 Güçlü AI:** Gerçek zeka ile konuş!\n**🧠 Hafıza:** Önceki konuşmaları hatırlar\n**⚡ Hızlı:** Flash modeli ile anlık yanıtlar',
                inline: false
            },
            {
                name: '🎨 Yaratıcı Komutlar',
                value: '`!resim <açıklama>` - AI resim oluştur *("Resim Oluşturucu" rolü gerekir)*\n`!search <arama>` - Web araması\n`!web_arama <url>` - Web sayfası özeti\n`!kişilik_ayarı [kişilik]` - Bot kişiliğini ayarla',
                inline: false
            },
            {
                name: '🎵 Müzik Komutları',
                value: '`!music <şarkı/url>` - Müzik çal\n`!stop` - Müziği durdur\n`!volume <1-100>` - Ses seviyesi ayarla\n`!party <youtube_link>` - Watch party oluştur\n**🎧 Desteklenen:** YouTube, direkt URL\n**📋 Kuyruk:** Otomatik sıralama sistemi\n**🎙️ Ses:** Yüksek kalite audio',
                inline: false
            }
        )
        .setFooter({ text: 'Bot tarafından güçlendirilmiştir' })
        .setTimestamp();

    message.reply({ embeds: [embed] });
}

// Error handling
process.on('unhandledRejection', (error, promise) => {
    botLog('error', 'Unhandled promise rejection', error);
    console.error('Promise:', promise);
});

process.on('uncaughtException', (error) => {
    botLog('error', 'Uncaught Exception - Bot will exit', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    botLog('info', 'Bot is shutting down (SIGINT)...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    botLog('info', 'Bot is shutting down (SIGTERM)...');
    client.destroy();
    process.exit(0);
});

async function handleMemory(message) {
    const context = getConversationContext(message.author.id);
    
    if (context.messageHistory.length === 0) {
        return message.reply('🧠 Henüz hiç konuşmamız yok! Benimle konuşmaya başladığında hatırlamaya başlayacağım.');
    }
    
    const conversationDuration = Math.floor((Date.now() - context.conversationStartTime) / 60000); // minutes
    const moodEmojis = {
        'happy': '😊',
        'sad': '😔',
        'bored': '😴',
        'curious': '🤔',
        'neutral': '😐'
    };
    
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🧠 Sohbet Hafızam')
        .addFields(
            { name: 'Toplam Mesaj', value: context.messageHistory.length.toString(), inline: true },
            { name: 'Son Konu', value: context.lastTopic || 'Belirsiz', inline: true },
            { name: 'Ruh Durum', value: `${context.userMood} ${moodEmojis[context.userMood] || ''}`, inline: true },
            { name: 'Soru Sayısı', value: context.questionCount.toString(), inline: true },
            { name: 'Konuşma Süresi', value: `${conversationDuration} dakika`, inline: true },
            { name: 'İlgi Alanları', value: context.interests.length > 0 ? context.interests.join(', ') : 'Henüz tespit edilmedi', inline: true }
        )
        .setFooter({ text: 'Son 10 mesaj hafızada tutuluyor' })
        .setTimestamp();
    
    if (context.messageHistory.length > 0) {
        const recentMessages = context.messageHistory.slice(-3).map(msg => 
            `**Sen:** ${msg.input.substring(0, 50)}${msg.input.length > 50 ? '...' : ''}\n**Ben:** ${msg.response.substring(0, 50)}${msg.response.length > 50 ? '...' : ''}`
        ).join('\n\n');
        
        embed.addFields({
            name: 'Son Konuşmalar',
            value: recentMessages || 'Henüz mesaj yok',
            inline: false
        });
    }
    
    message.reply({ embeds: [embed] });
}

// Rate limiting helper
function checkRateLimit(userId) {
    const now = Date.now();
    const userLimit = rateLimiter.get(userId) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    
    if (now > userLimit.resetTime) {
        userLimit.count = 0;
        userLimit.resetTime = now + RATE_LIMIT_WINDOW;
    }
    
    if (userLimit.count >= MAX_REQUESTS_PER_MINUTE) {
        return false;
    }
    
    userLimit.count++;
    rateLimiter.set(userId, userLimit);
    
    // Memory cleanup - eski kayıtları temizle
    if (rateLimiter.size > 1000) {
        for (const [id, limit] of rateLimiter.entries()) {
            if (now > limit.resetTime + RATE_LIMIT_WINDOW) {
                rateLimiter.delete(id);
            }
        }
    }
    
    return true;
}

// GEMINI AI CHATBOT FUNCTIONS
async function handleChat(message, args) {
    if (!args.length) {
        const context = getConversationContext(message.author.id);
        if (context.lastTopic) {
            return message.reply(`❓ Ne hakkında konuşmak istiyorsun? Son konuştuğumuz konu: **${context.lastTopic}**`);
        }
        return message.reply('❓ Lütfen bir şeyler söyleyin! Örnek: `!chat merhaba nasılsın?`');
    }

    const input = args.join(' ');
    await generateGeminiResponse(message, input, false);
}

async function handleNaturalChat(message) {
    // Remove the mention and get just the content
    let input = message.content.replace(/<@!?\d+>/g, '').trim();
    
    if (!input) {
        const context = getConversationContext(message.author.id);
        if (context.messageHistory.length > 0) {
            return message.reply('Evet? Devam edebilirsin!');
        }
        return message.reply('Merhaba! Nasıl yardımcı olabilirim?');
    }
    
    await generateGeminiResponse(message, input, true);
}

async function generateGeminiResponse(message, input, isNaturalChat = false) {
    const userId = message.author.id;
    const username = message.author.username;
    
    // Check rate limiting
    if (!checkRateLimit(userId)) {
        return message.reply('⏱️ Çok hızlı mesaj gönderiyorsun! Lütfen biraz bekle ve tekrar dene.');
    }
    
    // Show typing indicator
    await message.channel.sendTyping();
    
    try {
        const context = getConversationContext(userId);
        
        // Build conversation history for context
        let conversationHistory = '';
        if (context.messageHistory.length > 0) {
            const recentMessages = context.messageHistory.slice(-5).map(msg => 
                `Kullanıcı: ${msg.input}\nBot: ${msg.response}`
            ).join('\n\n');
            conversationHistory = `\n\nÖnceki konuşma geçmişi:\n${recentMessages}`;
        }
        
        // Build user profile info
        let userInfo = '';
        if (context.interests.length > 0) {
            userInfo += `\nKullanıcının ilgi alanları: ${context.interests.join(', ')}`;
        }
        if (context.userMood !== 'neutral') {
            userInfo += `\nKullanıcının ruh hali: ${context.userMood}`;
        }
        if (context.lastTopic) {
            userInfo += `\nSon konuşulan konu: ${context.lastTopic}`;
        }
        
        // Get server personality
        const serverPersonality = getServerPersonality(message.guild.id);
        const personalityInfo = personalities[serverPersonality];
        
        // Güvenlik: Input'u temizle ve kısıtla
        const cleanInput = input.replace(/[<>@#&]/g, '').substring(0, 500);
        const cleanUsername = username.replace(/[<>@#&]/g, '').substring(0, 50);
        
        // Create prompt for Gemini with personality
        const prompt = `Sen bir Discord botusun ve kullanıcılarla Türkçe sohbet ediyorsun. ${personalityInfo.prompt} Kısa yanıtlar ver (maksimum 2-3 cümle).

Kullanıcı adı: ${cleanUsername}
Kullanıcının mesajı: "${cleanInput}"${userInfo}${conversationHistory}

Lütfen bu mesaja uygun yanıt ver:`
        
        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();
        
        // Analyze topic from the response
        const topic = detectTopicFromMessage(input);
        
        // Update conversation context
        updateConversationContext(userId, input, response, topic);
        
        // Update user mood
        const detectedMood = analyzeUserMood(input);
        if (detectedMood !== 'neutral') {
            context.userMood = detectedMood;
        }
        
        // Respond based on chat type
        if (isNaturalChat) {
            message.reply(response);
        } else {
            const embed = new EmbedBuilder()
                .setColor('#1abc9c')
                .setTitle('🤖 AI Sohbet')
                .addFields(
                    { name: 'Siz', value: input, inline: false },
                    { name: 'Gemini AI', value: response, inline: false }
                )
                .setFooter({ text: 'Powered by Gemini Flash' })
                .setTimestamp();

            message.reply({ embeds: [embed] });
        }
        
    } catch (error) {
        console.error('Gemini API Error:', error);
        
        // Fallback to simple response on error
        const fallbackResponses = [
            'Üzgünüm, şu anda AI sistemiyle bağlantı kuramıyorum. Daha sonra tekrar dener misin?',
            'Bir teknik sorun yaşıyorum. Birkaç dakika sonra tekrar deneyebilirsin.',
            'AI servisim şu anda müsait değil. Lütfen biraz sonra tekrar dene!'
        ];
        
        const fallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
        
        if (isNaturalChat) {
            message.reply(`❌ ${fallback}`);
        } else {
            const embed = new EmbedBuilder()
                .setColor('#ff6b6b')
                .setTitle('🚫 AI Hatası')
                .setDescription(fallback)
                .setTimestamp();

            message.reply({ embeds: [embed] });
        }
    }
}

function detectTopicFromMessage(input) {
    const inputLower = input.toLowerCase();
    
    if (inputLower.match(/programlama|kodlama|javascript|python|kod|developer|yazılım/i)) {
        return 'programming';
    } else if (inputLower.match(/oyun|game|minecraft|fortnite|valorant|cs|lol/i)) {
        return 'gaming';
    } else if (inputLower.match(/müzik|music|şarkı|song|spotify|dinle/i)) {
        return 'music';
    } else if (inputLower.match(/filme|kitap|dizi|tv|sinema/i)) {
        return 'entertainment';
    } else if (inputLower.match(/spor|futbol|basketbol|egzersiz|fitness/i)) {
        return 'sports';
    } else if (inputLower.match(/yemek|food|aç|açım|restoran|yemek tarifleri/i)) {
        return 'food';
    } else if (inputLower.match(/okul|ders|ödev|sınav|eğitim/i)) {
        return 'education';
    } else if (inputLower.match(/seyahat|tatil|gezi|ülke|şehir/i)) {
        return 'travel';
    } else if (inputLower.match(/merhaba|selam|hey|hello|hi/i)) {
        return 'greeting';
    } else if (inputLower.includes('?')) {
        return 'question';
    }
    
    return 'general';
}

// NEW FEATURE FUNCTIONS

// WEB SEARCH FUNCTION
async function handleWebSearch(message, args) {
    if (!args.length) {
        return message.reply('❌ Lütfen aranacak kelimeyi girin! Örnek: `!search discord bot yapma`');
    }

    const query = args.join(' ');
    
    try {
        // Google Custom Search kullanmak yerine Gemini’ye web özeti soruyoruz
        const searchPrompt = `"${query}" konusu hakkında kısa bir özet ve güncel bilgiler ver. Maksimum 3-4 cümle ile açıkla ve varsa önemli detayları belirt.`;
        
        await message.channel.sendTyping();
        
        const result = await model.generateContent(searchPrompt);
        const response = result.response.text().trim();
        
        const embed = new EmbedBuilder()
            .setColor('#4285f4')
            .setTitle('🔍 Web Arama Sonuçları')
            .addFields(
                { name: 'Arama Terimi', value: `\`${query}\``, inline: false },
                { name: 'Sonuç', value: response, inline: false }
            )
            .setFooter({ text: 'Powered by Gemini AI' })
            .setTimestamp();

        message.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Search error:', error);
        message.reply('❌ Arama sırasında bir hata oluştu! Daha sonra tekrar deneyin.');
    }
}

// PERSONALITY SYSTEM
function getServerPersonality(serverId) {
    return serverPersonalities.get(serverId) || 'arkadaş';
}

function setServerPersonality(serverId, personality) {
    serverPersonalities.set(serverId, personality);
}

async function handlePersonality(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply('❌ Bu komutu kullanmak için "Sunucuyu Yönet" yetkiniz olmalı!');
    }

    if (!args.length) {
        const currentPersonality = getServerPersonality(message.guild.id);
        const personalityInfo = personalities[currentPersonality];
        
        const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('🎭 Mevcut Kişilik Ayarı')
            .addFields(
                { name: 'Aktif Kişilik', value: personalityInfo.name, inline: true },
                { name: 'Açıklama', value: personalityInfo.description, inline: false }
            )
            .addFields({
                name: 'Mevcut Kişilikler',
                value: Object.keys(personalities).map(key => 
                    `• \`${key}\` - ${personalities[key].name}`
                ).join('\n'),
                inline: false
            })
            .setFooter({ text: 'Kullanım: !kişilik_ayarı <kişilik_adı>' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    const newPersonality = args[0].toLowerCase();
    
    if (!personalities[newPersonality]) {
        return message.reply(`❌ Geçersiz kişilik! Mevcut kişilikler: ${Object.keys(personalities).join(', ')}`);
    }

    setServerPersonality(message.guild.id, newPersonality);
    const personalityInfo = personalities[newPersonality];
    
    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Kişilik Değiştirildi')
        .addFields(
            { name: 'Yeni Kişilik', value: personalityInfo.name, inline: true },
            { name: 'Açıklama', value: personalityInfo.description, inline: false }
        )
        .setFooter({ text: 'Bundan sonra bu tarzda konuşacağım!' })
        .setTimestamp();

    message.reply({ embeds: [embed] });
}

// IMAGE GENERATION FUNCTION
async function handleImageGeneration(message, args) {
    // Yetki kontrolü - "Resim Oluşturucu" rolü veya Yönetici yetkisi gerekir
    const hasPermission = message.member.permissions.has(PermissionFlagsBits.Administrator) || 
                          message.member.roles.cache.some(role => 
                            role.name.toLowerCase() === 'resim oluşturucu' || 
                            role.name.toLowerCase() === 'image creator');
    
    if (!hasPermission) {
        return message.reply('❌ Bu komutu kullanmak için "Resim Oluşturucu" rolüne sahip olmalısınız veya yönetici olmalısınız!');
    }
    
    if (!args.length) {
        return message.reply('❌ Lütfen resim için açıklama girin! Örnek: `!resim flamingo`');
    }

    const prompt = args.join(' ');
    
    try {
        await message.channel.sendTyping();
        
        // Stability AI (Stable Diffusion) API kullanarak gerçek resim oluşturma
        const stableDiffusionApiKey = process.env.STABLE_DIFFUSION_API_KEY;
        
        if (!stableDiffusionApiKey) {
            // API anahtarı yoksa placeholder resim göster
            const imageUrl = `https://picsum.photos/512/512?random=${Date.now()}`;
            
            const embed = new EmbedBuilder()
                .setColor('#ff6b9d')
                .setTitle('⚠️ Resim API Ayarlanmadı')
                .addFields(
                    { name: 'Prompt', value: `\`${prompt}\``, inline: false },
                    { name: 'Durum', value: 'STABLE_DIFFUSION_API_KEY ayarlanmadığı için placeholder resim gösteriliyor.', inline: false },
                    { name: 'Çözüm', value: '.env dosyasına STABLE_DIFFUSION_API_KEY=your_api_key ekleyin', inline: false }
                )
                .setImage(imageUrl)
                .setFooter({ text: 'Placeholder Image Service' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }
        
        // Stability AI API isteği
        const response = await axios.post(
            'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
            {
                text_prompts: [
                    {
                        text: prompt,
                        weight: 1
                    }
                ],
                cfg_scale: 7,
                height: 512,
                width: 512,
                samples: 1,
                steps: 30
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${stableDiffusionApiKey}`
                }
            }
        );
        
        // Base64 image verisini buffer'a çevir
        const imageBuffer = Buffer.from(response.data.artifacts[0].base64, 'base64');
        
        const embed = new EmbedBuilder()
            .setColor('#ff6b9d')
            .setTitle('🎨 AI Resim Oluşturuldu')
            .addFields(
                { name: 'Prompt', value: `\`${prompt}\``, inline: false },
                { name: 'Oluşturan', value: message.author.tag, inline: true },
                { name: 'Model', value: 'Stable Diffusion XL', inline: true },
                { name: 'Çözünürlük', value: '512x512', inline: true }
            )
            .setFooter({ text: 'Powered by Stability AI' })
            .setTimestamp();

        // Resimi dosya olarak gönder
        message.reply({ 
            embeds: [embed],
            files: [{
                attachment: imageBuffer,
                name: 'generated_image.png'
            }]
        });
        
    } catch (error) {
        console.error('Image generation error:', error);
        
        // Hata durumunda fallback olarak placeholder resim göster
        const fallbackUrl = `https://picsum.photos/512/512?random=${Date.now()}`;
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff4444')
            .setTitle('❌ Resim Oluşturma Hatası')
            .addFields(
                { name: 'Prompt', value: `\`${prompt}\``, inline: false },
                { name: 'Hata', value: 'AI resim servisi şu anda kullanılamıyor. Placeholder resim gösteriliyor.', inline: false },
                { name: 'Çözüm', value: 'API anahtarını kontrol edin veya daha sonra tekrar deneyin.', inline: false }
            )
            .setImage(fallbackUrl)
            .setFooter({ text: 'Fallback Image Service' })
            .setTimestamp();
            
        message.reply({ embeds: [errorEmbed] });
    }
}

// ADVANCED ADMIN FUNCTIONS

// CREATE ROLE FUNCTION
async function handleCreateRole(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return message.reply('❌ Bu komutu kullanmak için "Rolleri Yönet" yetkiniz olmalı!');
    }

    if (!args.length) {
        return message.reply('❌ Lütfen rol adını girin! Örnek: `!rol_oluştur Abone`');
    }

    const roleName = args.join(' ');
    
    try {
        const role = await message.guild.roles.create({
            name: roleName,
            color: Math.floor(Math.random() * 16777215), // Random color
            reason: `Rol ${message.author.tag} tarafından oluşturuldu`
        });

        const embed = new EmbedBuilder()
            .setColor(role.color)
            .setTitle('✅ Rol Oluşturuldu')
            .addFields(
                { name: 'Rol Adı', value: role.name, inline: true },
                { name: 'Rol ID', value: role.id, inline: true },
                { name: 'Oluşturan', value: message.author.tag, inline: true },
                { name: 'Renk', value: `#${role.color.toString(16).padStart(6, '0')}`, inline: true }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Role creation error:', error);
        message.reply('❌ Rol oluşturulurken bir hata oluştu!');
    }
}

// CREATE CHANNEL FUNCTION
async function handleCreateChannel(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply('❌ Bu komutu kullanmak için "Kanalları Yönet" yetkiniz olmalı!');
    }

    if (args.length < 2) {
        return message.reply('❌ Kullanım: `!kanal_oluştur <tip> <ad>` \n Tıpler: text, voice, category\n Örnek: `!kanal_oluştur text genel-sohbet`');
    }

    const channelType = args[0].toLowerCase();
    const channelName = args.slice(1).join('-').toLowerCase();
    
    let type;
    switch (channelType) {
        case 'text':
        case 'metin':
            type = ChannelType.GuildText;
            break;
        case 'voice':
        case 'ses':
            type = ChannelType.GuildVoice;
            break;
        case 'category':
        case 'kategori':
            type = ChannelType.GuildCategory;
            break;
        default:
            return message.reply('❌ Geçersiz kanal tipi! Kullanılabilir tipler: text, voice, category');
    }

    try {
        const channel = await message.guild.channels.create({
            name: channelName,
            type: type,
            reason: `Kanal ${message.author.tag} tarafından oluşturuldu`
        });

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Kanal Oluşturuldu')
            .addFields(
                { name: 'Kanal Adı', value: channel.name, inline: true },
                { name: 'Tip', value: channelType, inline: true },
                { name: 'ID', value: channel.id, inline: true },
                { name: 'Oluşturan', value: message.author.tag, inline: true }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Channel creation error:', error);
        message.reply('❌ Kanal oluşturulurken bir hata oluştu!');
    }
}

// TEMPORARY BAN FUNCTION
async function handleTempBan(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return message.reply('❌ Bu komutu kullanmak için yetkiniz yok!');
    }

    if (args.length < 2) {
        return message.reply('❌ Kullanım: `!tempban @kullanıcı <gün_sayısı> [sebep]`\n Örnek: `!tempban @user 3 deneme123`');
    }

    const user = message.mentions.users.first();
    if (!user) {
        return message.reply('❌ Lütfen yasaklanacak kullanıcıyı etiketleyin!');
    }

    const days = parseInt(args[1]);
    if (isNaN(days) || days <= 0 || days > 30) {
        return message.reply('❌ Lütfen 1-30 arası geçerli gün sayısı girin!');
    }

    const reason = args.slice(2).join(' ') || 'Sebep belirtilmedi';
    
    try {
        // Ban the user
        await message.guild.members.ban(user, { 
            reason: `Geçici ban (${days} gün): ${reason}`,
            deleteMessageDays: Math.min(days, 7) // Max 7 days for message deletion
        });

        // Schedule unban (note: this is basic implementation, for production use a database)
        setTimeout(async () => {
            try {
                await message.guild.members.unban(user.id, 'Geçici ban süresi doldu');
                
                const unbanEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Geçici Ban Sona Erdi')
                    .setDescription(`${user.tag} kullanıcısının ${days} günlük banı sona erdi.`)
                    .setTimestamp();
                
                message.channel.send({ embeds: [unbanEmbed] });
            } catch (error) {
                console.error('Auto-unban error:', error);
            }
        }, days * 24 * 60 * 60 * 1000); // Convert days to milliseconds

        const embed = new EmbedBuilder()
            .setColor('#ff4444')
            .setTitle('⏰ Geçici Ban Uygulandı')
            .addFields(
                { name: 'Yasaklanan', value: `${user.tag}`, inline: true },
                { name: 'Süre', value: `${days} gün`, inline: true },
                { name: 'Yasaklayan', value: `${message.author.tag}`, inline: true },
                { name: 'Sebep', value: reason, inline: false },
                { name: 'Bitiş Tarihi', value: new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toLocaleString('tr-TR'), inline: false }
            )
            .setFooter({ text: 'Ban otomatik olarak kalkacak' })
            .setTimestamp();

        message.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Temp ban error:', error);
        message.reply('❌ Geçici ban uygulanırken bir hata oluştu!');
    }
}

// MUSIC FUNCTIONS

// Music queue structure
function createMusicQueue() {
    return {
        songs: [],
        volume: 50,
        playing: false,
        connection: null,
        player: null
    };
}

// Get or create music queue for server
function getMusicQueue(guildId) {
    if (!musicQueues.has(guildId)) {
        musicQueues.set(guildId, createMusicQueue());
    }
    return musicQueues.get(guildId);
}

// Rate limiting for music commands
const musicCommandCooldown = new Map();

// MUSIC COMMAND HANDLER
async function handleMusic(message, args) {
    // Çift komut çalışmasını önle
    if (message.author.bot) return;
    
    // Cooldown kontrolü (2 saniye)
    const userId = message.author.id;
    const now = Date.now();
    const cooldownAmount = 2000; // 2 saniye
    
    if (musicCommandCooldown.has(userId)) {
        const expirationTime = musicCommandCooldown.get(userId) + cooldownAmount;
        if (now < expirationTime) {
            botLog('warn', `Music command cooldown active for ${message.author.tag}`);
            return;
        }
    }
    
    musicCommandCooldown.set(userId, now);
    
    botLog('info', `Music command called by ${message.author.tag} in ${message.guild.name}`);
    
    if (!args.length) {
        botLog('warn', 'Music command called without arguments');
        return message.reply('❌ Lütfen müzik adı veya URL girin! Örnek: `!music imagine dragons`');
    }

    // Guild member cache'ini güncelle
    try {
        await message.guild.members.fetch(message.author.id);
        botLog('info', 'Member cache updated successfully');
    } catch (error) {
        botLog('error', 'Member fetch error', error);
    }

    // Kullanıcının ses kanalında olup olmadığını kontrol et - geliştirilmiş kontrol
    const member = message.guild.members.cache.get(message.author.id);
    
    if (!member) {
        botLog('error', 'Member not found in cache');
        return message.reply('❌ Üye bilgileriniz yüklenemedi! Lütfen tekrar deneyin.');
    }

    const voiceState = {
        userId: message.author.id,
        voiceChannel: member.voice?.channel?.name || 'null',
        channelId: member.voice?.channelId || 'null'
    };
    
    botLog('info', `Voice state check: ${JSON.stringify(voiceState)}`);

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
        botLog('warn', 'User not in voice channel');
        return message.reply('❌ Müzik çalmak için bir ses kanalında olmalısınız! Lütfen bir ses kanalına katılın ve tekrar deneyin.');
    }

    // Bot'un ses kanalına bağlanma yetkisi var mı kontrol et
    const botPermissions = voiceChannel.permissionsFor(message.guild.members.me);
    botLog('info', `Bot permissions in voice channel: Connect=${botPermissions.has(PermissionFlagsBits.Connect)}, Speak=${botPermissions.has(PermissionFlagsBits.Speak)}`);
    
    if (!botPermissions.has(PermissionFlagsBits.Connect)) {
        botLog('error', 'Bot does not have Connect permission');
        return message.reply('❌ Bu ses kanalına bağlanma yetkim yok!');
    }

    if (!botPermissions.has(PermissionFlagsBits.Speak)) {
        botLog('error', 'Bot does not have Speak permission');
        return message.reply('❌ Bu ses kanalında konuşma yetkim yok!');
    }

    const query = args.join(' ');
    botLog('info', `Searching for music: "${query}"`);
    
    try {
        await message.channel.sendTyping();
        
        // YouTube'dan müzik ara
        let songInfo;
        
        try {
            // Eğer direkt URL verilmişse
            if (playdl.yt_validate(query) === 'video') {
                botLog('info', 'Direct YouTube URL detected, getting video info');
                const info = await playdl.video_info(query);
                songInfo = {
                    title: info.video_details.title,
                    url: query,
                    duration: info.video_details.durationInSec,
                    thumbnail: info.video_details.thumbnails[0]?.url
                };
                botLog('info', `Video info retrieved: ${songInfo.title}`);
            } else {
                // Müzik adıyla arama yap
                botLog('info', 'Searching YouTube with query');
                const searchResults = await youtubeSr.search(query, { 
                    limit: 1,
                    type: 'video'
                });
                
                botLog('info', `Search results count: ${searchResults?.length || 0}`);
                
                if (!searchResults || !searchResults.length) {
                    botLog('warn', 'No search results found');
                    return message.reply('❌ Müzik bulunamadı! Farklı bir arama terimi deneyin.');
                }
                
                const video = searchResults[0];
                
                // Video bilgilerini kontrol et
                if (!video || !video.url) {
                    botLog('error', 'Invalid video object in search results');
                    return message.reply('❌ Geçerli bir müzik bulunamadı! Farklı bir arama terimi deneyin.');
                }
                
                songInfo = {
                    title: video.title || 'Bilinmeyen Başlık',
                    url: video.url,
                    duration: video.duration || 'Bilinmiyor',
                    thumbnail: video.thumbnail?.url || null
                };
                botLog('info', `Found video: ${songInfo.title} - ${songInfo.url}`);
            }
        } catch (searchError) {
            botLog('error', 'Music search error', searchError);
            return message.reply('❌ Müzik aranırken bir hata oluştu! Lütfen farklı bir arama terimi deneyin.');
        }
        
        const queue = getMusicQueue(message.guild.id);
        
        // Şarkıyı kuyruğa ekle
        queue.songs.push({
            ...songInfo,
            requestedBy: message.author.tag
        });
        
        // Eğer şu anda çalmıyorsa, çalmaya başla
        if (!queue.playing) {
            await playMusic(message, voiceChannel);
        } else {
            const embed = new EmbedBuilder()
                .setColor('#ffaa00')
                .setTitle('📋 Kuyruğa Eklendi')
                .addFields(
                    { name: 'Şarkı', value: songInfo.title, inline: false },
                    { name: 'İsteyen', value: message.author.tag, inline: true },
                    { name: 'Kuyruk Pozisyonu', value: `${queue.songs.length}`, inline: true }
                )
                .setThumbnail(songInfo.thumbnail || null)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        }
        
    } catch (error) {
        console.error('Music error:', error);
        message.reply('❌ Müzik çalarken bir hata oluştu!');
    }
}

// PLAY MUSIC FUNCTION
async function playMusic(message, voiceChannel) {
    botLog('info', `Starting playMusic function for guild: ${message.guild.name}`);
    const queue = getMusicQueue(message.guild.id);
    
    if (!queue.songs.length) {
        botLog('warn', 'Queue is empty, stopping playback');
        queue.playing = false;
        return;
    }
    
    const song = queue.songs[0];
    botLog('info', `Playing song: ${song.title} - ${song.url}`);
    
    try {
        // Ses kanalına bağlan
        let connection;
        try {
            botLog('info', `Attempting to join voice channel: ${voiceChannel.name} (${voiceChannel.id})`);
            connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
            
            botLog('info', 'Voice connection created successfully');
            queue.connection = connection;
            voiceConnections.set(message.guild.id, connection);
            
            // Connection error handling
            connection.on(VoiceConnectionStatus.Disconnected, () => {
                botLog('warn', 'Voice connection disconnected');
                queue.playing = false;
                voiceConnections.delete(message.guild.id);
            });
            
            connection.on(VoiceConnectionStatus.Connecting, () => {
                botLog('info', 'Voice connection is connecting...');
            });
            
            connection.on(VoiceConnectionStatus.Ready, () => {
                botLog('info', 'Voice connection is ready');
            });
            
            connection.on('error', (error) => {
                botLog('error', 'Voice connection error', error);
                message.channel.send('❌ Ses bağlantısında bir hata oluştu!');
                
                // Bağlantıyı yeniden dene
                setTimeout(() => {
                    if (connection.state.status !== VoiceConnectionStatus.Ready) {
                        botLog('warn', 'Attempting to reconnect voice connection');
                        connection.rejoin();
                    }
                }, 5000);
            });
            
        } catch (connectionError) {
            botLog('error', 'Voice connection creation error', connectionError);
            return message.reply('❌ Ses kanalına bağlanırken bir hata oluştu!');
        }
        
        // Audio player oluştur
        botLog('info', 'Creating audio player');
        const player = createAudioPlayer();
        queue.player = player;
        
        // YouTube'dan ses akışı al - İyileştirilmiş play-dl
        let stream;
        try {
            botLog('info', 'Using play-dl for stream (more stable)');
            botLog('info', `Attempting to stream URL: ${song.url}`);
            
            // Önce video bilgilerini alalım
            const videoInfo = await playdl.video_info(song.url);
            if (!videoInfo) {
                throw new Error('Video bilgileri alınamadı');
            }
            
            botLog('info', `Video info retrieved: ${videoInfo.video_details.title}`);
            
            // play-dl ile stream oluştur - daha iyi kalite
            const streamData = await playdl.stream(song.url, { 
                quality: 1, // 1 = higher quality
                discordPlayerCompatibility: true,
                seek: 0,
                htmldata: false
            });
            
            stream = streamData.stream;
            botLog('info', 'play-dl stream created successfully');
            
            // Stream error handling
            stream.on('error', (error) => {
                botLog('error', 'Stream error', error);
                message.channel.send('❌ Ses akışında bir hata oluştu!');
                // Hata durumunda sonraki şarkıya geç
                queue.songs.shift();
                if (queue.songs.length > 0) {
                    playMusic(message, voiceChannel);
                } else {
                    queue.playing = false;
                    connection.destroy();
                    voiceConnections.delete(message.guild.id);
                }
            });
            
            stream.on('end', () => {
                botLog('info', 'Stream ended normally');
            });
            
        } catch (streamError) {
            botLog('error', 'play-dl stream creation failed', streamError);
            
            // Alternatif olarak farklı bir URL formatı deneyelim
            try {
                botLog('info', 'Trying alternative stream method');
                
                // URL'yi temizleyelim ve yeniden deneyelim
                const cleanUrl = song.url.split('&')[0]; // Parametreleri temizle
                botLog('info', `Trying clean URL: ${cleanUrl}`);
                
                const streamData = await playdl.stream(cleanUrl, { 
                    quality: 0, // 0 = highest quality
                    discordPlayerCompatibility: true
                });
                
                stream = streamData.stream;
                botLog('info', 'Alternative stream method successful');
                
            } catch (alternativeError) {
                botLog('error', 'play-dl methods failed, trying youtube-dl-exec', alternativeError);
                
                // Son çare: youtube-dl-exec kullan
                try {
                    botLog('info', 'Trying youtube-dl-exec as final fallback');
                    
                    const audioUrl = await youtubedl(song.url, {
                        dumpSingleJson: true,
                        noCheckCertificates: true,
                        noWarnings: true,
                        preferFreeFormats: true,
                        addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
                        format: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'
                    });
                    
                    if (audioUrl && audioUrl.url) {
                        // Direct URL'den stream oluştur
                        const response = await axios({
                            method: 'get',
                            url: audioUrl.url,
                            responseType: 'stream'
                        });
                        
                        stream = response.data;
                        botLog('info', 'youtube-dl-exec fallback successful');
                    } else {
                        throw new Error('youtube-dl-exec URL bulunamadı');
                    }
                    
                } catch (finalError) {
                    botLog('error', 'All stream methods failed completely', finalError);
                    message.channel.send(`❌ Bu şarkı için ses akışı oluşturulamadı: ${song.title}\n🔄 Farklı bir şarkı deneyin.`);
                    
                    // Sonraki şarkıya geç
                    queue.songs.shift();
                    if (queue.songs.length > 0) {
                        return playMusic(message, voiceChannel);
                    } else {
                        queue.playing = false;
                        connection.destroy();
                        voiceConnections.delete(message.guild.id);
                        return;
                    }
                }
            }
        }
        
        botLog('info', 'Creating audio resource with optimized settings');
        const resource = createAudioResource(stream, {
            inputType: 'arbitrary',
            inlineVolume: true,
            metadata: {
                title: song.title
            }
        });
        
        // Volume ayarı - queue'dan al veya varsayılan %70
        const volumeLevel = (queue.volume || 70) / 100;
        if (resource.volume) {
            resource.volume.setVolume(volumeLevel);
            botLog('info', `Volume set to ${queue.volume || 70}%`);
        }
        
        // Şarkı başladığında
        player.on(AudioPlayerStatus.Playing, () => {
            botLog('info', `Music started playing: ${song.title}`);
            queue.playing = true;
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎵 Şimdi Çalıyor')
                .addFields(
                    { name: 'Şarkı', value: song.title, inline: false },
                    { name: 'İsteyen', value: song.requestedBy, inline: true },
                    { name: 'Süre', value: formatDuration(song.duration), inline: true }
                )
                .setThumbnail(song.thumbnail || null)
                .setTimestamp();
            
            message.channel.send({ embeds: [embed] });
        });
        
        // Şarkı bittiğinde
        player.on(AudioPlayerStatus.Idle, () => {
            botLog('info', `Music finished: ${song.title}`);
            queue.songs.shift();
            
            if (queue.songs.length > 0) {
                botLog('info', 'Playing next song in queue');
                // Sonraki şarkıya geç
                playMusic(message, voiceChannel);
            } else {
                // Kuyruk boş, çalmayı durdur
                botLog('info', 'Queue empty, disconnecting from voice channel');
                queue.playing = false;
                connection.destroy();
                voiceConnections.delete(message.guild.id);
                
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('✅ Müzik Bitti')
                    .setDescription('Kuyruk boş, ses kanalından ayrılıyorum.')
                    .setTimestamp();
                
                message.channel.send({ embeds: [embed] });
            }
        });
        
        // Hata durumu
        player.on('error', (error) => {
            botLog('error', 'Music player error', error);
            
            // Sonraki şarkıya geç
            queue.songs.shift();
            if (queue.songs.length > 0) {
                botLog('info', 'Skipping to next song due to error');
                playMusic(message, voiceChannel);
            } else {
                queue.playing = false;
                connection.destroy();
                voiceConnections.delete(message.guild.id);
                message.channel.send('❌ Müzik çalarken bir hata oluştu! Kuyruk boş, ses kanalından ayrılıyorum.');
            }
        });
        
        // Player'ı bağlantıya abone et
        botLog('info', 'Subscribing player to connection');
        connection.subscribe(player);
        
        // Şarkıyı çal
        botLog('info', 'Starting audio playback');
        player.play(resource);
        
    } catch (error) {
        botLog('error', 'Play music error', error);
        message.reply('❌ Müzik çalarken bir hata oluştu!');
    }
}

// STOP MUSIC FUNCTION
async function handleMusicStop(message) {
    const queue = getMusicQueue(message.guild.id);
    const connection = voiceConnections.get(message.guild.id);
    
    if (!queue.playing && !connection) {
        return message.reply('❌ Şu anda müzik çalmıyor!');
    }
    
    // Müziği durdur
    if (queue.player) {
        queue.player.stop();
    }
    
    // Kuyruğu temizle
    queue.songs = [];
    queue.playing = false;
    
    // Bağlantıyı kes
    if (connection) {
        connection.destroy();
        voiceConnections.delete(message.guild.id);
    }
    
    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('⏹️ Müzik Durduruldu')
        .setDescription('Müzik durduruldu ve ses kanalından ayrıldım.')
        .setTimestamp();
    
    message.reply({ embeds: [embed] });
}

// VOLUME HANDLER
async function handleVolume(message, args) {
    const queue = musicQueues.get(message.guild.id);
    
    if (!queue || !queue.playing) {
        return message.reply('❌ Şu anda çalan müzik yok!');
    }
    
    if (!args.length) {
        const currentVolume = queue.volume || 70;
        return message.reply(`🔊 Mevcut ses seviyesi: **${currentVolume}%**\nKullanım: \`!volume 50\` (1-100 arası)`);
    }
    
    const volume = parseInt(args[0]);
    if (isNaN(volume) || volume < 1 || volume > 100) {
        return message.reply('❌ Lütfen 1-100 arası bir ses seviyesi girin!');
    }
    
    // Volume'u kaydet
    queue.volume = volume;
    
    // Eğer resource varsa volume'u ayarla
    if (queue.player && queue.player.state.resource && queue.player.state.resource.volume) {
        queue.player.state.resource.volume.setVolume(volume / 100);
        message.reply(`🔊 Ses seviyesi **${volume}%** olarak ayarlandı!`);
    } else {
        message.reply(`🔊 Ses seviyesi **${volume}%** olarak kaydedildi! (Sonraki şarkıdan itibaren geçerli)`);
    }
}

// WATCH PARTY HANDLER
async function handleWatchParty(message, args) {
    if (!args.length) {
        return message.reply('❌ Lütfen bir YouTube linki veya video adı girin!\n**Örnekler:**\n`!party https://youtube.com/watch?v=...`\n`!party imagine dragons believer`');
    }
    
    const query = args.join(' ');
    let url = query;
    
    // Eğer URL değilse arama yap
    if (!query.includes('youtube.com/watch') && !query.includes('youtu.be/')) {
        try {
            botLog('info', `Searching YouTube for watch party: ${query}`);
            const searchResults = await youtubeSr.search(query, { limit: 1, type: 'video' });
            
            if (!searchResults || searchResults.length === 0) {
                return message.reply('❌ Arama sonucu bulunamadı! Lütfen farklı bir arama terimi deneyin.');
            }
            
            url = searchResults[0].url;
            botLog('info', `Found video for watch party: ${searchResults[0].title} - ${url}`);
        } catch (searchError) {
            botLog('error', 'YouTube search failed for watch party', searchError);
            return message.reply('❌ YouTube araması başarısız! Lütfen direkt link kullanın.');
        }
    }
    
    try {
        botLog('info', `Watch party requested by ${message.author.tag} for URL: ${url}`);
        
        // Video bilgilerini al
        let videoInfo;
        try {
            if (playdl.yt_validate(url) === 'video') {
                videoInfo = await playdl.video_info(url);
            } else {
                throw new Error('Invalid YouTube URL');
            }
        } catch (error) {
            return message.reply('❌ Video bilgileri alınamadı! Lütfen geçerli bir YouTube linki girin.');
        }
        
        // Kanal oluştur
        const categoryId = '1412056651787276462'; // Belirtilen kategori ID
        const channelName = `🎬-${videoInfo.video_details.title.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30)}`;
        
        const channel = await message.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: categoryId,
            reason: `Watch party created by ${message.author.tag}`,
            permissionOverwrites: [
                {
                    id: message.guild.roles.everyone,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
                }
            ]
        });
        
        botLog('info', `Watch party channel created: ${channel.name} (${channel.id})`);
        
        // Bot kanala katıl
        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });
            
            botLog('info', `Bot joined watch party channel: ${channel.name}`);
            
            // Bot'un presence'ını YouTube Together olarak ayarla
            client.user.setActivity('YouTube Together', { 
                type: 0, // PLAYING
                url: url 
            });
            
            // YouTube Together Activity başlat
            setTimeout(async () => {
                try {
                    // Bot'un etkinliği başlatması için REST API kullan
                    const response = await axios.post(
                        `https://discord.com/api/v10/channels/${channel.id}/invites`,
                        {
                            target_type: 2,
                            target_application_id: '880218394199220334'
                        },
                        {
                            headers: {
                                'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    
                    const activityUrl = `https://discord.gg/${response.data.code}`;
                    botLog('info', `YouTube Together activity started by bot: ${activityUrl}`);
                    
                    // Activity linkini kaydet
                    global.watchParties.get(channel.id).activityUrl = activityUrl;
                    
                    // Kullanıcılara detaylı bilgi ver
                    setTimeout(() => {
                        channel.send({
                            embeds: [new EmbedBuilder()
                                .setColor('#ff0000')
                                .setTitle('🎬 YouTube Together Etkinliği Hazır!')
                                .setDescription(`**Video:** ${videoInfo.video_details.title}`)
                                .addFields(
                                    { name: '📋 Adım 1', value: 'Bu ses kanalına katıl', inline: false },
                                    { name: '🎮 Adım 2', value: '"YouTube Together" butonuna tıkla', inline: false },
                                    { name: '🔗 Adım 3', value: `Video linkini yapıştır:\n\`${url}\``, inline: false },
                                    { name: '💡 İpucu', value: 'Etkinlik otomatik başlatıldı, sadece katılmanız yeterli!', inline: false }
                                )
                                .setThumbnail(videoInfo.video_details.thumbnails[0]?.url)
                                .setFooter({ text: 'Birlikte izlemenin keyfini çıkarın!' })
                            ]
                        });
                    }, 1000);
                    
                } catch (activityError) {
                    botLog('error', 'Failed to create YouTube Together activity', activityError);
                    
                    // Fallback: Manuel talimatlar
                    setTimeout(() => {
                        channel.send(`⚠️ **Otomatik etkinlik başlatılamadı, manuel başlatın:**\n\n1️⃣ Bu kanala katıl\n2️⃣ Kanal adının yanındaki **📺** simgesine tıkla\n3️⃣ "YouTube Together" seç\n4️⃣ Video linkini yapıştır: ${url}\n\n🎬 **Video:** ${videoInfo.video_details.title}`);
                    }, 1000);
                }
            }, 2000); // 2 saniye bekle
            
        } catch (joinError) {
            botLog('error', 'Failed to join watch party channel', joinError);
        }
        
        // Embed oluştur
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🎬 Watch Party Oluşturuldu!')
            .setDescription(`**${videoInfo.video_details.title}**`)
            .addFields(
                { name: '📺 Kanal', value: `<#${channel.id}>`, inline: true },
                { name: '⏱️ Süre', value: formatDuration(videoInfo.video_details.durationInSec), inline: true },
                { name: '👀 Görüntülenme', value: videoInfo.video_details.viewCount?.toLocaleString() || 'Bilinmiyor', inline: true },
                { name: '🔗 Video Linki', value: `[YouTube'da İzle](${url})`, inline: false }
            )
            .setThumbnail(videoInfo.video_details.thumbnails[0]?.url)
            .setFooter({ text: `${message.author.tag} tarafından oluşturuldu` })
            .setTimestamp();
        
        // Mesaj gönder
        const partyMessage = await message.reply({ 
            embeds: [embed],
            content: `🎉 **Watch Party başlatıldı!**\n\n📍 **Nasıl katılırım?**\n1️⃣ <#${channel.id}> kanalına katıl\n2️⃣ **"YouTube Together"** butonuna tıkla\n3️⃣ Birlikte izlemeye başla!\n\n🔗 **Video:** ${url}\n\n⚠️ **Not:** Kanal 1 saat sonra otomatik silinecek.\n💡 **İpucu:** YouTube Together etkinliği 2-3 saniye içinde aktif olacak!`
        });
        
        // Activity URL'sini sonradan ekle
        setTimeout(async () => {
            try {
                const partyData = global.watchParties.get(channel.id);
                if (partyData && partyData.activityUrl) {
                    const updatedEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('🎬 Watch Party Oluşturuldu!')
                        .setDescription(`**${videoInfo.video_details.title}**`)
                        .addFields(
                            { name: '📺 Kanal', value: `<#${channel.id}>`, inline: true },
                            { name: '⏱️ Süre', value: formatDuration(videoInfo.video_details.durationInSec), inline: true },
                            { name: '👀 Görüntülenme', value: videoInfo.video_details.viewCount?.toLocaleString() || 'Bilinmiyor', inline: true },
                            { name: '🔗 Video Linki', value: `[YouTube'da İzle](${url})`, inline: false },
                            { name: '🎮 YouTube Together', value: `[Etkinliğe Katıl](${partyData.activityUrl})`, inline: false }
                        )
                        .setThumbnail(videoInfo.video_details.thumbnails[0]?.url)
                        .setFooter({ text: `${message.author.tag} tarafından oluşturuldu` })
                        .setTimestamp();
                    
                    await partyMessage.edit({
                        embeds: [updatedEmbed],
                        content: `🎉 **Watch Party başlatıldı!**\n\n📍 **Nasıl katılırım?**\n1️⃣ <#${channel.id}> kanalına katıl\n2️⃣ **"YouTube Together"** butonuna tıkla VEYA [bu linke tıkla](${partyData.activityUrl})\n3️⃣ Birlikte izlemeye başla!\n\n🔗 **Video:** ${url}\n\n⚠️ **Not:** Kanal 1 saat sonra otomatik silinecek.`
                    });
                }
            } catch (updateError) {
                botLog('error', 'Failed to update party message with activity URL', updateError);
            }
        }, 3000); // 3 saniye bekle
        
        // 1 saat sonra kanalı sil ve bot'u çıkar
        setTimeout(async () => {
            try {
                // Bot'u kanaldan çıkar
                const connection = voiceConnections.get(message.guild.id);
                if (connection) {
                    connection.destroy();
                    voiceConnections.delete(message.guild.id);
                }
                
                await channel.delete('Watch party ended - auto cleanup');
                botLog('info', `Watch party channel auto-deleted: ${channel.name}`);
                
                // Watch party verisini temizle
                if (global.watchParties) {
                    global.watchParties.delete(channel.id);
                }
            } catch (error) {
                botLog('error', 'Failed to auto-delete watch party channel', error);
            }
        }, 60 * 60 * 1000); // 1 saat
        
        // Kanal bilgilerini kaydet
        const partyData = {
            channelId: channel.id,
            videoUrl: url,
            videoTitle: videoInfo.video_details.title,
            createdBy: message.author.id,
            createdAt: Date.now()
        };
        
        // Watch party verilerini geçici olarak sakla (isteğe bağlı)
        if (!global.watchParties) global.watchParties = new Map();
        global.watchParties.set(channel.id, partyData);
        
    } catch (error) {
        botLog('error', 'Watch party creation failed', error);
        message.reply('❌ Watch party oluşturulurken bir hata oluştu! Lütfen tekrar deneyin.');
    }
}

// Duration formatter helper
function formatDuration(duration) {
    if (!duration) return 'Bilinmiyor';
    
    // Eğer duration string ise (örn: "3:45"), direkt döndür
    if (typeof duration === 'string') {
        return duration;
    }
    
    // Eğer sayı ise, dakika:saniye formatına çevir
    const seconds = parseInt(duration);
    if (isNaN(seconds)) return 'Bilinmiyor';
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// WEB URL SEARCH FUNCTION
async function handleWebUrlSearch(message, args) {
    if (!args.length) {
        return message.reply('❌ Lütfen bir URL girin! Örnek: `!web_arama https://example.com`');
    }

    const url = args[0];
    
    // URL validation
    try {
        new URL(url);
    } catch {
        return message.reply('❌ Geçersiz URL! Lütfen geçerli bir web adresi girin.');
    }
    
    try {
        await message.channel.sendTyping();
        
        // URL'den sayfa içeriğini al
        const response = await axios.get(url, {
            timeout: 15000,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate'
            }
        });
        
        // HTML içeriğini basitçe temizle (gerçek bir HTML parser kullanmak daha iyi olur)
        let content = response.data
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        // İçeriği kısalt
        content = content.substring(0, 1000);
        
        // Gemini AI'ye özet çıkarmasını iste
        const summaryPrompt = `Bu web sayfası içeriğini Türkçe olarak özetle ve maksimum 3-4 cümle ile açıkla:\n\n${content}`;
        
        const result = await model.generateContent(summaryPrompt);
        const summary = result.response.text().trim();
        
        const embed = new EmbedBuilder()
            .setColor('#1e90ff')
            .setTitle('🌐 Web Sayfası Özeti')
            .addFields(
                { name: 'URL', value: url, inline: false },
                { name: 'Özet', value: summary, inline: false },
                { name: 'İsteyen', value: message.author.tag, inline: true }
            )
            .setFooter({ text: 'Powered by Gemini AI' })
            .setTimestamp();

        message.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Web URL search error:', error);
        
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            message.reply('❌ Web sitesine erişilemiyor! URL\'yi kontrol edin.');
        } else if (error.response?.status === 403) {
            message.reply('❌ Bu web sitesi bot erişimini engelliyor.');
        } else if (error.response?.status === 404) {
            message.reply('❌ Sayfa bulunamadı (404).');
        } else {
            message.reply('❌ Web sayfası analiz edilirken bir hata oluştu!');
        }
    }
}

// Login to Discord
botLog('info', 'Attempting to login to Discord...');
client.login(process.env.DISCORD_TOKEN).then(() => {
    botLog('info', 'Successfully logged in to Discord');
}).catch((error) => {
    botLog('error', 'Failed to login to Discord', error);
    process.exit(1);
});
