const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI || 'WENDA_WEKA_LINK_YA_MONGODB_YAKO_HAPA';

mongoose.connect(MONGO_URI)
    .then(() => console.log('Imefaulu kuunganishwa na MongoDB!'))
    .catch(err => console.error('Hitilafu ya kuunganisha MongoDB:', err));

// SCHEMAS NA MODELS ZA MONGODB
const userSchema = new mongoose.Schema({
    id: Number,
    fullName: String,
    whatsappNumber: { type: String, unique: true },
    photoData: String,
    seeking: String
});

const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    text: String,
    photoData: { type: String, default: null }, // Sehemu ya kuhifadhi picha kwenye chat
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// 1. KUJISAJILI
app.post('/api/signup', async (req, res) => {
    try {
        const { fullName, whatsappNumber, photoData, seeking } = req.body;
        
        const existingUser = await User.findOne({ whatsappNumber });
        if (existingUser) {
            return res.status(400).json({ error: "Namba hii ya WhatsApp imeshajisajili tayari!" });
        }

        const count = await User.countDocuments();
        const newUser = new User({
            id: count + 1,
            fullName,
            whatsappNumber,
            photoData: photoData || "https://via.placeholder.com/150",
            seeking: seeking || "Mchumba"
        });

        await newUser.save();
        res.status(201).json({ message: "Umefanikiwa kujisajili!", user: newUser });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu ya seva wakati wa kujisajili." });
    }
});

// 2. KUPATA ORODHA YA WATUMIAJI
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata watumiaji." });
    }
});

// 3. KUPATA MAZUNGUMZO (MESEJI)
app.get('/api/messages', async (req, res) => {
    try {
        const { sender, receiver } = req.query;
        const messages = await Message.find({
            $or: [
                { sender: sender, receiver: receiver },
                { sender: receiver, receiver: sender }
            ]
        }).sort({ createdAt: 1 });

        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata meseji." });
    }
});

// 4. KUTUMA UJUMBE AU PICHA (FREE UNLIMITED)
app.post('/api/messages', async (req, res) => {
    try {
        const { sender, receiver, text, photoData } = req.body;
        
        const senderUser = await User.findOne({ whatsappNumber: sender });
        if (!senderUser) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

        const newMessage = new Message({
            sender,
            receiver,
            text: text || "",
            photoData: photoData || null
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
