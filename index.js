const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet } = require('jose-cjs');

dotenv.config();

const app = express();

app.use(cors({
    origin: ['https://ri-pet-adoption-client-site.vercel.app'],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options('*', cors());

app.use(express.json());

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const JWKS = createRemoteJWKSet(
    new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`)
);

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).send({ message: "Forbidden: No token provided" });
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: "Forbidden: Invalid token" });
        }
        req.user = decoded;
        next();
    });
};
async function run() {
    try {
        // await client.connect();

        const db = client.db("petAdoption");
        petCollection = db.collection("pets");
        adoptionCollection = db.collection("adoptions");

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
}

run().catch(console.dir);

app.get('/pets', async (req, res) => {
    try {
        if (!petCollection) return res.status(500).send({ message: "Database not initialized" });

        const { search, species } = req.query;

        let query = {};

        if (search) {
            query.petName = { $regex: search, $options: "i" };
        }

        if (species) {
            const speciesArray = species.split(",");
            query.species = { $in: speciesArray };
        }

        const result = await petCollection.find(query).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Failed to fetch pets" });
    }
});

app.post('/pets', verifyToken, async (req, res) => {
    try {
        if (!petCollection) {
            return res.status(500).send({ message: "Database not initialized" });
        }

        const petData = req.body;

        if (petData.userEmail !== req.user.email) {
            return res.status(403).send({ message: "Forbidden: Email mismatch" });
        }

        const newPet = {
            ...petData,
            age: parseInt(petData.age) || 0,
            adoptionFee: parseFloat(petData.adoptionFee) || 0,
            status: "available",
            addedBy: {
                email: req.user.email,
                id: req.user.id || req.user.userId
            },
            createdAt: new Date()
        };

        const result = await petCollection.insertOne(newPet);
        res.status(201).send(result);

    } catch (error) {
        console.error("Error creating pet listing:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/pets/my-listings', verifyToken, async (req, res) => {
    try {
        if (!petCollection) return res.status(500).send({ message: "Database collection not initialized" });

        const email = req.query.email;
        if (!email) {
            return res.status(400).send({ message: "Missing email parameter" });
        }

        const cleanEmail = email.trim();
        const query = {
            $or: [
                { addedBy: cleanEmail },
                { "addedBy.email": cleanEmail },
                { userEmail: cleanEmail }
            ]
        };

        const result = await petCollection.find(query).toArray();
        res.send(result);
    } catch (error) {
        console.error("Detailed server error in my-listings:", error);
        res.status(500).send({ message: "Internal server error", error: error.message });
    }
});

app.get('/dashboard-stats', verifyToken, async (req, res) => {
    try {

        const email = req.query.email;

        if (!email) {
            return res.status(400).send({
                message: "Email is required"
            });
        }


        const activeRequests = await adoptionCollection.countDocuments({
            userEmail: email,
            status: { $in: ["pending", "approved"] }
        });


        const myListings = await petCollection.countDocuments({
            $or: [
                { userEmail: email },
                { "addedBy.email": email }
            ]
        });


        const adoptedPets = await petCollection.countDocuments({
            status: "adopted",
            $or: [
                { userEmail: email },
                { "addedBy.email": email }
            ]
        });

        res.send({
            activeRequests,
            myListings,
            adoptedPets
        });

    } catch (error) {
        console.error("Dashboard stats error:", error);

        res.status(500).send({
            message: "Failed to fetch dashboard stats"
        });
    }
});

app.get('/pets/:id', verifyToken, async (req, res) => {
    try {
        if (!petCollection) return res.status(500).send({ message: "Database not initialized" });

        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid ID format provided" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await petCollection.findOne(query);

        if (!result) {
            return res.status(404).send({ message: "Pet not found" });
        }

        res.send(result);
    } catch (error) {
        console.error("Error fetching single pet details:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.patch('/pets/:id', verifyToken, async (req, res) => {
    try {
        if (!petCollection) return res.status(500).send({ message: "Database not initialized" });

        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid ID format" });
        }

        const updatedData = req.body;
        delete updatedData._id;

        const result = await petCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedData }
        );
        res.send(result);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Update failed" });
    }
});

app.delete('/pets/:id', verifyToken, async (req, res) => {
    try {
        if (!petCollection) return res.status(500).send({ message: "Database not initialized" });

        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid ID format" });
        }

        const result = await petCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Delete failed" });
    }
});

app.get('/adoptions', async (req, res) => {
    try {
        if (!adoptionCollection) return res.status(500).send({ message: "Database not initialized" });
        const result = await adoptionCollection.find().toArray();
        res.send(result);
    } catch (error) {
        console.error("Error fetching adoptions:", error);
        res.status(500).send({ message: "Failed to fetch adoption data" });
    }
});

app.get('/adoptions/my-requests', verifyToken, async (req, res) => {
    try {
        if (!adoptionCollection) {
            return res.status(500).send({ message: "Database not initialized" });
        }

        const email = req.user.email;
        const query = { userEmail: email };
        const result = await adoptionCollection.find(query).toArray();
        
        res.send(result);
    } catch (error) {
        console.error("Internal Server Error:", error);
        res.status(500).send({ message: "Failed to fetch requests" });
    }
});

app.get('/adoptions/user-status', verifyToken, async (req, res) => {
    try {
        if (!adoptionCollection) return res.status(500).send({ message: "Database not initialized" });
        const { petId, email } = req.query;
        if (!petId || !email) {
            return res.status(400).send({ message: "Missing required query parameters" });
        }
        const result = await adoptionCollection.findOne({ petId, userEmail: email });
        res.send({ status: result ? result.status : null });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch user request status" });
    }
});

app.get('/adoptions/pet-requests/:petId', verifyToken, async (req, res) => {
    try {
        if (!adoptionCollection) return res.status(500).send({ message: "Database not initialized" });
        const petId = req.params.petId;
        const result = await adoptionCollection.find({ petId }).toArray();
        res.send(result);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch requests" });
    }
});

app.post('/adoptions', verifyToken, async (req, res) => {
    try {
        if (!adoptionCollection || !petCollection) {
            return res.status(500).send({ message: "Database collections not initialized" });
        }

        const adoptionRequest = req.body;
        const { petId, userEmail, petName } = adoptionRequest;

        if (!petId || !userEmail) {
            return res.status(400).send({ message: "Missing required fields (petId or userEmail)" });
        }

        const pet = await petCollection.findOne({ _id: new ObjectId(petId) });
        if (!pet) {
            return res.status(404).send({ message: "Pet not found" });
        }

        const ownerEmail = pet.addedBy?.email || pet.addedBy || pet.userEmail;
        if (ownerEmail === userEmail) {
            return res.status(400).send({ message: "Owners cannot request their own pets" });
        }

        const existingRequest = await adoptionCollection.findOne({ petId, userEmail });
        if (existingRequest) {
            return res.status(400).send({
                message: `You have already submitted an adoption request for ${petName || "this pet"}!`
            });
        }

        const result = await adoptionCollection.insertOne(adoptionRequest);
        await petCollection.updateOne(
            { _id: new ObjectId(petId) },
            { $set: { status: "pending" } }
        );

        res.status(201).send(result);
    } catch (error) {
        console.error("Error inserting adoption request:", error);
        res.status(500).send({ message: "Failed to insert adoption data" });
    }
});

app.patch('/adoptions/status/:id', verifyToken, async (req, res) => {
    try {
        if (!adoptionCollection || !petCollection) return res.status(500).send({ message: "Database error" });

        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid ID format" });
        }

        const { status, petId } = req.body;

        await adoptionCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } }
        );

        if (status === "approved") {
            await petCollection.updateOne(
                { _id: new ObjectId(petId) },
                { $set: { status: "adopted" } }
            );
            await adoptionCollection.updateMany(
                { petId, _id: { $ne: new ObjectId(id) } },
                { $set: { status: "rejected" } }
            );
        }

        res.send({ message: `Request ${status} successfully` });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update status" });
    }
});

app.patch("/adoptions/approve/:id", verifyToken, async (req, res) => {
    const requestId = req.params.id;
    try {
        const request = await adoptionCollection.findOne({ _id: new ObjectId(requestId) });
        if (!request) {
            return res.status(404).send({ message: "Request not found" });
        }

        const petId = request.petId;

        await adoptionCollection.updateOne(
            { _id: new ObjectId(requestId) },
            { $set: { status: "approved" } }
        );

        await petCollection.updateOne(
            { _id: new ObjectId(petId) },
            { $set: { status: "adopted" } }
        );

        res.send({ message: "Successfully adopted!" });

    } catch (error) {
        res.status(500).send({ message: "Failed to process approval" });
    }
});

app.delete('/adoptions/:id', verifyToken, async (req, res) => {
    try {
        if (!adoptionCollection || !petCollection) {
            return res.status(500).send({ message: "Database collections not initialized" });
        }

        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid ID format" });
        }

        const adoptionRequest = await adoptionCollection.findOne({ _id: new ObjectId(id) });
        if (!adoptionRequest) {
            return res.status(404).send({ message: "Request not found" });
        }

        const { petId } = adoptionRequest;

        await adoptionCollection.deleteOne({ _id: new ObjectId(id) });

        await petCollection.updateOne(
            { _id: new ObjectId(petId) },
            { $set: { status: "available" } }
        );

        res.send({ message: "Adoption request cancelled successfully" });
    } catch (error) {
        console.error("Error deleting adoption request:", error);
        res.status(500).send({ message: "Failed to cancel request" });
    }
});

app.get('/', (req, res) => {
    res.send('On The PetAdopt server site!');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});    