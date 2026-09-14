const mongoose = require('mongoose');

// Link halisi ya database yako ya MongoDB Atlas
const MONGO_URI = "mongodb+srv://shiimimos_db_user:Shimilimana123456789@cluster0.du5ze4u.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const botProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  gender: { type: String, enum: ['Male', 'Female'], required: true },
  age: { type: Number, required: true },
  profilePicture: { type: String, required: true },
  bio: { type: String },
  isAlwaysOnline: { type: Boolean, default: true },
  lastActive: { type: Date, default: Date.now }
});

const BotProfile = mongoose.model('BotProfile', botProfileSchema);

const maleNames = ["Juma", "Baraka", "Hassan", "Jovine", "Faraji", "Kelvin", "Emmanuel", "Abubakar", "Rashid", "Yusuph", "Said", "Hamis", "Brian", "David", "Amani", "Godwin", "Frank", "Junior", "Ibrahim", "Sospeter"];
const femaleNames = ["Aisha", "Neema", "Zuhura", "Rehema", "Grace", "Agness", "Mariam", "Fatma", "Beatrice", "Diana", "Salome", "Prisca", "Lilian", "Hawa", "Jastina", "Happy", "Stellah", "Veronica", "Brenda", "Mwajuma"];

const femaleImages = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500"
];

const maleImages = [
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500",
  "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=500",
  "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500"
];

const bios = [
  "Mtaalam wa kujivinjari na kufurahi maisha. Nitafute kama unapenda utulivu.",
  "Naishi Dar, natafuta marafiki wa kweli wa kupiga stori.",
  "Mcheshi na napenda muziki mzuri. Karibu tuzungumze!",
  "Najihusisha na biashara na mambo ya ubunifu. Wewe je?",
  "Mpenda maendeleo, niko hapa kujua marafiki wapya."
];

async function generateBots() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Imeunganishwa na Database kwa ajili ya kutengeneza Bots...");

    // Futa bot za zamani ili kuepusha kujirudia
    await BotProfile.deleteMany({});
    console.log("Imefuta data za zamani...");

    const botsToInsert = [];

    for (let i = 1; i <= 500; i++) {
      const isFemale = i % 2 === 0;
      const nameList = isFemale ? femaleNames : maleNames;
      const imageList = isFemale ? femaleImages : maleImages;
      
      const randomName = nameList[Math.floor(Math.random() * nameList.length)] + " " + (i + 100);
      const randomImage = imageList[Math.floor(Math.random() * imageList.length)];
      const randomAge = Math.floor(Math.random() * 15) + 20;
      const randomBio = bios[Math.floor(Math.random() * bios.length)];

      botsToInsert.push({
        name: randomName,
        gender: isFemale ? 'Female' : 'Male',
        age: randomAge,
        profilePicture: randomImage,
        bio: randomBio,
        isAlwaysOnline: true,
        lastActive: new Date()
      });
    }

    await BotProfile.insertMany(botsToInsert);
    console.log("Zimefanikiwa kutengenezwa akaunti 500 za Bot kwenye Database!");
    process.exit();
  } catch (error) {
    console.error("Hitilafu imetokea wakati wa kutengeneza bots:", error);
    process.exit(1);
  }
}

generateBots();