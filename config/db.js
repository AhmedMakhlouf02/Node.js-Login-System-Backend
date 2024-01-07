const mongoose = require("mongoose");

const connectDB = (url) => {
  return mongoose.connect(url, {
    maxPoolSize: 10,
    authSource: "admin",
    user: process.env.MONGO_USERNAME,
    pass: process.env.MONGO_PASSWORD,
  });
};

module.exports = connectDB;
