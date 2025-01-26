const express = require("express");
const multer = require("multer");
const { ImagePool } = require("@squoosh/lib");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Set up Multer for file handling
const upload = multer({ dest: "uploads/" });

app.post("/compress", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path; // Temporary file path
    const threads = navigator.hardwareConcurrency || 4;
    const imagePool = new ImagePool(threads);

    // Read the uploaded file as ArrayBuffer
    const fileBuffer = fs.readFileSync(filePath);
    const image = imagePool.ingestImage(fileBuffer);

    // Perform lossless compression
    await image.encode({
      webp: { lossless: true },
    });

    const { binary } = await image.encodedWith.webp;

    // Write the compressed file back to the server (or a permanent location)
    const outputPath = path.join(__dirname, "compressed", req.file.originalname);
    fs.writeFileSync(outputPath, binary);

    // Clean up resources
    await imagePool.close();
    fs.unlinkSync(filePath); // Remove the temporary upload

    res.status(200).send("success");
  } catch (error) {
    console.error("Compression error:", error);
    res.status(500).send("Error compressing the image");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});