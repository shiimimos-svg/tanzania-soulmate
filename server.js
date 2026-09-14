const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Ruhusu folda ya uploads isomeke hadharani ili picha ziweze kuonekana
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Sanidi mahali pa kuhifadhi picha zinazopakiwa
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const DATA_FILE = path.join(__dirname, 'users.json');

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

function saveUsers(users) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error("Hitilafu ya kuhifadhi faili la data:", err);
    }
}

// 1. USAJILI UNAOPOKEA FAILI LA PICHA (Picha inapita moja kwa moja bila Admin)
app.post('/api/signup', upload.single('photoFile'), (chombo, jibu) => {
    const { fullName, whatsappNumber } = chombo.body;
    
    if (!chombo.file) {
        return jibu.status(400).json({ error: "Tafadhali pakia picha yako!" });
    }

    const photoUrl = `/uploads/${chombo.file.filename}`;
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
        isPhotoApproved: true, // Imewekwa true moja kwa moja ili isiongee na Admin
        freeMessagesLeft: 3,    
        subscriptionExpiresAt: null, 
        createdAt: new Date()
    };

    users.push(newUser);
    saveUsers(users);

    jibu.status(201).json({
        message: "Umefanikiwa kujisajili! Picha yako imeingia hewani moja kwa moja.",
        user: newUser
    });
});

// 2. ORODHA YA ADMIN
app.get('/api/admin/users', (chombo, jibu) => {
    const users = loadUsers();
    jibu.json(users);
});

// 3. KUIDHINISHA PICHA (Imetunzwa kama Backup)
app.post('/api/admin/approve-photo/:userId', (chombo, jibu) => {
    const userId = parseInt(chombo.params.userId);
    let users = loadUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
        return jibu.status(404).json({ error: "Mtumiaji hajapatikana!" });
    }

    user.isPhotoApproved = true; 
    saveUsers(users);

    jibu.json({ message: `Picha ya ${user.fullName} imeidhinishwa!`, user });
});

// 4. MALIPO YA TZS 2,000
app.post('/api/subscribe/:userId', (chombo, jibu) => {
    const userId = parseInt(chombo.params.userId);
    let users = loadUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
        return jibu.status(404).json({ error: "Mtumiaji hajapatikana!" });
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 5);

    user.subscriptionExpiresAt = expiryDate;
    user.freeMessagesLeft = 0; 
    saveUsers(users);

    jibu.json({ 
        message: "Malipo yamethibitishwa! Una siku 5 za kuchati.",
        expiresAt: user.subscriptionExpiresAt 
    });
});

// 5. DISCOVER
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

// 6. LIKE / WHATSAPP
app.post('/api/like/:userId', (chombo, jibu) => {
    const users = loadUsers();
    const targetUserId = parseInt(chombo.params.userId);
    const targetUser = users.find(u => u.id === targetUserId);

    if (!targetUser) {
        return jibu.status(404).json({ error: "Mtumiaji hajapatikana!" });
    }

    jibu.json({
        message: `Umemtumia Like ${targetUser.fullName}! Wasiliana naye WhatsApp.`,
        whatsappNumber: targetUser.whatsappNumber
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`TanzaniaSoulMate server inafanya kazi kwenye port ${PORT}`);
});
