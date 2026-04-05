require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./db");
const { startQueueWorker } = require("./services/messageQueue.service");

const authRoutes = require("./routes/auth.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");
const uploadRoutes = require("./routes/upload.routes");
const groupRoutes = require("./routes/group.routes");
const batchRoutes = require("./routes/batch.routes");

const app = express();
const BODY_LIMIT = String(process.env.REQUEST_BODY_LIMIT || "8mb").trim() || "8mb";
const URLENCODED_PARAM_LIMIT = Math.max(
  1000,
  Number(process.env.REQUEST_PARAMETER_LIMIT) || 50000,
);

app.use(cors());
app.use(express.json({ limit: BODY_LIMIT }));
app.use(
  express.urlencoded({
    extended: true,
    limit: BODY_LIMIT,
    parameterLimit: URLENCODED_PARAM_LIMIT,
  }),
);

// All Routes
app.use("/api/auth", authRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/batches", batchRoutes);

app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({
      success: false,
      message: `Request payload is too large. Please retry with fewer contacts or increase REQUEST_BODY_LIMIT (current: ${BODY_LIMIT}).`,
    });
  }

  return next(err);
});

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
