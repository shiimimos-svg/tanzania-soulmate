const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Weka URI ya MongoDB kutoka kwenye Environment Variables za Render
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB imeunganishwa kwa mafanikio!'))
    .catch(err => console.error('Hitilafu ya kuunganisha MongoDB:', err));

// Schemas na Models za Database
const userSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    fullName: String,
    whatsappNumber: { type: String, unique: true },
    photoUrl: String,
    lookingFor: { type: String, default: 'Natafuta uhusiano mzuri' },
    isPhotoApproved: { type: Boolean, default: true },
    freeMessagesLeft: { type: Number, default: 5 },
    isPaid: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    senderId: String,
    receiverId: String,
    messageText: String,
    imageUrl: String,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Folda ya uploads ya picha
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// 1. Kusajili mtumiaji mpya
app.post('/api/signup', upload.single('photoFile'), async (req, res) => {
    try {
        const { fullName, whatsappNumber, lookingFor } = req.body;
        const photoFile = req.file;

        if (!fullName || !whatsappNumber || !photoFile) {
            return res.status(400).json({ error: 'Tafadhali jaza taarifa zote na uweke picha!' });
        }

        // Angalia kama namba ya WhatsApp imeshasajiliwa tayari
        const existingUser = await User.findOne({ whatsappNumber });
        if (existingUser) {
            return res.status(400).json({ error: 'Namba hii ya WhatsApp imeshasajiliwa tayari. Tafadhali Log In!' });
        }

        const lastUser = await User.findOne().sort({ id: -1 });
        const newId = lastUser ? lastUser.id + 1 : 1;
        const photoUrl = `/uploads/${photoFile.filename}`;

        const newUser = new User({
            id: newId,
            fullName,
            whatsappNumber,
            photoUrl,
            lookingFor: lookingFor || 'Natafuta uhusiano mzuri',
            isPhotoApproved: true,
            freeMessagesLeft: 5,
            isPaid: false
        });

        await newUser.save();
        res.status(200).json({ message: 'Umefanikiwa kujisajili!', user: newUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Hitilafu kwenye seva.' });
    }
});

// 2. API ya Log In
app.post('/api/login', async (req, res) => {
    try {
        const { whatsappNumber } = req.body;
        if (!whatsappNumber) {
            return res.status(400).json({ error: 'Tafadhali weka namba ya WhatsApp!' });
        }

        const user = await User.findOne({ whatsappNumber: whatsappNumber.trim() });
        if (!user) {
            return res.status(404).json({ error: 'Akaunti yenye namba hii haipo. Tafadhali jisajili kwanza!' });
        }

        res.json({ success: true, message: 'Umeingia vizuri!', user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Hitilafu kwenye seva.' });
    }
});

// 3. Discover Users
app.get('/api/users/discover', async (req, res) => {
    try {
        const users = await User.find();
        const sanitizedUsers = users.map(u => ({
            id: u.id,
            fullName: u.fullName,
            photoUrl: u.photoUrl,
            lookingFor: u.lookingFor || 'Natafuta uhusiano mzuri',
            hasUnlockedWhatsApp: u.isPaid
        }));
        res.json(sanitizedUsers);
    } catch (err) {
        res.status(500).json({ error: 'Hitilafu ya seva.' });
    }
});

// 4. Admin Users List
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Hitilafu ya seva.' });
    }
});

// 5. Kutuma Meseji
app.post('/api/chat/send', upload.single('imageFile'), async (req, res) => {
    try {
        const { senderId, receiverId, messageText } = req.body;
        const imageFile = req.file;

        let sender = await User.findOne({ id: Number(senderId) });
        if (!sender) {
            return res.status(404).json({ error: 'Mtumaji hapatikani kwenye mfumo.' });
        }

        if (!sender.isPaid) {
            if (sender.freeMessagesLeft <= 0) {
                return res.status(403).json({ 
                    error: 'Meseji zako za bure zimeisha! Tafadhali lipia.',
                    requiresPayment: true 
                });
            }
            sender.freeMessagesLeft -= 1;
            await sender.save();
        }

        let imageUrl = imageFile ? `/uploads/${imageFile.filename}` : null;

        const newMessage = new Message({
            id: Date.now(),
            senderId: String(senderId),
            receiverId: String(receiverId),
            messageText: messageText || '',
            imageUrl: imageUrl
        });

        await newMessage.save();

        res.json({ 
            success: true, 
            message: newMessage, 
            freeMessagesLeft: sender.freeMessagesLeft,
            isPaid: sender.isPaid 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Hitilafu kwenye seva.' });
    }
});

// 6. Kusoma Meseji
app.get('/api/chat/messages/:user1/:user2', async (req, res) => {
    try {
        const { user1, user2 } = req.params;
        const conversation = await Message.find({
            $or: [
                { senderId: String(user1), receiverId: String(user2) },
                { senderId: String(user2), receiverId: String(user1) }
            ]
        }).sort({ createdAt: 1 });

        res.json(conversation);
    } catch (err) {
        res.status(500).json({ error: 'Hitilafu ya seva.' });
    }
});

// 7. Malipo
app.post('/api/pay', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findOne({ id: Number(userId) });

        if (!user) return res.status(404).json({ error: 'Mtumiaji hapatikani.' });

        user.isPaid = true;
        await user.save();

        res.json({ success: true, message: 'Malipo yamefanikiwa!', whatsappNumber: user.whatsappNumber });
    } catch (err) {
        res.status(500).json({ error: 'Hitilafu ya seva.' });
    }
});

// 8. Admin Futa Mtumiaji
app.delete('/api/admin/user/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const deletedUser = await User.findOneAndDelete({ id: Number(userId) });

        if (!deletedUser) {
            return res.status(404).json({ error: 'Mtumiaji hajapatikana.' });
        }

        res.json({ success: true, message: 'Akaunti imefutwa kwa mafanikio!' });
    } catch (err) {
        res.status(500).json({ error: 'Hitilafu ya seva.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
