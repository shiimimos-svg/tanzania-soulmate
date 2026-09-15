const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Muunganisho wa MongoDB ukiwa na opts za kuzuia kuchelewa (Connection Pooling & Optimization)
const MONGODB_URI = process.env.MONGODB_URI || "WEKA_MONGO_URL_YAKO_HAPA"; 

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000, // Epuka kusubiri sana kama database haipatikani mara moja
    socketTimeoutMS: 45000,
})
.then(() => console.log("MongoDB Connected Successfully"))
.catch(err => console.error("MongoDB Connection Error:", err));

// Database Schemas (Miundo ya Data)
const userSchema = new mongoose.Schema({
    id: Number,
    fullName: String,
    whatsappNumber: { type: String, unique: true, index: true },
    photoData: String,
    seeking: String
});

const messageSchema = new mongoose.Schema({
    id: Number,
    sender: { type: String, index: true },
    receiver: { type: String, index: true },
    text: String,
    photoData: String,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Kazi ndogo ya kusafisha namba (kuondoa alama ya kuongeza na kodi za nchi, kisha kuweka 0 mbele)
function sanitizePhoneNumber(phone) {
    if (!phone) return "";
    let cleaned = phone.trim();
    if (cleaned.startsWith('+')) {
        cleaned = '0' + cleaned.replace(/^\+\d{1,3}/, '');
    }
    return cleaned;
}

// 1. KUJISAJILI
app.post('/api/signup', async (req, res) => {
    try {
        let { fullName, whatsappNumber, photoData, seeking } = req.body;
        
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
            photoData: photoData,
            seeking: seeking || "Urafiki Tu"
        });

        await newUser.save();
        res.status(201).json({ message: "Umefanikiwa kujisajili!", user: newUser });
    } catch (err) {
        console.error("Hitilafu wakati wa kusajili:", err);
        res.status(500).json({ error: "Hitilafu ya seva wakati wa kujisajili." });
    }
});

// 2. KUPATA ORODHA YA WATUMIAJI
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}).lean(); // Tumia .lean() kuongeza kasi ya kusoma data kwenye database
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata watumiaji." });
    }
});

// 3. KUPATA MAZUNGUMZO NA KUWEKA ALAMA YA KUSOMWA (READ)
app.get('/api/messages', async (req, res) => {
    try {
        let { sender, receiver } = req.query;
        sender = sanitizePhoneNumber(sender);
        receiver = sanitizePhoneNumber(receiver);
        
        await Message.updateMany(
            { sender: receiver, receiver: sender, read: false },
            { $set: { read: true } }
        );

        const conversation = await Message.find({
            $or: [
                { sender: sender, receiver: receiver },
                { sender: receiver, receiver: sender }
            ]
        }).sort({ createdAt: 1 }).lean();

        res.json(conversation);
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata meseji." });
    }
});

// 3.1 KUPATA IDADI YA MESEJI ZISIZOSOMWA (UNREAD COUNT)
app.get('/api/messages/unread', async (req, res) => {
    try {
        let { user } = req.query;
        user = sanitizePhoneNumber(user);
        
        const unreadMsgs = await Message.find({ receiver: user, read: false }).lean();
        const users = await User.find({}).lean();

        let unreadMap = {};
        unreadMsgs.forEach(m => {
            if (!unreadMap[m.sender]) {
                const senderObj = users.find(u => u.whatsappNumber === m.sender);
                unreadMap[m.sender] = {
                    senderPhone: m.sender,
                    senderName: senderObj ? senderObj.fullName : "Mtumiaji",
                    count: 0
                };
            }
            unreadMap[m.sender].count += 1;
        });

        res.json(Object.values(unreadMap));
    } catch (err) {
        res.status(500).json({ error: "Hitilafu." });
    }
});

// 4. KUTUMA UJUMBE AU PICHA
app.post('/api/messages', async (req, res) => {
    try {
        let { sender, receiver, text, photoData } = req.body;
        
        sender = sanitizePhoneNumber(sender);
        receiver = sanitizePhoneNumber(receiver);

        const senderUser = await User.findOne({ whatsappNumber: sender });
        if (!senderUser) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

        const newMessage = new Message({
            id: Date.now(),
            sender,
            receiver,
            text: text || "",
            photoData: photoData || null,
            read: false
        });

        await newMessage.save();

        res.json({
            success: true,
            message: newMessage
        });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu wakati wa kutuma ujumbe." });
    }
});

// ADMIN ROUTE
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
