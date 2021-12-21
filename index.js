// import
const express = require("express");
const app = express();
const port = 5000;
const cors = require("cors");
require("dotenv").config();
const { MongoClient } = require("mongodb");
const ObjectId = require("mongodb").ObjectId;
const admin = require("firebase-admin");
const serviceAccount = require("./sdk.json");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const fileUpload = require("express-fileupload");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// connect to database
const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@cluster0.wa3vk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
async function verifyAdmin(req, res, next) {
  if (req?.headers?.auth?.startsWith("bearer")) {
    const idToken = req?.headers?.auth?.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.decodedEmail = decodedToken.email;
  }
  next();
}
// interaction with database

async function run() {
  try {
    await client.connect();

    const database = client.db("doctors-portal");
    const collection = database.collection("appointments");
    const collection1 = database.collection("users");
    const collection2 = database.collection("doctors");
    // get api
    app.get("/appointments", async (req, res) => {
      const email = req.query.email;
      const date = new Date(req.query.date).toDateString();

      const query = { email: email };
      const result = await collection.find(query).toArray();
      res.json(result);
    });
    app.get("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await collection.findOne(query);
      res.json(result);
    });
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await collection1.find(query).toArray();
      let isAdmin = false;
      if (result[0]?.role === "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });
    app.get("/doctors", async (req, res) => {
      const result = await collection2.find({}).toArray();
      res.json(result);
    });
    // post api
    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      const result = await collection.insertOne(appointment);
      res.json(result);
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await collection1.insertOne(user);
      res.json(result);
    });
    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.post("/doctors", async (req, res) => {
      console.log(req.body);
      const name = req.body.name;
      const email = req.body.email;
      const pic = req.files.image;
      const picData = pic.data;
      const encodedPicData = picData.toString("base64");
      const image = Buffer.from(encodedPicData);
      const doctor = { name, email, image };
      const result = await collection2.insertOne(doctor);
      res.json(result);
    });
    //put api
    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await collection1.updateOne(filter, updateDoc, options);
      res.json(result);
    });
    app.put("/users/admin", verifyAdmin, async (req, res) => {
      const user = req.body;
      const authorEmail = req.decodedEmail;
      const roledEmail = user.email;
      if (authorEmail) {
        const result = await collection1.find({ email: authorEmail }).toArray();
        if (result[0]?.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await collection1.updateOne(filter, updateDoc);
          res.json(result);
        }
      } else {
        res
          .status(403)
          .json({ message: "you don have the right to make admin" });
      }
    });
    app.put("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: { payment: payment },
      };
      const result = await collection.updateOne(filter, updateDoc, options);
      res.json(result);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.json("hello doctors portal");
  console.log("server running");
});
app.listen(port, () => {
  console.log("listening port number", port);
});
