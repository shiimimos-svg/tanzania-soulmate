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
        photoData: photoData || "https://via.placeholder.com/150",
        seeking: seeking || "Mchumba",
        freeMessagesLeft: 5,
        subscriptionExpiresAt: null
    };

    users.push(newUser);
    saveData(DATA_FILE, users);
    res.status(201).json({ message: "Umefanikiwa kujisajili!", user: newUser });
});

// 2. KUPATA ORODHA YA WATUMIAJI
app.get('/api/admin/users', (req, res) => {
    res.json(loadData(DATA_FILE, []));
});

// 3. KUPATA MAZUNGUMZO KATI YA WATU WAWILI (Kupitia Namba za WhatsApp au IDs)
app.get('/api/messages', (req, res) => {
    const { sender, receiver } = req.query;
    let messages = loadData(MESSAGES_FILE, []);

    const conversation = messages.filter(m => 
        (m.sender === sender && m.receiver === receiver) || 
        (m.sender === receiver && m.receiver === sender)
    );

    res.json(conversation);
});

// 4. KUTUMA UJUMBE
app.post('/api/messages', (req, res) => {
    const { sender, receiver, text } = req.body;
    let users = loadData(DATA_FILE, []);
    let messages = loadData(MESSAGES_FILE, []);

    const senderUser = users.find(u => u.whatsappNumber === sender);
    if (!senderUser) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

    const now = new Date();
    const hasFreeMsgs = senderUser.freeMessagesLeft > 0;
    const hasActiveSub = senderUser.subscriptionExpiresAt && new Date(senderUser.subscriptionExpiresAt) > now;

    if (!hasFreeMsgs && !hasActiveSub) {
        return res.status(403).json({ 
            error: "Ujumbe wako wa bure umeisha! Tafadhali lipa TZS 2,000 ili uendelee kuchati.",
            locked: true 
        });
    }

    if (!hasActiveSub && hasFreeMsgs) {
        senderUser.freeMessagesLeft -= 1;
        saveData(DATA_FILE, users);
    }

    const newMessage = {
        id: Date.now(),
        sender,
        receiver,
        text,
        createdAt: new Date()
    };

    messages.push(newMessage);
    saveData(MESSAGES_FILE, messages);

    res.json({
        success: true,
        message: newMessage,
        freeMessagesLeft: senderUser.freeMessagesLeft
    });
});

// 5. KULIPIA TZS 2,000 (Siku 5)
app.post('/api/subscribe/:whatsappNumber', (req, res) => {
    const whatsappNumber = req.params.whatsappNumber;
    let users = loadData(DATA_FILE, []);
    const user = users.find(u => u.whatsappNumber === whatsappNumber);

    if (!user) return res.status(404).json({ error: "Mtumiaji hajapatikana!" });

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 5);

    user.subscriptionExpiresAt = expiryDate;
    saveData(DATA_FILE, users);

    res.json({ message: "Malipo yamethibitishwa! Una siku 5 za kuchati bila kikomo.", expiresAt: user.subscriptionExpiresAt });
});

// 6. ADMIN ROUTE
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
