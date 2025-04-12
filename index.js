const express = require("express");
const multer = require("multer");
const { ImagePool } = require("@squoosh/lib");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();
const sharp = require("sharp");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://jessshulmanportfolio.com",
      "https://opendreamstudio.com",
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
    const owner = req.body.owner;
    const repo = req.body.repo;
    const branch = req.body.branch;

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
      const imagePool = new ImagePool(1);
      try {
        const fileBuffer = fs.readFileSync(file.path);
        const processedBuffer = await sharp(fileBuffer)
          .rotate()
          .resize(1220)
          .webp({ lossless: true })
          .toBuffer();

        await uploadToGitHub({
          name: file.originalname,
          src: processedBuffer,
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

app.post("/password", upload.none(), async (req, res) => {
  const password = req.body.password;
  if (password === process.env.PASSWORD) {
    res.status(200).send("Success");
  } else {
    res.status(401).send("Invalid Password")
  }
});

app.post("/edit", upload.none(), async (req, res) => {
  const GIT_KEYS = {
    owner: req.body.owner,
    repo: req.body.repo,
    branch: req.body.branch,
    token: process.env.GIT_PAT,
  };
  const newProjectFile = JSON.parse(req.body.appFile);
  const filePath = "project.json";
  try {
    const fileUrl = `https://api.github.com/repos/${GIT_KEYS.owner}/${GIT_KEYS.repo}/contents/${filePath}`;
    const headers = {
      Authorization: `Bearer ${GIT_KEYS.token}`,
      Accept: "application/vnd.github.v3+json",
    };
    const { data: fileInfo } = await axios.get(fileUrl, { headers });
    const fileSha = fileInfo.sha;

    // Convert the JSON to a UTF-8 encoded Base64 string
    const updatedContent = btoa(
      unescape(
        encodeURIComponent(
          typeof newProjectFile === "string"
            ? newProjectFile
            : JSON.stringify(newProjectFile)
        )
      )
    );
    const commitMessage = "Update project.json with new content";
    await axios.put(
      fileUrl,
      {
        message: commitMessage,
        content: updatedContent,
        sha: fileSha,
        branch: GIT_KEYS.branch,
      },
      { headers }
    );

    console.log("Project file updated successfully");
    res.status(200).send("success");
  } catch (error) {
    console.error("Error updating the app file:", error);
    res.status(500).send("Error updating the app file");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("Server is live!");
});
