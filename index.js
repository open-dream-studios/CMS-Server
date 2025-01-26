const express = require("express");
const multer = require("multer");
const { ImagePool } = require("@squoosh/lib");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Methods", "POST");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

const upload = multer({ dest: "uploads/" });

const uploadToGitHub = async (image) => {
  const token = process.env.GIT_PAT;
  const owner = "JosephGoff";
  const repo = "js-portfolio";
  const branch = "master";

  try {
    if (!image.src || !(image.src instanceof Uint8Array)) {
      throw new Error("Invalid image source");
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/public/assets/${image.currentPath}/${image.name}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Add ${image.name}`,
          content: Buffer.from(image.src).toString("base64"),
          branch: branch,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to upload ${image.name}: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error uploading to GitHub:", error);
  }
};

app.post("/compress", upload.array("files"), async (req, res) => {
  try {
    const files = req.files;
    const currentPath = req.body.currentPath;

    for (const file of files) {
      const imagePool = new ImagePool(1); // Use a single-threaded ImagePool for safety
      try {
        const fileBuffer = fs.readFileSync(file.path);
        const image = imagePool.ingestImage(fileBuffer);

        await image.preprocess({
          resize: {
            width: 1220,
          },
        });

        await image.encode({
          webp: { lossless: true },
        });

        const { binary } = await image.encodedWith.webp;

        await uploadToGitHub({
          name: file.originalname,
          src: binary,
          currentPath: currentPath,
        });

        fs.unlinkSync(file.path);
      } catch (err) {
        console.error(`Error processing file ${file.originalname}:`, err);
      } finally {
        await imagePool.close();
      }
    }

    const uploadsFolder = fs.readdirSync(path.join(__dirname, "uploads"));
    uploadsFolder.forEach((file) => {
      try {
        fs.unlinkSync(path.join(__dirname, "uploads", file));
      } catch (error) {
        console.error(`Error deleting file ${file}:`, error);
      }
    });
    res.status(200).send("success");
  } catch (error) {
    console.error("Compression error:", error);
    res.status(500).send("Error compressing the image");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("Server is live!");
});