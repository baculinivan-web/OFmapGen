require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const { Octokit } = require('@octokit/rest');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// GitHub setup
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

// CORS setup
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG files are allowed'));
    }
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Submit map endpoint
app.post('/api/submit-map', upload.single('map'), async (req, res) => {
  try {
    const { mapName, authorNick, copyright, nations } = req.body;
    const mapFile = req.file;

    // Validation
    if (!mapName || !authorNick || !mapFile) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Parse nations data
    let nationsData = [];
    try {
      nationsData = JSON.parse(nations);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid nations data' });
    }

    // Generate filenames
    const timestamp = Date.now();
    const sanitizedName = mapName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sanitizedAuthor = authorNick.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const baseFilename = `${sanitizedName}-by-${sanitizedAuthor}-${timestamp}`;
    
    // Create thumbnail (300x200)
    const thumbnailBuffer = await sharp(mapFile.buffer)
      .resize(300, 200, { fit: 'contain', background: { r: 8, g: 11, b: 16, alpha: 1 } })
      .png()
      .toBuffer();

    // Create watermarked proof image
    const metadata = await sharp(mapFile.buffer).metadata();
    const watermarkText = `Created by ${authorNick} - ${mapName} - ${new Date().toLocaleDateString()}`;
    
    // Create SVG watermark
    const svgWatermark = Buffer.from(`
      <svg width="${metadata.width}" height="${metadata.height}">
        <style>
          .watermark { 
            fill: rgba(255, 255, 255, 0.3); 
            font-size: 24px; 
            font-family: Arial, sans-serif;
            font-weight: bold;
          }
        </style>
        <text x="50%" y="50%" text-anchor="middle" class="watermark">${watermarkText}</text>
      </svg>
    `);

    const proofBuffer = await sharp(mapFile.buffer)
      .composite([{ input: svgWatermark, gravity: 'center' }])
      .png()
      .toBuffer();

    // Get current metadata.json
    let metadata_json = { maps: [] };
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: 'maps/metadata.json',
        ref: 'dev'
      });
      metadata_json = JSON.parse(Buffer.from(fileData.content, 'base64').toString());
    } catch (error) {
      // File doesn't exist yet, use empty structure
      console.log('metadata.json not found, creating new one');
    }

    // Add new map to metadata
    const newMap = {
      id: baseFilename,
      name: mapName,
      author: authorNick,
      description: req.body.description || '',
      timestamp: timestamp,
      date: new Date().toISOString(),
      dimensions: { width: metadata.width, height: metadata.height },
      nations: nationsData.length,
      thumbnail: `maps/thumbnails/${baseFilename}.png`,
      full: `maps/full/${baseFilename}.png`,
      proof: `maps/proof/${baseFilename}.png`,
      hasCopyright: !!copyright
    };
    metadata_json.maps.unshift(newMap); // Add to beginning

    // Create branch
    const branchName = `gallery-submission-${timestamp}`;
    const { data: devBranch } = await octokit.repos.getBranch({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      branch: 'dev'
    });

    await octokit.git.createRef({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      ref: `refs/heads/${branchName}`,
      sha: devBranch.commit.sha
    });

    // Upload files
    const files = [
      {
        path: `maps/full/${baseFilename}.png`,
        content: mapFile.buffer.toString('base64')
      },
      {
        path: `maps/thumbnails/${baseFilename}.png`,
        content: thumbnailBuffer.toString('base64')
      },
      {
        path: `maps/proof/${baseFilename}.png`,
        content: proofBuffer.toString('base64')
      },
      {
        path: 'maps/metadata.json',
        content: Buffer.from(JSON.stringify(metadata_json, null, 2)).toString('base64')
      }
    ];

    // Add copyright file if provided
    if (copyright) {
      files.push({
        path: `maps/copyrights/${baseFilename}.md`,
        content: Buffer.from(copyright).toString('base64')
      });
    }

    // Create commits for each file
    for (const file of files) {
      try {
        // Try to get existing file
        const { data: existingFile } = await octokit.repos.getContent({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          path: file.path,
          ref: branchName
        }).catch(() => ({ data: null }));

        await octokit.repos.createOrUpdateFileContents({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          path: file.path,
          message: `Add ${path.basename(file.path)} for ${mapName}`,
          content: file.content,
          branch: branchName,
          sha: existingFile?.sha
        });
      } catch (error) {
        console.error(`Error uploading ${file.path}:`, error.message);
      }
    }

    // Create Pull Request
    const { data: pr } = await octokit.pulls.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title: `Gallery submission: ${mapName} by ${authorNick}`,
      head: branchName,
      base: 'dev',
      body: `
## New Map Submission

**Map Name:** ${mapName}
**Author:** ${authorNick}
**Nations:** ${nationsData.length}
**Dimensions:** ${metadata.width} × ${metadata.height}
**Timestamp:** ${new Date().toISOString()}

${copyright ? '**Copyright Notice:** See maps/copyrights/' + baseFilename + '.md' : '**License:** Open source, no copyright restrictions'}

---

### Preview
![Thumbnail](https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${branchName}/maps/thumbnails/${baseFilename}.png)

### Files Added
- \`maps/full/${baseFilename}.png\` - Full resolution map
- \`maps/thumbnails/${baseFilename}.png\` - Thumbnail preview
- \`maps/proof/${baseFilename}.png\` - Watermarked proof of authorship
${copyright ? '- `maps/copyrights/' + baseFilename + '.md` - Copyright information' : ''}
- \`maps/metadata.json\` - Updated metadata

---
*This PR was automatically generated by the OpenFront Map Generator gallery submission system.*
      `
    });

    res.json({
      success: true,
      prUrl: pr.html_url,
      prNumber: pr.number,
      proofImage: `data:image/png;base64,${proofBuffer.toString('base64')}`
    });

  } catch (error) {
    console.error('Error submitting map:', error);
    res.status(500).json({ 
      error: 'Failed to submit map', 
      details: error.message 
    });
  }
});

// Get gallery maps
app.get('/api/maps', async (req, res) => {
  try {
    const { data: fileData } = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: 'maps/metadata.json',
      ref: 'dev'
    });
    
    const metadata = JSON.parse(Buffer.from(fileData.content, 'base64').toString());
    res.json(metadata);
  } catch (error) {
    console.error('Error fetching maps:', error);
    res.status(500).json({ error: 'Failed to fetch maps' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📦 GitHub: ${GITHUB_OWNER}/${GITHUB_REPO}`);
  console.log(`🔐 Token configured: ${!!process.env.GITHUB_TOKEN}`);
});
