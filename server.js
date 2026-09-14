const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

function loadData(filePath, defaultVal) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2));
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        return defaultVal;
    }
}

function saveData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// 1. KUJISAJILI
app.post('/api/signup', (req, res) => {
    const { fullName, whatsappNumber, photoData, seeking } = req.body;
    let users = loadData(DATA_FILE, []);

    if (users.find(u => u.whatsappNumber === whatsappNumber)) {
        return res.status(400).json({ error: "Namba hii ya WhatsApp imeshajisajili tayari!" });
    }

    const newUser = {
        id: users.length > 0 ? users[users.length - 1].id + 1 : 1,
        fullName,
        whatsappNumber,
        photoUrl: photoData || "https://via.placeholder.com/150",
        seeking: seeking || "Mchumba",
        freeMessagesLeft: 5,
        subscriptionExpiresAt: null
    };

    users.push(newUser);
    saveData(DATA_FILE, users);
    res.status(201).json({ message: "Umefanikiwa kujisajili!", user: newUser });
});

// 2. KUPATA ORODHA YA WATUMIAJI (Inatumika na Login na Admin)
app.get('/api/admin/users', (req, res) => {
    res.json(loadData(DATA_FILE, []));
});

// 3. KUPATA ORODHA YA DISCOVERY
app.get('/api/users/discover', (req, res) => {
    res.json(loadData(DATA_FILE, []));
});

// 4. KUPATA MAZUNGUMZO KATI YA WATU WAWILI
app.get('/api/chat/:user1/:user2', (req, res) => {
    const { user1, user2 } = req.params;
    let messages = loadData(MESSAGES_FILE, []);
    let users = loadData(DATA_FILE, []);

    const sender = users.find(u => u.id == user1);
    const now = new Date();
    
    const hasFreeMsgs = sender && sender.freeMessagesLeft > 0;
    const hasActiveSub = sender && sender.subscriptionExpiresAt && new Date(sender.subscriptionExpiresAt) > now;
    const isAllowed = hasFreeMsgs || hasActiveSub;

    const conversation = messages.filter(m => 
        (m.senderId == user1 && m.receiverId == user2) || 
        (m.senderId == user2 && m.receiverId == user1)
    );

    res.json({
        messages: conversation,
        isAllowed: isAllowed,
        freeMessagesLeft: sender ? sender.freeMessagesLeft : 0
    });
});

// 5. KUTUMA UJUMBE NDANI YA MFUMO
app.post('/api/chat/send', (req, res) => {
    const { senderId, receiverId, text } = req.body;
    let users = loadData(DATA_FILE, []);
    let messages = loadData(MESSAGES_FILE, []);

    const sender = users.find(u => u.id == senderId);
    if (!sender) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

    const now = new Date();
    const hasFreeMsgs = sender.freeMessagesLeft > 0;
    const hasActiveSub = sender.subscriptionExpiresAt && new Date(sender.subscriptionExpiresAt) > now;

    if (!hasFreeMsgs && !hasActiveSub) {
        return res.status(403).json({ 
            error: "Ujumbe wako wa bure umeisha! Tafadhali lipa TZS 2,000 ili uendelee kuchati.",
            locked: true 
        });
    }

    if (!hasActiveSub && hasFreeMsgs) {
        sender.freeMessagesLeft -= 1;
        saveData(DATA_FILE, users);
    }

    const newMessage = {
        id: Date.now(),
        senderId: parseInt(senderId),
        receiverId: parseInt(receiverId),
        text,
        createdAt: new Date()
    };

    messages.push(newMessage);
    saveData(MESSAGES_FILE, messages);

    res.json({
        success: true,
        message: newMessage,
        freeMessagesLeft: sender.freeMessagesLeft
    });
});

// 6. KULIPIA TZS 2,000 (Siku 5)
app.post('/api/subscribe/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    let users = loadData(DATA_FILE, []);
    const user = users.find(u => u.id === userId);

    if (!user) return res.status(404).json({ error: "Mtumiaji hajapatikana!" });

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 5);

    user.subscriptionExpiresAt = expiryDate;
    saveData(DATA_FILE, users);

    res.json({ message: "Malipo yamethibitishwa! Una siku 5 za kuchati bila kikomo.", expiresAt: user.subscriptionExpiresAt });
});

// 7. ROUTE YA KUFUNGUA ADMIN (Lipo nje kwenye root directory pamoja na server.js)
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
