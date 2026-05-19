const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

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

async function run() {
    try {
        await client.connect();

        const db = client.db("petAdoption");
        const collection = db.collection("pets");


        app.get('/pets', async (req, res) => {
            const result = await collection.find().toArray();
            res.send(result);
        });

        app.post('/pets', async (req, res) => {
            try {
                const pets = req.body;
                const result = await collection.insertOne(pets);
                res.status(201).send(result);
            } catch (error) {
                console.error("Error inserting pet:", error);
                res.status(500).send({ message: "Failed to insert pet data" });
            }
        });


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    } finally {
        // await client.close(); // Uncomment this line if you want to close the connection after operations
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('On The PetAdopt server site!');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});