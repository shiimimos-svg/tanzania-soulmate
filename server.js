const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

const MONGODB_URI = process.env.MONGODB_URI || "WEKA_MONGO_URL_YAKO_HAPA"; 

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => console.log("MongoDB Connected Successfully for Tanzania Soul Mate"))
.catch(err => console.error("MongoDB Connection Error:", err));

const userSchema = new mongoose.Schema({
    id: Number,
    fullName: String,
    whatsappNumber: { type: String, unique: true, index: true },
    photoData: String, 
    extraPhotos: { type: [String], default: [] }, 
    seeking: String,
    bio: { type: String, default: "Mtu mzuri ninayependa mazungumzo ya maana." },
    region: { type: String, default: "Dar es Salaam" },
    age: { type: Number, default: 25 },
    freeMessagesLeft: { type: Number, default: 5 },
    subscriptionExpiresAt: { type: Date, default: null },
    otpCode: String,
    otpExpires: Date,
    isVerified: { type: Boolean, default: false }
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

function sanitizePhoneNumber(phone) {
    if (!phone) return "";
    let cleaned = phone.trim();
    if (cleaned.startsWith('+')) {
        cleaned = '0' + cleaned.replace(/^\+\d{1,3}/, '');
    }
    return cleaned;
}

// 1. API ya Kutuma OTP
app.post('/api/auth/send-otp', async (req, res) => {
    try {
        let { whatsappNumber } = req.body;
        whatsappNumber = sanitizePhoneNumber(whatsappNumber);

        if (!whatsappNumber) {
            return res.status(400).json({ error: "Tafadhali jaza namba ya WhatsApp." });
        }

        const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        let user = await User.findOne({ whatsappNumber });
        if (!user) {
            const count = await User.countDocuments();
            user = new User({
                id: count + 1,
                whatsappNumber,
                fullName: "Mtumiaji Mpya",
                otpCode,
                otpExpires,
                isVerified: false
            });
        } else {
            user.otpCode = otpCode;
            user.otpExpires = otpExpires;
        }

        await user.save();
        res.json({ success: true, message: "OTP imetumwa mafanikio!", debugOtp: otpCode });
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kutuma OTP." });
    }
});

// 2. API ya Kuhakiki OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        let { whatsappNumber, otpCode } = req.body;
        whatsappNumber = sanitizePhoneNumber(whatsappNumber);

        const user = await User.findOne({ whatsappNumber });
        if (!user) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

        if (!user.otpCode || user.otpCode !== otpCode) {
            return res.status(400).json({ error: "Namba ya OTP si sahihi!" });
        }

        if (user.otpExpires && new Date() > new Date(user.otpExpires)) {
            return res.status(400).json({ error: "Muda wa OTP umeisha. Omba nyingine." });
        }

        user.isVerified = true;
        user.otpCode = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.json({ success: true, message: "Namba imethibitishwa!", user });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu wakati wa kuhakiki OTP." });
    }
});

// 3. API ya Kukamilisha Usajili
app.post('/api/signup', async (req, res) => {
    try {
        let { fullName, whatsappNumber, photoData, seeking, region, age } = req.body;
        whatsappNumber = sanitizePhoneNumber(whatsappNumber);

        let user = await User.findOne({ whatsappNumber });
        if (!user) return res.status(404).json({ error: "Tafadhali thibitisha namba yako kwanza." });

        if (!photoData || photoData.trim() === "") {
            photoData = "https://via.placeholder.com/150";
        }

        user.fullName = fullName;
        user.photoData = photoData;
        user.seeking = seeking || "Mchumba wa Ndoa";
        user.region = region || "Dar es Salaam";
        user.age = age || 25;
        user.isVerified = true;

        await user.save();
        res.status(201).json({ message: "Umefanikiwa kujisajili Tanzania Soul Mate!", user });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu ya seva wakati wa kujisajili." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        let { whatsappNumber } = req.body;
        whatsappNumber = sanitizePhoneNumber(whatsappNumber);
        
        const user = await User.findOne({ whatsappNumber });
        if (!user) return res.status(404).json({ error: "Namba hii haijapatikana." });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu wakati wa kuingia." });
    }
});

// 4. API ya Kuongeza Picha za Ziada
app.post('/api/user/add-photo', async (req, res) => {
    try {
        const { userId, photoData } = req.body;
        const user = await User.findOne({ id: Number(userId) });
        if (!user) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

        if (!user.extraPhotos) user.extraPhotos = [];
        if (user.extraPhotos.length >= 4) {
            return res.status(400).json({ error: "Unaweza kuweka picha za ziada zisizozidi 4 tu." });
        }

        user.extraPhotos.push(photoData);
        await user.save();
        res.json({ success: true, extraPhotos: user.extraPhotos });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu wakati wa kuhifadhi picha." });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const { region, minAge, maxAge, seeking } = req.query;
        let query = {};

        if (region && region !== 'All' && region !== '') {
            query.region = { $regex: new RegExp(region, 'i') };
        }

        if (minAge || maxAge) {
            query.age = {};
            if (minAge) query.age.$gte = Number(minAge);
            if (maxAge) query.age.$lte = Number(maxAge);
        }

        if (seeking && seeking !== 'All' && seeking !== '') {
            query.seeking = seeking;
        }

        const users = await User.find(query).lean();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata watumiaji." });
    }
});

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
        const recentUsers = await User.find({}).sort({ _id: -1 }).limit(5).lean();

        res.json({ totalUsers, activeUsers, paidUsers, activePasses: paidUsers, revenue, recentUsers });
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata takwimu za admin." });
    }
});

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

// --- API MPYA ILIYONGEZWA KUSAIDIA KITONE CHEKUNDU CHA UNREAD ---
app.get('/api/messages/unread-count', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ error: "User ID inahitajika" });
        }

        const unreadCount = await Message.countDocuments({ 
            receiverId: userId.toString(), 
            read: false 
        });
        
        res.json({ 
            hasUnread: unreadCount > 0, 
            count: unreadCount 
        });
    } catch (err) {
        console.error("Hitilafu kwenye unread-count:", err);
        res.status(500).json({ error: "Hitilafu ya seva" });
    }
});

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

        res.json({ success: true, message: newMessage, freeMessagesLeft: senderUser.freeMessagesLeft });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu wakati wa kutuma ujumbe." });
    }
});

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
            message: "Malipo yamethibitishwa! Una siku 5 za kuchati bila kikomo kupitia Tanzania Soul Mate.",
            expiresAt: expiresAt
        });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu ya malipo imetokea." });
    }
});

app.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'admin.html');
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.status(404).send("Ukurasa wa Admin haupatikani.");
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tanzania Soul Mate Server running on port ${PORT}`);
});
