const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Muunganisho wa MongoDB[cite: 9]
const MONGODB_URI = process.env.MONGODB_URI || "WEKA_MONGO_URL_YAKO_HAPA"; 

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => console.log("MongoDB Connected Successfully"))
.catch(err => console.error("MongoDB Connection Error:", err));

// Database Schemas[cite: 9]
const userSchema = new mongoose.Schema({
    id: Number,
    fullName: String,
    whatsappNumber: { type: String, unique: true, index: true },
    photoData: String,
    seeking: String,
    bio: { type: String, default: "Mtu mzuri ninayependa mazungumzo ya maana." },
    region: { type: String, default: "Dar es Salaam" },
    age: { type: Number, default: 25 },
    freeMessagesLeft: { type: Number, default: 5 },
    subscriptionExpiresAt: { type: Date, default: null }
});

const messageSchema = new mongoose.Schema({
    id: Number,
    senderId: { type: String, index: true },
    receiverId: { type: String, index: true },
    text: String,
    photoData: String,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Kazi ndogo ya kusafisha namba[cite: 9]
function sanitizePhoneNumber(phone) {
    if (!phone) return "";
    let cleaned = phone.trim();
    if (cleaned.startsWith('+')) {
        cleaned = '0' + cleaned.replace(/^\+\d{1,3}/, '');
    }
    return cleaned;
}

// 1. KUJISAJILI[cite: 9]
app.post('/api/signup', async (req, res) => {
    try {
        let { fullName, whatsappNumber, photoData, seeking, region, age } = req.body;
        whatsappNumber = sanitizePhoneNumber(whatsappNumber);

        const existingUser = await User.findOne({ whatsappNumber });
        if (existingUser) {
            return res.status(400).json({ error: "Namba hii ya simu/WhatsApp imeshajisajili tayari!" });
        }

        if (!photoData || photoData.trim() === "") {
            photoData = "https://via.placeholder.com/150";
        }

        const count = await User.countDocuments();
        const newUser = new User({
            id: count + 1,
            fullName,
            whatsappNumber,
            photoData,
            seeking: seeking || "Mchumba wa Ndoa",
            region: region || "Dar es Salaam",
            age: age || 25,
            freeMessagesLeft: 5,
            subscriptionExpiresAt: null
        });

        await newUser.save();
        res.status(201).json({ message: "Umefanikiwa kujisajili!", user: newUser });
    } catch (err) {
        console.error("Hitilafu wakati wa kusajili:", err);
        res.status(500).json({ error: "Hitilafu ya seva wakati wa kujisajili." });
    }
});

// 2. KUINGIA (LOGIN)
app.post('/api/login', async (req, res) => {
    try {
        let { whatsappNumber } = req.body;
        whatsappNumber = sanitizePhoneNumber(whatsappNumber);
        
        const user = await User.findOne({ whatsappNumber });
        if (!user) {
            return res.status(404).json({ error: "Namba hii haijapatikana. Tafadhali jisajili kwanza." });
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu wakati wa kuingia." });
    }
});

// 3. KUPATA ORODHA YA WATUMIAJI[cite: 9]
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}).lean();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata watumiaji." });
    }
});

// 4. ADMIN TAKWIMU NA DASHBODI (Hatua ya 10)
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const now = new Date();
        const activeUsers = await User.countDocuments({
            $or: [
                { subscriptionExpiresAt: { $gt: now } },
                { freeMessagesLeft: { $gt: 0 } }
            ]
        });
        const paidUsers = await User.countDocuments({ subscriptionExpiresAt: { $gt: now } });
        const revenue = paidUsers * 2000;

        // Kupata usajili wa hivi karibuni
        const recentUsers = await User.find({}).sort({ _id: -1 }).limit(5).lean();

        res.json({
            totalUsers,
            activeUsers,
            paidUsers,
            activePasses: paidUsers,
            revenue,
            recentUsers
        });
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata takwimu za admin." });
    }
});

