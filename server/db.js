const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect("mongodb://localhost:27017/whatsapp-mini");
    console.log("MongoDB Connected Successfully");
  } catch (err) {
    console.error("MongoDB Connection Failed");
    console.error(err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
