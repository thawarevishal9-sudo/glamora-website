require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Upload configuration
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueName =
            Date.now() + "-" +
            crypto.randomBytes(4).toString("hex") +
            path.extname(file.originalname);

        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

app.use("/uploads", express.static(uploadDir));

// Homepage
app.get("/", (req, res) => {
    const homeFiles = ["glamindex.html", "index.html"];

    for (const file of homeFiles) {
        const filePath = path.join(__dirname, file);

        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }
    }

    res.status(404).send("GLAMORA homepage not found.");
});

// Server status
app.get("/health", (req, res) => {
    res.json({
        success: true,
        message: "GLAMORA server is running!"
    });
});

// Visitor counter file
const counterFile = path.join(__dirname, "counter.json");

// Get visitor count
app.get("/api/visitors", (req, res) => {
    try {
        let counter = { visits: 0 };

        if (fs.existsSync(counterFile)) {
            counter = JSON.parse(
                fs.readFileSync(counterFile, "utf8")
            );
        }

        counter.visits = (counter.visits || 0) + 1;

        fs.writeFileSync(
            counterFile,
            JSON.stringify(counter, null, 2)
        );

        res.json({
            success: true,
            visitors: counter.visits
        });
    } catch (error) {
        console.error("Visitor counter error:", error);

        res.status(500).json({
            success: false,
            message: "Visitor counter error"
        });
    }
});

// Upload artist portfolio image
app.post("/api/upload", upload.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "Please select an image."
        });
    }

    res.json({
        success: true,
        message: "Image uploaded successfully.",
        imageUrl: "/uploads/" + req.file.filename
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found."
    });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`GLAMORA server running on port ${PORT}`);
});
