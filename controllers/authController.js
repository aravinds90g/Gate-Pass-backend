const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); 

// Register User
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, role, dept, year, rollNo, phoneNo } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "User already exists" });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user based on role
    let newUser;
    if (role === "student") {
      newUser = new User({
        name,
        email,
        password: hashedPassword,
        role,
        dept,
        year,
        rollNo,
        phoneNo,
      });
    } else if (role === "mentor" || role === "warden") {
      newUser = new User({
        name,
        email,
        password: hashedPassword,
        role,
        dept,
        year,
      });
    } else {
      newUser = new User({ name, email, password: hashedPassword, role });
    }

    await newUser.save();
    res
      .status(201)
      .json({ message: `${role} registered successfully`, user: newUser });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};


// Login User
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(200).json({ message: "Login successful", token, user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
