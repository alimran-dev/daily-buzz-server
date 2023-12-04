const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRETE_KEY);
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
    const database = client.db("dailyBuzzDB");
    const articleCollection = database.collection("articles");
    const publisherCollection = database.collection("publishers");
    const userCollection = database.collection("users");

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

    app.get("/publishers", async (req, res) => {
      const result = await publisherCollection.find().toArray();
      res.send(result);
    });

    app.get("/articles", async (req, res) => {
      const page = parseInt(req.query.page) - 1;
      const size = parseInt(req.query.size);
      console.log(page, size);
      const query = { status: "approved" };
      const articles = await articleCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();
      const articleCount = await articleCollection.countDocuments();
      const result = { articles, articleCount };
      res.send(result);
    });
    app.get("/details/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await articleCollection.findOne(filter);
      res.send(result);
    });
    app.get("/myArticles", async (req, res) => {
      const email = req.query.email;
      // console.log('author',email);
      const query = { author_email: email };
      const options = {
        projection:{title: 1,isPremium: 1,status: 1,feedback:1},
      }
      const result = await articleCollection.find(query,options).toArray();
      res.send(result);
    })
    app.post("/articles", async (req, res) => {
      const articleData = req.body;
      console.log(articleData);
      const { title, publisher, tags, photo, description,author_name,author_email,author_photo } = articleData || {};
      const article = {
        title: title,
        image: photo,
        publisher: publisher,
        tags: tags,
        description: description,
        views: 0,
        author_name: author_name,
        author_email: author_email,
        author_photo: author_photo,
        date: Date.now(),
        status: 'pending',
        isPremium: false,
        feedback: null,
      }
      const result = await articleCollection.insertOne(article);
      res.send(result)
    })
    app.patch("/views/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const { views } = await articleCollection.findOne(filter, {
        projection: { views: 1, _id: 0 },
      });
      const updateDoc = {
        $set: {
          views: views + 1,
        },
      };
      const result = await articleCollection.updateOne(filter, updateDoc);
      console.log(result);
      res.send(result);
    });
    app.patch("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const article = req.body;
      const { title, publisher, tags, photo, description } = article || {};
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          title,
          publisher,
          tags,
          image: photo,
          description,
        }
      }
      const result = await articleCollection.updateOne(filter, updateDoc);
      res.send(result);
    })
    app.delete("/delete/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await articleCollection.deleteOne(filter);
      res.send(result);
    })
    // user related api
    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log(user);
      const userDoc = {
        name: user.name,
        email: user.email,
        photo: user.photo,
        role: "user",
        premiumValid: null,
      };
      const result = await userCollection.insertOne(userDoc);
      res.send(result);
    });



    app.patch("/userUpdate", async (req, res) => {
      const user = req.body;
      const { name, email, photoURL } = user || {};
      const filter = { email: email };
      const updateDoc = {
        $set: {
          name: name,
          photo: photoURL,
        }
      }
      console.log(user);
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })


    app.patch("/subscription", async (req, res) => {
      const user = req.body;
      const timeNow = Date.now();
      let date;
      const { email, plan } = user || {};
      const filter = { email: email };
      if (plan === 1) {
        date = timeNow + (1 * 60 * 1000);
      }
      else if (plan === 10) {
        date = timeNow + (30 * 24 * 60 * 60 * 1000);
      }
      else if (plan === 80) {
        date = timeNow + (365 * 24 * 60 * 60 * 1000);
      }
      else {
        const result = await userCollection.findOne(filter);
        if (!result?.premiumValid) {
          return res.send(['Free user'])
        }
        else if (result?.premiumValid < Date.now()) {
          date=null
        }
        else {
          return res.send(["Premium User"]);
        }
      }
      const updateDoc = {
        $set: {
          premiumValid: date,
        }
      }
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      console.log(price);
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
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
