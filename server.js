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
            fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2), 'utf8');
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        return defaultVal;
    }
}

function saveData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error("Hitilafu ya kuhifadhi faili:", err);
    }
}

// 1. KUJISAJILI
app.post('/api/signup', (req, res) => {
    try {
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
            seeking: seeking || "Urafiki Tu"
        };

        users.push(newUser);
        saveData(DATA_FILE, users);
        res.status(201).json({ message: "Umefanikiwa kujisajili!", user: newUser });
    } catch (err) {
        res.status(500).json({ error: "Hitilafu ya seva wakati wa kujisajili." });
    }
});

// 2. KUPATA ORODHA YA WATUMIAJI
app.get('/api/admin/users', (req, res) => {
    try {
        const users = loadData(DATA_FILE, []);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata watumiaji." });
    }
});

// 3. KUPATA MAZUNGUMZO NA KUWAKISHIA ZIMESOMWA
app.get('/api/messages', (req, res) => {
    try {
        const { sender, receiver } = req.query;
        let messages = loadData(MESSAGES_FILE, []);
        let updated = false;

        // Weka alama kuwa zimesomwa kama receiver ndiye anayezifungua
        messages.forEach(m => {
            if (m.sender === receiver && m.receiver === sender && !m.read) {
                m.read = true;
                updated = true;
            }
        });

        if (updated) {
            saveData(MESSAGES_FILE, messages);
        }

        const conversation = messages.filter(m => 
            (m.sender === sender && m.receiver === receiver) || 
            (m.sender === receiver && m.receiver === sender)
        );

        res.json(conversation);
    } catch (err) {
        res.status(500).json({ error: "Imeshindikana kupata meseji." });
    }
});

// 3.1 KUPATA IDADI YA MESEJI ZISIZOSOMWA (UNREAD COUNT)
app.get('/api/messages/unread', (req, res) => {
    try {
        const { user } = req.query;
        let messages = loadData(MESSAGES_FILE, []);
        let users = loadData(DATA_FILE, []);

        // Chuja meseji ambazo mpokeaji ni huyu mtumiaji na bado hazijasomwa
        const unreadMsgs = messages.filter(m => m.receiver === user && !m.read);

        // Kusanya taarifa za kina (nani aliyetuma na idadi ya meseji)
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
app.post('/api/messages', (req, res) => {
    try {
        const { sender, receiver, text, photoData } = req.body;
        let users = loadData(DATA_FILE, []);
        let messages = loadData(MESSAGES_FILE, []);

        const senderUser = users.find(u => u.whatsappNumber === sender);
        if (!senderUser) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

        const newMessage = {
            id: Date.now(),
            sender,
            receiver,
            text: text || "",
            photoData: photoData || null,
            read: false, // Hapa inaanzia haijasomwa
            createdAt: new Date()
        };

        messages.push(newMessage);
        saveData(MESSAGES_FILE, messages);

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
