require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./db");
const { startQueueWorker } = require("./services/messageQueue.service");

const authRoutes = require("./routes/auth.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");
const uploadRoutes = require("./routes/upload.routes");
const groupRoutes = require("./routes/group.routes");

const app = express();

app.use(cors());
app.use(express.json());

// All Routes
app.use("/api/auth", authRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/groups", groupRoutes);

// Connect with Database
async function bootstrap() {
  try {
    await connectDB();
    startQueueWorker();

    app.listen(process.env.PORT, () =>
      console.log(`Server running on ${process.env.PORT}`),
    );
  } catch (err) {
    console.error("Server bootstrap failed:", err.message);
    process.exit(1);
  }
}

bootstrap();
