const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Muunganisho wa MongoDB Atlas kwa ajili ya Bots na Messages
const MONGO_URI = "mongodb+srv://shiimimos_db_user:Shimilimana123456789@cluster0.du5ze4u.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("Imeunganishwa na MongoDB Atlas kwa mafanikio kwenye server.js!"))
  .catch(err => console.error("Hitilafu ya kuunganisha na Database:", err));

// Schema ya Bot Profile kutoka MongoDB
const botProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  gender: { type: String, enum: ['Male', 'Female'], required: true },
  age: { type: Number, required: true },
  profilePicture: { type: String, required: true },
  bio: { type: String },
  isAlwaysOnline: { type: Boolean, default: true },
  lastActive: { type: Date, default: Date.now }
});

const BotProfile = mongoose.model('BotProfile', botProfileSchema);

// Schema ya Messages (Ujumbe wa Chat)
const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  recipient: { type: String, required: true },
  content: { type: String, required: true },
  isBotResponse: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

const DATA_FILE = path.join(__dirname, 'users.json');

// Kazi ya kusoma data kutoka kwenye faili la JSON
function loadUsers() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
        }
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Hitilafu ya kusoma faili la data:", err);
        return [];
    }
}

// Kazi ya kuandika na kuhifadhi data kwenye faili la JSON
function saveUsers(users) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error("Hitilafu ya kuhifadhi faili la data:", err);
    }
}

// --- SUBSCRIPTION GUARD MIDDLEWARE ---
async function checkSubscription(req, res, next) {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(401).json({ error: "Tafadhali ingia kwenye akaunti yako kwanza." });
        }

        const users = loadUsers();
        const user = users.find(u => u.id == userId || u._id == userId);

        if (!user) {
            return res.status(404).json({ error: "Mtumiaji hajapatikana kwenye mfumo." });
        }

        const now = new Date();
        const hasFreeMsgs = user.freeMessagesLeft > 0;
        const hasActiveSub = user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > now;

        if (!hasFreeMsgs && !hasActiveSub) {
            return res.status(403).json({ 
                error: "Ujumbe wako wa bure umeisha! Tafadhali lipa TZS 2,000 ili uendelee kuchati.",
                requiresSubscription: true 
            });
        }

        // Kama ana ujumbe wa bure, mpunguze moja
        if (hasFreeMsgs && !hasActiveSub) {
            user.freeMessagesLeft -= 1;
            saveUsers(users);
        }

        next();
    } catch (err) {
        console.error("Hitilafu kwenye Subscription Guard:", err);
        res.status(500).json({ error: "Hitilafu ya kimfumo kwenye uhakiki wa malipo." });
    }
}

// 1. URASILIMALI WA KUJISAJILI (SIGNUP)
app.post('/api/signup', (chombo, jibu) => {
    const { fullName, whatsappNumber, photoUrl } = chombo.body;
    let users = loadUsers();

    const existingUser = users.find(u => u.whatsappNumber === whatsappNumber);
    if (existingUser) {
        return jibu.status(400).json({ error: "Namba hii ya WhatsApp imeshajisajili tayari!" });
    }

    const newUser = {
        id: users.length > 0 ? users[users.length - 1].id + 1 : 1,
        fullName,
        whatsappNumber,
        photoUrl,
        isPhotoApproved: false, 
        freeMessagesLeft: 3,    
        subscriptionExpiresAt: null, 
        createdAt: new Date()
    };

    users.push(newUser);
    saveUsers(users);

    jibu.status(201).json({
        message: "Umefanikiwa kujisajili! Tafadhali subiri Admin ahakiki picha yako ili uanze kutumia huduma.",
        user: newUser
    });
});

// 2. KUONESHA ORODHA YOTE YA WATUMIAJI KWA AJILI YA ADMIN
app.get('/api/admin/users', (chombo, jibu) => {
    const users = loadUsers();
    jibu.json(users);
});

// 3. KUIDHINISHA PICHA (ADMIN APPROVAL)
app.post('/api/admin/approve-photo/:userId', (chombo, jibu) => {
    const userId = parseInt(chombo.params.userId);
    let users = loadUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
        return jibu.status(404).json({ error: "Mtumiaji hajapatikana!" });
    }

    user.isPhotoApproved = true; 
    saveUsers(users);

    jibu.json({ message: `Picha ya ${user.fullName} imeidhinishwa kikamilifu! Sasa anaweza kuendelea.`, user });
});

