const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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

// Anzisha Seva kwa ajili ya Render ('0.0.0.0')
app.listen(PORT, '0.0.0.0', () => {
    console.log(`TanzaniaSoulMate server inafanya kazi kwenye port ${PORT}`);
});