const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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

async function run() {
    try {
        await client.connect();

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
        const result = await petCollection.find().toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Failed to fetch pets" });
    }
});

app.post('/pets', async (req, res) => {
    try {
        if (!petCollection) return res.status(500).send({ message: "Database not initialized" });
        const pets = req.body;
        const result = await petCollection.insertOne(pets);
        res.status(201).send(result);
    } catch (error) {
        console.error("Error inserting pet:", error);
        res.status(500).send({ message: "Failed to insert pet data" });
    }
});

app.get('/pets/my-listings', async (req, res) => {
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

app.get('/pets/:id', async (req, res) => {
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

app.patch('/pets/:id', async (req, res) => {
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

app.delete('/pets/:id', async (req, res) => {
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

app.get('/adoptions/my-requests', async (req, res) => {
    try {
        if (!adoptionCollection) return res.status(500).send({ message: "Database not initialized" });

        const email = req.query.email;
        if (!email) {
            return res.status(400).send({ message: "Missing email query parameter" });
        }

        const query = { userEmail: email };
        const result = await adoptionCollection.find(query).toArray();
        res.send(result);
    } catch (error) {
        console.error("Error fetching user requests:", error);
        res.status(500).send({ message: "Failed to fetch requests" });
    }
});

app.get('/adoptions/pet-requests/:petId', async (req, res) => {
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

app.post('/adoptions', async (req, res) => {
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

app.patch('/adoptions/status/:id', async (req, res) => {
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

app.patch("/adoptions/approve/:id", async (req, res) => {
    const requestId = req.params.id;

    try {

        const request = await AdoptionRequestCollection.findOne({ _id: requestId });
        if (!request) {
            return res.status(404).send({ message: "Request not found" });
        }

        const petId = request.petId;


        

        await AdoptionRequestCollection.updateOne(
            { _id: requestId },
            { $set: { status: "approved" } }
        );

        await PetCollection.updateOne(
            { _id: petId },
            { $set: { status: "adopted" } }
        );

        res.send({ message: "Successfully adopted!" });

    } catch (error) {
        res.status(500).send({ message: "Failed to process approval" });
    }
});

app.delete('/adoptions/:id', async (req, res) => {
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