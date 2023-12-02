const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;

// middlewares
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Newspaper server is running...");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tklaef2.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    const database = client.db('dailyBuzzDB');
    const articleCollection = database.collection('articles');
    const publisherCollection = database.collection('publishers');

    //   jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_KEY, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    //   middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_KEY, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    app.get('/publishers', async (req, res) => {
      const result = await publisherCollection.find().toArray();
      res.send(result);
    })

    app.get('/articles', async (req, res) => {
      const page = parseInt(req.query.page)-1;
      const size = parseInt(req.query.size);
      console.log(page, size);
      const query={status: "approved"}
      const articles = await articleCollection.find(query).skip(page * size).limit(size).toArray();
      const articleCount = await articleCollection.countDocuments();
      const result = { articles, articleCount };
      res.send(result);
    })

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
