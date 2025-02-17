const express = require("express");
const multer = require("multer");
const { ImagePool } = require("@squoosh/lib");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();
const sharp = require("sharp");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://jessshulmanportfolio.com",
    ],
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.options("*", cors());

const upload = multer({ dest: "uploads/" });

app.post("/compress", upload.array("files"), async (req, res) => {
  const uploadToGitHub = async (image) => {
    const token = process.env.GIT_PAT;
    const owner = "open-dream-studios";
    const repo = "test-project";
    const branch = "main";

    const owner2 = req.body.branch;
    const repo2 = req.body.repo;
    const branch2 = req.body.owner;
    
    console.log(owner, repo, branch);
    console.log(owner2, repo2, branch2);

    try {
      if (!image.src || !(image.src instanceof Uint8Array)) {
        throw new Error("Invalid image source");
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/images/${image.name}`,
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
        throw new Error(
          `Failed to upload ${image.name}: ${response.statusText}`
        );
      }
    } catch (error) {
      console.error("Error uploading to GitHub:", error);
    }
  };

  try {
    const files = req.files;
    for (const file of files) {
      const imagePool = new ImagePool(1); // Use a single-threaded ImagePool for safety
      try {
        // const fileBuffer = fs.readFileSync(file.path);
        // const image = imagePool.ingestImage(fileBuffer);

        // await image.preprocess({
        //   resize: { width: 1220 },
        //   rotate: true,
        // });

        const fileBuffer = fs.readFileSync(file.path);
        const processedBuffer = await sharp(fileBuffer)
          .rotate() // Correct orientation based on EXIF metadata
          .resize(1220)
          .webp({ lossless: true })
          .toBuffer();

        await uploadToGitHub({
          name: file.originalname,
          src: processedBuffer,
        });

        // await image.encode({
        //   webp: { lossless: true },
        // });

        // const { binary } = await image.encodedWith.webp;

        // await uploadToGitHub({
        //   name: file.originalname,
        //   src: binary,
        //   currentPath: currentPath,
        // });

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