// 4. KUSHUGHULIKIA MALIPO YA TZS 2,000 (Siku 5 za Uhakika)
app.post('/api/subscribe/:userId', (chombo, jibu) => {
    const userId = parseInt(chombo.params.userId);
    let users = loadUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
        return jibu.status(404).json({ error: "Mtumiaji hajapatikana!" });
    }

    if (!user.isPhotoApproved) {
        return jibu.status(403).json({ error: "Huruhusiwi kulipia mpaka picha yako ihakikiwe na Admin kwanza!" });
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 5);

    user.subscriptionExpiresAt = expiryDate;
    user.freeMessagesLeft = 0; 
    saveUsers(users);

    jibu.json({ 
        message: "Malipo ya TZS 2,000 yamethibitishwa kikamilifu! Una siku 5 za kuchati na kufurahia TanzaniaSoulMate.",
        expiresAt: user.subscriptionExpiresAt 
    });
});

// 5. KUONA ORODHA YA WATUMIAJI WOTE WALIOPITISHWA NA ADMIN (Discovery)
app.get('/api/users/discover', (chombo, jibu) => {
    const users = loadUsers();
    const now = new Date();
    
    const activeUsers = users.filter(u => {
        if (!u.isPhotoApproved) return false;
        
        const hasFreeMsgs = u.freeMessagesLeft > 0;
        const hasActiveSub = u.subscriptionExpiresAt && new Date(u.subscriptionExpiresAt) > now;
        
        return hasFreeMsgs || hasActiveSub;
    });

    jibu.json(activeUsers);
});

// 6. KUTUMA LIKE AU KUUNGANISHA NA WHATSAPP
app.post('/api/like/:userId', (chombo, jibu) => {
    const users = loadUsers();
    const targetUserId = parseInt(chombo.params.userId);
    const targetUser = users.find(u => u.id === targetUserId);

    if (!targetUser) {
        return jibu.status(404).json({ error: "Mtumiaji hajapatikana!" });
    }

    jibu.json({
        message: `Umemtumia Like ${targetUser.fullName}! Unaweza kuendeleza mazungumzo kupitia WhatsApp yake.`,
        whatsappNumber: targetUser.whatsappNumber
    });
});

// --- NEW CHAT & BOT API ENDPOINTS ---

// Kupata orodha ya bot zote 500 kutoka MongoDB kwa ajili ya Frontend
app.get('/api/bots', async (chombo, jibu) => {
    try {
        const bots = await BotProfile.find({});
        jibu.status(200).json(bots);
    } catch (error) {
        console.error("Hitilafu ya kupata bot:", error);
        jibu.status(500).json({ error: "Imeshindikana kupata orodha ya bot." });
    }
});

// Kutuma ujumbe na kupokea jibu la kiotomatiki kutoka kwa Bot (Imewekewa CheckSubscription Guard)
app.post('/api/chat', checkSubscription, async (chombo, jibu) => {
    try {
        const { botId, userMessage, userId } = chombo.body;

        // Hifadhi ujumbe uliotumwa na mtumiaji
        const userMsgDoc = new Message({
            sender: userId || 'guest_user',
            recipient: botId,
            content: userMessage,
            isBotResponse: false
        });
        await userMsgDoc.save();

        // Tafuta bot husika kwenye database
        const bot = await BotProfile.findById(botId);
        if (!bot) {
            return jibu.status(404).json({ error: "Bot haipatikani kwenye mfumo." });
        }

        // Andaa majibu ya kiotomatiki yanayoendana na wasifu wa bot
        const autoReplies = [
            `Habari! Mimi ni ${bot.name}. Nimefurahi sana kusikia kutoka kwako leo.`,
            `Nashukuru kwa ujumbe wako! ${bot.bio} Ungependa tujadili nini zaidi?`,
            `Hiyo ni nzuri sana! Niambie zaidi kukuhusu mpenzi.`,
            `Uko vizuri sana! Tutaendelea kupiga stori muda si mrefu, mambo yakoje huko ulipo?`
        ];
        const randomReply = autoReplies[Math.floor(Math.random() * autoReplies.length)];

        // Hifadhi jibu la bot kwenye database
        const botMsgDoc = new Message({
            sender: botId,
            recipient: userId || 'guest_user',
            content: randomReply,
            isBotResponse: true
        });
        await botMsgDoc.save();

        jibu.status(200).json({ 
            reply: randomReply, 
            botName: bot.name,
            botPicture: bot.profilePicture 
        });
    } catch (error) {
        console.error("Hitilafu kwenye chat route:", error);
        jibu.status(500).json({ error: "Imeshindikana kuchakata ujumbe wako." });
    }
});

// Anzisha Seva kwa ajili ya Render ('0.0.0.0')
app.listen(PORT, '0.0.0.0', () => {
    console.log(`TanzaniaSoulMate server inafanya kazi kwenye port ${PORT}`);
});
