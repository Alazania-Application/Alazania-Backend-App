// import sharp from 'sharp';
// import path from 'path';
// import fs from 'fs/promises';
// import ffmpeg from 'fluent-ffmpeg';


// export async function optimizeImage(inputBuffer, options = {}) {
//   const {
//     width = 1200,       // max width
//     height = null,      // height can auto scale
//     format = 'webp',    // 'jpeg', 'png', 'webp', 'avif'
//     quality = 80,       // 0-100
//   } = options;

//   const image = sharp(inputBuffer).resize(width, height, {
//     fit: 'inside',      // scale down, don't crop
//     withoutEnlargement: true
//   });

//   if (format === 'webp') {
//     return await image.webp({ quality }).toBuffer();
//   } else if (format === 'jpeg') {
//     return await image.jpeg({ quality }).toBuffer();
//   } else if (format === 'avif') {
//     return await image.avif({ quality }).toBuffer();
//   } else if (format === 'png') {
//     return await image.png({ compressionLevel: 9 }).toBuffer();
//   } else {
//     throw new Error(`Unsupported format: ${format}`);
//   }
// }



// function compressVideo(inputPath, outputPath) {
//   return new Promise((resolve, reject) => {
//     ffmpeg(inputPath)
//       .outputOptions([
//         '-c:v libx264',      // h.264 codec
//         '-preset fast',      // speed vs compression
//         '-crf 28',           // quality (lower is better quality)
//         '-c:a aac',          // audio
//         '-b:a 128k'          // audio bitrate
//       ])
//       .save(outputPath)
//       .on('end', () => resolve())
//       .on('error', err => reject(err));
//   });
// }


// async function handleFileChange(e) {
//     const file = e.target.files[0];
//     if (!file) return;
  
//     // 1. Get pre-signed URL from backend
//     const res = await fetch('/api/get-pre-signed-url', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         fileName: file.name,
//         fileType: file.type,
//         sessionId: 'session-id',
//         postId: 'post-id',
//       })
//     });
//     const { data } = await res.json();
  
//     // 2. Upload directly to S3
//     await fetch(data.url, {
//       method: 'PUT',
//       headers: { 'Content-Type': file.type },
//       body: file
//     });
  
//     console.log('Uploaded file to S3 at key:', data.key);
  
//     // 3. (Optional) Tell backend to optimize
//     await fetch('/api/optimize-upload', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ s3Key: data.key })
//     });
//   }
  