// 5. KUPATA MAZUNGUMZO KATI YA WATUMIAJI WAWILI[cite: 9]
app.get('/api/chat/:userId/:receiverId', async (req, res) => {
    try {
        const { userId, receiverId } = req.params;
        
        await Message.updateMany(
            { senderId: receiverId, receiverId: userId, read: false },
            { $set: { read: true } }
        );

        const messages = await Message.find({
            $or: [
                { senderId: userId, receiverId: receiverId },
                { senderId: receiverId, receiverId: userId }
            ]
        }).sort({ createdAt: 1 }).lean();

        const user = await User.findOne({ id: Number(userId) });
        if (!user) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

        let isAllowed = true;
        const now = new Date();
        if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > now) {
            isAllowed = true; 
        } else if (user.freeMessagesLeft <= 0) {
            isAllowed = false; 
        }

        res.json({
            messages,
            freeMessagesLeft: user.freeMessagesLeft,
            subscriptionExpiresAt: user.subscriptionExpiresAt,
            isAllowed
        });
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata mazungumzo." });
    }
});

// 6. KUPATA IDADI YA MESEJI ZISIZOSOMWA[cite: 9]
app.get('/api/messages/unread', async (req, res) => {
    try {
        let { user } = req.query;
        user = sanitizePhoneNumber(user);
        
        const currentUser = await User.findOne({ whatsappNumber: user });
        if (!currentUser) return res.json([]);

        const unreadMsgs = await Message.find({ receiverId: currentUser.id.toString(), read: false }).lean();
        const users = await User.find({}).lean();

        let unreadMap = {};
        unreadMsgs.forEach(m => {
            if (!unreadMap[m.senderId]) {
                const senderObj = users.find(u => u.id.toString() === m.senderId || u.whatsappNumber === m.senderId);
                unreadMap[m.senderId] = {
                    senderPhone: senderObj ? senderObj.whatsappNumber : m.senderId,
                    senderId: m.senderId,
                    senderName: senderObj ? senderObj.fullName : "Mtumiaji",
                    count: 0
                };
            }
            unreadMap[m.senderId].count += 1;
        });

        res.json(Object.values(unreadMap));
    } catch (err) {
        res.status(500).json({ error: "Hitilafu." });
    }
});

// 7. KUTUMA UJUMBE AU PICHA[cite: 9]
app.post('/api/chat/send', async (req, res) => {
    try {
        const { senderId, receiverId, text, photoData } = req.body;
        
        const senderUser = await User.findOne({ id: Number(senderId) });
        if (!senderUser) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

        const now = new Date();
        const hasActiveSub = senderUser.subscriptionExpiresAt && new Date(senderUser.subscriptionExpiresAt) > now;

        if (!hasActiveSub && senderUser.freeMessagesLeft <= 0) {
            return res.status(403).json({ error: "Ujumbe wako wa bure umeisha! Tafadhali lipa usajili.", locked: true });
        }

        const newMessage = new Message({
            id: Date.now(),
            senderId: senderId.toString(),
            receiverId: receiverId.toString(),
            text: text || "",
            photoData: photoData || null,
            read: false
        });

        await newMessage.save();

        if (!hasActiveSub) {
            senderUser.freeMessagesLeft -= 1;
            await senderUser.save();
        }

        res.json({
            success: true,
            message: newMessage,
            freeMessagesLeft: senderUser.freeMessagesLeft
        });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu wakati wa kutuma ujumbe." });
    }
});

// 8. KULIPIA USAJILI (TZS 2,000 kwa siku 5)[cite: 9]
app.post('/api/subscribe/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findOne({ id: Number(userId) });
        if (!user) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

        const now = new Date();
        let expiresAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); 

        user.subscriptionExpiresAt = expiresAt;
        user.freeMessagesLeft = 0;
        await user.save();

        res.json({
            success: true,
            message: "Malipo yamefanikiwa! Una siku 5 za kuchati bila kikomo.",
            expiresAt: expiresAt
        });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu ya malipo imetokea." });
    }
});

// ADMIN ROUTE[cite: 9]
app.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'admin.html');
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.status(404).send("Ukurasa wa Admin haupatikani kwenye folda kuu.");
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
