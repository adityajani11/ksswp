require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./db");

const authRoutes = require("./routes/auth.routes");
const contactRoutes = require("./routes/contact.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/whatsapp", whatsappRoutes);

connectDB();

app.listen(process.env.PORT, () =>
  console.log(`Server running on ${process.env.PORT}`)
);
