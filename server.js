const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Kuhakikisha folda ya uploads ipo
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfiguresheni ya Multer kuhifadhi picha
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Mafaili ya JSON ya kuhifadhi data
const usersFile = path.join(__dirname, 'users.json');
const messagesFile = path.join(__dirname, 'messages.json');

function readData(filePath) {
    if (!fs.existsSync(filePath)) return [];
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        return [];
    }
}

function saveData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// 1. Kusajili mtumiaji mpya na lengo lake (lookingFor)
app.post('/api/signup', upload.single('photoFile'), (req, res) => {
    try {
        const { fullName, whatsappNumber, lookingFor } = req.body;
        const photoFile = req.file;

        if (!fullName || !whatsappNumber || !photoFile) {
            return res.status(400).json({ error: 'Tafadhali jaza taarifa zote na uweke picha!' });
        }

        const users = readData(usersFile);
        const photoUrl = `/uploads/${photoFile.filename}`;

        const newUser = {
            id: users.length > 0 ? Number(users[users.length - 1].id) + 1 : 1,
            fullName,
            whatsappNumber,
            photoUrl,
            lookingFor: lookingFor || 'Natafuta uhusiano mzuri',
            isPhotoApproved: true,
            freeMessagesLeft: 5, 
            isPaid: false,       
            createdAt: new Date()
        };

        users.push(newUser);
        saveData(usersFile, users);

        res.status(200).json({ message: 'Umefanikiwa kujisajili!', user: newUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Hitilafu kwenye seva.' });
    }
});

// 2. Kuchukua Orodha ya Watu wa Kuonekana kwenye Discover
app.get('/api/users/discover', (req, res) => {
    const users = readData(usersFile);
    const sanitizedUsers = users.map(u => ({
        id: u.id,
        fullName: u.fullName,
        photoUrl: u.photoUrl,
        lookingFor: u.lookingFor || 'Natafuta uhusiano mzuri',
        hasUnlockedWhatsApp: u.isPaid 
    }));
    res.json(sanitizedUsers);
});

// 3. Kuchukua Orodha kwa ajili ya Admin
app.get('/api/admin/users', (req, res) => {
    const users = readData(usersFile);
    res.json(users);
});

// 4. API ya Kutuma Meseji za Ndani ya Mfumo (Inaruhusu meseji kwenda hata kama mtu Hayupo Hewani)
app.post('/api/chat/send', (req, res) => {
    const { senderId, receiverId, messageText } = req.body;
    const messages = readData(messagesFile);
    const users = readData(usersFile);

    // Tunatafuta mtumaji kwa kulinganisha ID zao (bila kujali kama ni string au number)
    let sender = users.find(u => String(u.id) === String(senderId));
    
    // Kama mtumaji hana rekodi, tunamtengenezea ya muda ili asikwame
    if (!sender) {
        sender = {
            id: senderId,
            fullName: "Mtumiaji",
            whatsappNumber: "0700000000",
            freeMessagesLeft: 5,
            isPaid: false
        };
        users.push(sender);
        saveData(usersFile, users);
    }

    if (!sender.isPaid) {
        if (sender.freeMessagesLeft <= 0) {
            return res.status(403).json({ 
                error: 'Meseji zako za bure zimeisha! Tafadhali lipia ili uendelee kuchati na upewe Namba ya WhatsApp.',
                requiresPayment: true 
            });
        }
        sender.freeMessagesLeft -= 1;
        saveData(usersFile, users);
    }

    const newMessage = {
        id: Date.now(),
        senderId: String(senderId),
        receiverId: String(receiverId),
        messageText,
        createdAt: new Date()
    };

    messages.push(newMessage);
    saveData(messagesFile, messages);

    res.json({ 
        success: true, 
        message: newMessage, 
        freeMessagesLeft: sender.freeMessagesLeft !== undefined ? sender.freeMessagesLeft : 5,
        isPaid: sender.isPaid || false 
    });
});

// 5. API ya Kusoma Meseji baina ya Wawili (Inazihifadhi zote ili wakirudi wazikute)
app.get('/api/chat/messages/:user1/:user2', (req, res) => {
    const { user1, user2 } = req.params;
    const messages = readData(messagesFile);

    const conversation = messages.filter(m => 
        (String(m.senderId) === String(user1) && String(m.receiverId) === String(user2)) || 
        (String(m.senderId) === String(user2) && String(m.receiverId) === String(user1))
    );

    res.json(conversation);
});

// 6. API ya Kuiga Malipo
app.post('/api/pay', (req, res) => {
    const { userId } = req.body;
    const users = readData(usersFile);
    const user = users.find(u => String(u.id) === String(userId));

    if (!user) return res.status(404).json({ error: 'Mtumaji hapatikani.' });

    user.isPaid = true;
    saveData(usersFile, users);

    res.json({ success: true, message: 'Malipo yamefanikiwa! Sasa unaweza kuona namba ya WhatsApp.', whatsappNumber: user.whatsappNumber });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
