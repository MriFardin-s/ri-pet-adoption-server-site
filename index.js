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

async function run() {
    try {
        await client.connect();

        const db = client.db("petAdoption");
        petCollection = db.collection("pets"); 

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


app.get('/', (req, res) => {
    res.send('On The PetAdopt server site!');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});