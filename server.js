require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const gatePassRoutes = require("./routes/gatePassRoutes");
const mentorRoutes = require("./routes/mentorRoutes");
const cors = require("cors")

const app = express();
app.use(express.json());
app.use(cors());

connectDB();

app.use("/api/auth", authRoutes);
app.use("/api/gatepass", gatePassRoutes);
app.use("/api/mentor", mentorRoutes);
app.use("/",( req, res) => {
    res.status(200).json({ message: "Welcome to the GatePass API" });
})


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
