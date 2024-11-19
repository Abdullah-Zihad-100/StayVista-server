require("dotenv").config();
const {
  MongoClient,
  ServerApiVersion,
  Timestamp,
  ObjectId,
} = require("mongodb");
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const nodemailer = require("nodemailer");

// middelware

app.use(
  cors({
    origin: "http://localhost:5173", // Use your frontend origin here
    credentials: true, // Allow credentials
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    res.status(402).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(402).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

// send email -------->
// const sendEmail=()=>{
// // Create trasporter
// const transporter=nodemailer.createTransport({service:"gmail",
//   host:'smtp.gmail.com',
//   port:587,
//   secure:false,
//   auth:{
//     user:process.env.USER,
//     pass:process.env.PASS
//   }
// })
// // verify connection
// transporter.verify((error,success)=>{
//   if(error){
// console.log(error)
//   }
//   else{
//     console.log("Server is reday to take our message",success);
//   }
// })
// const mailBody={
//   from:process.env.USER,
//   to:emailAddress,
//   subJect:emailData?.subject,
//   html:`<p>${emailData?.message}</p>`
// }
// }

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}@cluster0.hmqrzhm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // collactions

    const userCollaction = client.db("StayVista").collection("users");
    const roomCollaction = client.db("StayVista").collection("rooms");
    const bookingCollaction = client.db("StayVista").collection("bookings");

    // sendEmail();

    // role verification middaleware ------------->

    // For Admins------->

    const verifyAdmins = async (req, res, next) => {
      const user = req?.user;
      const query = { email: user?.email };
      const result = await userCollaction.findOne(query);
      if (!result || result?.role !== "admin")
        return res.status(401).send({ message: "Unauthorized access" });
      console.log("User form verifyAdmin:", user);
      next();
    };

    // For Host ----------->

    const verifyHosts = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await userCollaction.findOne(query);
      if (!result || result?.role !== "host")
        return res.status(401).send({ message: "Unauthorized access" });
      next();
    };

    // auth releted api jwt ---------->

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log("i need a new JWT", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });

   
   
    // Admin Stat Data------->
    app.get("/admin-stat",verifyToken,verifyAdmins, async (req, res) => {
      const bookingsDetails = await bookingCollaction
        .find({}, { projection: { date: 1, price: 1 } })
        .toArray();
      const userCount = await userCollaction.countDocuments();
      const roomCount = await roomCollaction.countDocuments();
      const totalSale = bookingsDetails.reduce(
        (sum, data) => sum + data.price,
        0
      );

      const chartData = bookingsDetails.map((data) => {
        const day = new Date(data?.date).getDate();
        const month = new Date(data?.date).getMonth() + 1;
        console.log(data);
        return [day + "/" + month, data.price];
      });
      chartData.unshift(["Day", "Sale"]);
      console.log(chartData);
      res.send({
        userCount,
        roomCount,
        totalSale,
        chartData,
        bookingCount: bookingsDetails.length,
      });
    });

   
   
    // Host Stat Date ------------>
    app.get("/host-stat", verifyToken, verifyHosts, async (req, res) => {
      const { email } = req?.user;
      const bookingsDetails = await bookingCollaction
        .find(
          { host: email },
          {
            projection: {
              date: 1,
              price: 1,
            },
          }
        )
        .toArray();
      const roomCount = await roomCollaction.countDocuments({
        "host.email": email,
      });
      const totalSale = bookingsDetails.reduce(
        (sum, data) => sum + data.price,
        0
      );
      const chartData = bookingsDetails.map((data) => {
        const day = new Date(data?.date).getDate();
        const month = new Date(data?.date).getMonth() + 1;
        console.log(data);
        return [day + "/" + month, data.price];
      });
      chartData.splice(0, 0, ["Day", "Sale"]);
      const { timestamp } = await userCollaction.findOne(
        { email },
        {
          projection: {
            timestamp: 1,
          },
        }
      );
      res.send({
        totalSale,
        bookingCount: bookingsDetails.length,
        roomCount,
        chartData,
        hostSince: timestamp,
      });
    });



    // Guest Stat Date ------------>
      app.get("/guest-stat",verifyToken,async (req, res) => {
        const { email } = req.user;

        const bookingsDetails = await bookingCollaction
          .find(
            { "guest.email": email },
            {
              projection: {
                date: 1,
                price: 1,
              },
            }
          )
          .toArray();

        const chartData = bookingsDetails.map((data) => {
          const day = new Date(data.date).getDate();
          const month = new Date(data.date).getMonth() + 1;
          return [day + "/" + month, data.price];
        });
        chartData.splice(0, 0, ["Day", "Reservation"]);
        const { timestamp } = await userCollaction.findOne(
          { email },
          {
            projection: {
              timestamp: 1,
            },
          }
        );
        const totalSpent = bookingsDetails.reduce(
          (acc, data) => acc + data.price,
          0
        );
        res.send({
          bookingCount: bookingsDetails.length,
          chartData,
          guestSince: timestamp,
          totalSpent,
        });
      });



    // get user role ---------->

    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollaction.findOne({ email });
      res.send(result);
    });

    // room apis -------------------->

    app.post("/rooms", async (req, res) => {
      const result = await roomCollaction.insertOne(req.body);
      res.send(result);
    });

    app.get("/rooms", async (req, res) => {
      const result = await roomCollaction.find().toArray();
      res.send(result);
    });

    // get rooms for host
    app.get("/rooms/:email", verifyToken, verifyHosts, async (req, res) => {
      const email = req.params.email;
      const result = await roomCollaction
        .find({ "host.email": email })
        .toArray();
      res.send(result);
    });

    app.get("/room/:id", async (req, res) => {
      const id = req.params.id;
      const result = await roomCollaction.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // delete room
    app.delete("/room/:id", async (req, res) => {
      const id = req.params.id;
      const result = await roomCollaction.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // update a room
    app.put(`/room/:id`,async(req,res)=>{
    const room=req.body;
    const filter={_id: new ObjectId(req.params.id)};
    const options={upsert:true};  
    const updateDoc={
      $set:room,
    }
    const result=await roomCollaction.updateOne(filter,updateDoc,options)
    res.send(result);
    })

    // save or modify user email status in db---->
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const isExits = await userCollaction.findOne(query);
      if (isExits) {
        if (user?.status === "Requested") {
          const result = await userCollaction.updateOne(
            query,
            { $set: user },
            options
          );
          return res.send(result);
        } else {
          return res.send(isExits);
        }
      }
      const result = await userCollaction.updateOne(
        query,
        {
          $set: { ...user, timestamp: Date.now() },
        },
        options
      );
      res.send(result);
    });

    // gnatrete client secret for stripe payment

    app.post("/create-stripe-payment", verifyToken, async (req, res) => {
      const { price } = req.body;
      console.log(price);

      const amount = parseInt(price * 100);
      if (!price || amount < 1) {
        return res.status(400).send({ error: "Invalid price or amount." });
      }
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // save booking info in booking collaction

    app.post("/booking", verifyToken, async (req, res) => {
      const booking = req.body;
      const result = await bookingCollaction.insertOne(booking);
      // send email ------->
      res.send(result);
    });

    // delete booking
    app.delete(`/bookings/:id`,async(req,res)=>{
      const id=req.params.id;
      const query={_id:new ObjectId(id)};
      const result=await bookingCollaction.deleteOne(query);
      res.send(result);
    })
    app.patch("/rooms/status/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          booked: status,
        },
      };
      const result = await roomCollaction.updateOne(query, updateDoc);
      res.send(result);
    });

    // guest bookings get
    app.get("/bookings", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send({});
      }
      const query = { "guest.email": email };
      const result = await bookingCollaction.find(query).toArray();
      res.send(result);
    });

    // host booking apis
    app.get("/bookings/host", verifyToken, verifyHosts, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send({});
      }
      const query = { host: email };
      const result = await bookingCollaction.find(query).toArray();
      res.send(result);
    });

    // get all users-------------->

    app.get("/users", verifyToken, verifyAdmins, async (req, res) => {
      const resust = await userCollaction.find().toArray();
      res.send(resust);
    });

    // user update role---------->

    app.put(`/users/update/:email`, async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const options = { upsert: true };
      const query = { email: email };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await userCollaction.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
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

app.get("/", (req, res) => {
  res.send("StyaVista Is Running");
});

app.listen(port, () => {
  console.log(`App is running by ${port} port`);
});
