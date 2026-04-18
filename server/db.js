const mongoose = require("mongoose");

// This function connects to the MongoDB database using the connection string provided in the environment variable MONGO_URI. It logs a success message if the connection is successful, and logs an error message and exits the process if the connection fails.
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected Successfully");
  } catch (err) {
    console.error("MongoDB Connection Failed");
    console.error(err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
