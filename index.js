const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

dotenv.config();

const app = express();
const port = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let petCollection;
let adoptionCollection;

const JWKS = createRemoteJWKSet(new URL("http://localhost:3000/api/auth/jwks"));

const verifyToken = async (req, res, next) => {
    const authHeader = req?.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });
    
    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;
        next();
    } catch (error) {
        return res.status(403).json({ message: "Forbidden" });
    }
};

async function run() {
    try {
        await client.connect();
        const db = client.db("petAdoption");
        petCollection = db.collection("pets");
        adoptionCollection = db.collection("adoptions");
        console.log("Connected to MongoDB!");
    } catch (error) {
        console.error("Connection error:", error);
    }
}
run().catch(console.dir);

// PETS ROUTES
app.get('/pets', async (req, res) => {
    try {
        const { search, species } = req.query;
        let query = {};
        if (search) query.petName = { $regex: search, $options: "i" };
        if (species) query.species = { $in: species.split(",") };
        const result = await petCollection.find(query).toArray();
        res.send(result);
    } catch (error) { res.status(500).send({ message: "Failed to fetch" }); }
});

app.post('/pets', verifyToken, async (req, res) => {
    try {
        const newPet = { ...req.body, status: "available", addedBy: { email: req.user.email, id: req.user.userId }, createdAt: new Date() };
        const result = await petCollection.insertOne(newPet);
        res.status(201).send(result);
    } catch (error) { res.status(500).send({ message: "Server Error" }); }
});

app.get('/pets/my-listings', verifyToken, async (req, res) => {
    try {
        const result = await petCollection.find({ "addedBy.email": req.user.email }).toArray();
        res.send(result);
    } catch (error) { res.status(500).send({ message: "Server error" }); }
});

app.get('/pets/:id', verifyToken, async (req, res) => {
    try {
        const result = await petCollection.findOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
    } catch (error) { res.status(500).send({ message: "Server error" }); }
});

app.patch('/pets/:id', verifyToken, async (req, res) => {
    try {
        const result = await petCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: req.body });
        res.send(result);
    } catch (error) { res.status(500).send({ message: "Update failed" }); }
});

app.delete('/pets/:id', verifyToken, async (req, res) => {
    try {
        await petCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        await adoptionCollection.deleteMany({ petId: req.params.id });
        res.send({ message: "Deleted" });
    } catch (error) { res.status(500).send({ message: "Delete failed" }); }
});


app.get('/adoptions', verifyToken, async (req, res) => {
    try {
        const result = await adoptionCollection.find().toArray();
        res.send(result);
    } catch (error) { res.status(500).send({ message: "Failed" }); }
});

app.get('/adoptions/my-requests', verifyToken, async (req, res) => {
    try {
        const result = await adoptionCollection.find({ userEmail: req.query.email }).toArray();
        res.send(result);
    } catch (error) { res.status(500).send({ message: "Failed" }); }
});

app.get('/adoptions/user-status', verifyToken, async (req, res) => {
    if (!adoptionCollection) {
        return res.status(503).send({ message: "Database not ready yet" });
    }

    try {
        const { petId, email } = req.query;
        if (!petId || !email) {
            return res.status(400).send({ message: "Missing query parameters" });
        }
        
        const result = await adoptionCollection.findOne({ petId, userEmail: email });
        res.send({ status: result ? result.status : null });
    } catch (error) {
        console.error("Error fetching status:", error);
        res.status(500).send({ message: "Server error" });
    }
});

app.get('/adoptions/pet-requests/:petId', verifyToken, async (req, res) => {
    try {
        const result = await adoptionCollection.find({ petId: req.params.petId }).toArray();
        res.send(result);
    } catch (error) { res.status(500).send({ message: "Failed" }); }
});

app.post('/adoptions', verifyToken, async (req, res) => {
    try {
        const result = await adoptionCollection.insertOne({ ...req.body, status: "pending" });
        await petCollection.updateOne({ _id: new ObjectId(req.body.petId) }, { $set: { status: "pending" } });
        res.status(201).send(result);
    } catch (error) { res.status(500).send({ message: "Failed" }); }
});

app.patch('/adoptions/status/:id', verifyToken, async (req, res) => {
    try {
        const { status, petId } = req.body;
        await adoptionCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status } });
        if (status === "approved") {
            await petCollection.updateOne({ _id: new ObjectId(petId) }, { $set: { status: "adopted" } });
        }
        res.send({ message: "Success" });
    } catch (error) { res.status(500).send({ message: "Failed" }); }
});

app.delete('/adoptions/:id', verifyToken, async (req, res) => {
    try {
        const ad = await adoptionCollection.findOne({ _id: new ObjectId(req.params.id) });
        await adoptionCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (ad) await petCollection.updateOne({ _id: new ObjectId(ad.petId) }, { $set: { status: "available" } });
        res.send({ message: "Cancelled" });
    } catch (error) { res.status(500).send({ message: "Failed" }); }
});

app.listen(port, () => console.log(`Server running on ${port}`));