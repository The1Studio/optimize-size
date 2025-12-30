/**
 * Audio Compression Module
 * Compress and convert audio files using ffmpeg
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs').promises;
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Get audio file metadata
 * @param {string} filePath - Absolute path to audio file
 * @returns {Promise<object>} - Audio metadata
 */
function getAudioMetadata(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }

            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            if (!audioStream) {
                reject(new Error('No audio stream found'));
                return;
            }

            resolve({
                duration: metadata.format.duration,
                bitrate: metadata.format.bit_rate,
                size: metadata.format.size,
                format: metadata.format.format_name,
                codec: audioStream.codec_name,
                sampleRate: audioStream.sample_rate,
                channels: audioStream.channels
            });
        });
    });
}

/**
 * Compress a single audio file
 * @param {string} filePath - Absolute path to audio
 * @param {object} options - Compression options
 * @returns {Promise<{success: boolean, originalSize: number, newSize: number, saved: number}>}
 */
async function compressAudio(filePath, options = {}) {
    try {
        const {
            bitrate = '96k',        // Default bitrate for playable ads
            sampleRate = null,      // Keep original if not specified
            channels = null,        // mono=1, stereo=2, keep original if null
            format = null,          // Output format: 'mp3', 'ogg', null=keep original
            quality = 4             // VBR quality for MP3 (0-9, lower is better)
        } = options;

        // Get original file size
        const stats = await fs.stat(filePath);
        const originalSize = stats.size;
        const ext = path.extname(filePath).toLowerCase();

        // Determine output format
        let outputFormat = format;
        if (!outputFormat) {
            // Auto-convert WAV to MP3
            if (ext === '.wav') {
                outputFormat = 'mp3';
            } else {
                // Keep original format
                outputFormat = ext.replace('.', '');
            }
        }

        // Create temp output path
        const dir = path.dirname(filePath);
        const basename = path.basename(filePath, ext);
        const tempOutput = path.join(dir, `${basename}_temp.${outputFormat}`);

        // Compress audio
        await new Promise((resolve, reject) => {
            let command = ffmpeg(filePath);

            // Set output format
            command = command.format(outputFormat);

            // Audio codec settings
            if (outputFormat === 'mp3') {
                command = command
                    .audioCodec('libmp3lame')
                    .audioBitrate(bitrate)
                    .audioQuality(quality);
            } else if (outputFormat === 'ogg') {
                command = command
                    .audioCodec('libvorbis')
                    .audioBitrate(bitrate);
            } else {
                command = command.audioBitrate(bitrate);
            }

            // Sample rate
            if (sampleRate) {
                command = command.audioFrequency(sampleRate);
            }

            // Channels (mono/stereo)
            if (channels) {
                command = command.audioChannels(channels);
            }

            // Execute
            command
                .on('end', resolve)
                .on('error', reject)
                .save(tempOutput);
        });

        // Get new file size
        const tempStats = await fs.stat(tempOutput);
        const newSize = tempStats.size;

        // Check if compression is beneficial
        if (newSize < originalSize || outputFormat !== ext.replace('.', '')) {
            // Replace original with compressed version
            const finalPath = outputFormat !== ext.replace('.', '')
                ? path.join(dir, `${basename}.${outputFormat}`)
                : filePath;

            // If format changed, delete original and rename temp
            if (outputFormat !== ext.replace('.', '')) {
                await fs.unlink(filePath);
                await fs.rename(tempOutput, finalPath);
            } else {
                // Same format, replace original
                await fs.unlink(filePath);
                await fs.rename(tempOutput, filePath);
            }

            return {
                success: true,
                originalSize,
                newSize,
                saved: originalSize - newSize,
                skipped: false,
                originalFormat: ext.replace('.', ''),
                newFormat: outputFormat,
                converted: outputFormat !== ext.replace('.', ''),
                newPath: outputFormat !== ext.replace('.', '') ? finalPath : filePath
            };
        } else {
            // Compressed version is larger, keep original
            await fs.unlink(tempOutput);
            return {
                success: true,
                originalSize,
                newSize: originalSize,
                saved: 0,
                skipped: true,
                reason: 'Compressed version is larger',
                originalFormat: ext.replace('.', ''),
                newFormat: outputFormat,
                converted: false
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            originalSize: 0,
            newSize: 0,
            saved: 0
        };
    }
}

/**
 * Compress all audio files in a directory
 * @param {string} rootDir - Root directory to scan
 * @param {object} options - Compression options
 * @param {function} progressCallback - Progress callback
 * @returns {Promise<object>} - Compression results
 */
async function compressAudioDirectory(rootDir, options = {}, progressCallback = null) {
    const audioExtensions = ['.mp3', '.ogg', '.wav', '.m4a'];
    const results = {
        total: 0,
        compressed: 0,
        converted: 0,
        skipped: 0,
        failed: 0,
        originalSize: 0,
        newSize: 0,
        savedSize: 0,
        files: []
    };

    async function scanDir(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await scanDir(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (audioExtensions.includes(ext)) {
                    results.total++;

                    if (progressCallback) {
                        progressCallback({
                            current: results.total,
                            file: path.relative(rootDir, fullPath)
                        });
                    }

                    const result = await compressAudio(fullPath, options);

                    results.originalSize += result.originalSize;
                    results.newSize += result.newSize;
                    results.savedSize += result.saved;

                    if (result.success) {
                        if (result.skipped) {
                            results.skipped++;
                        } else {
                            results.compressed++;
                            if (result.converted) {
                                results.converted++;
                            }
                        }
                    } else {
                        results.failed++;
                    }

                    results.files.push({
                        path: path.relative(rootDir, fullPath),
                        ...result
                    });
                }
            }
        }
    }

    await scanDir(rootDir);
    return results;
}

/**
 * Get audio compression estimate (dry run)
 * @param {string} rootDir - Root directory
 * @param {object} options - Compression options
 * @returns {Promise<object>} - Estimation results
 */
async function estimateAudioCompression(rootDir, options = {}) {
    const audioExtensions = ['.mp3', '.ogg', '.wav', '.m4a'];
    let totalAudio = 0;
    let totalSize = 0;
    let wavFiles = 0;
    let wavSize = 0;
    const files = [];

    async function scanDir(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await scanDir(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (audioExtensions.includes(ext)) {
                    const stats = await fs.stat(fullPath);
                    totalAudio++;
                    totalSize += stats.size;

                    if (ext === '.wav') {
                        wavFiles++;
                        wavSize += stats.size;
                    }

                    files.push({
                        path: path.relative(rootDir, fullPath),
                        size: stats.size,
                        format: ext.replace('.', '')
                    });
                }
            }
        }
    }

    await scanDir(rootDir);

    // Estimate savings
    // WAV → MP3: ~90% reduction
    // MP3 re-compression: ~30% reduction
    // OGG re-compression: ~25% reduction
    const wavSavings = Math.floor(wavSize * 0.9);
    const otherSavings = Math.floor((totalSize - wavSize) * 0.3);
    const estimatedSaving = wavSavings + otherSavings;

    return {
        totalAudio,
        totalSize,
        wavFiles,
        wavSize,
        estimatedSaving,
        files
    };
}

module.exports = {
    compressAudio,
    compressAudioDirectory,
    estimateAudioCompression,
    getAudioMetadata
};
