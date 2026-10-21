require("dotenv").config();

// Fail fast rather than issuing unsigned tokens if configuration is missing.
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set. Refusing to start.");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const gatePassRoutes = require("./routes/gatePassRoutes");
const mentorRoutes = require("./routes/mentorRoutes");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cors());

connectDB();

app.use("/api/auth", authRoutes);
app.use("/api/gatepass", gatePassRoutes);
app.use("/api/mentor", mentorRoutes);

app.get("/", (req, res) =>
  res.json({ message: "Api from Gate Pass Backend" })
);

app.use((req, res) =>
  res.status(404).json({ success: false, message: "Not found" })
);

// Never leak stack traces or driver errors to clients.
app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res
      .status(413)
      .json({ success: false, message: "Request body too large" });
  }
  if (err && err.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ success: false, message: "Malformed JSON body" });
  }
  console.error("Unhandled error:", err);
  return res
    .status(500)
    .json({ success: false, message: "Server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
