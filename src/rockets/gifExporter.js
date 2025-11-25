/**
 * GIF Exporter - Create animated GIFs for social sharing
 * Uses gif.js library to capture and encode frames
 */

import GIF from 'gif.js';

export class GIFExporter {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.isExporting = false;
    }

    /**
     * Export scene to animated GIF
     * @param {Object} options - Export options
     * @returns {Promise<string>} Blob URL of generated GIF
     */
    async exportToGIF(options = {}) {
        const {
            duration = 3000,      // 3 seconds
            fps = 30,
            width = 800,
            height = 600,
            quality = 10,         // 1-10, lower is better quality
            onProgress = null
        } = options;

        if (this.isExporting) {
            throw new Error('Export already in progress');
        }

        this.isExporting = true;

        try {
            // Create GIF encoder
            const gif = new GIF({
                workers: 2,
                quality,
                width,
                height,
                workerScript: '/node_modules/gif.js/dist/gif.worker.js'
            });

            const totalFrames = Math.floor(duration / 1000 * fps);
            const frameDelay = 1000 / fps;
            let capturedFrames = 0;

            // Store original size
            const originalWidth = this.renderer.domElement.width;
            const originalHeight = this.renderer.domElement.height;

            // Resize renderer for export
            this.renderer.setSize(width, height, false);

            return new Promise((resolve, reject) => {
                const captureFrame = () => {
                    // Render current frame
                    this.renderer.render(this.scene, this.camera);

                    // Add frame to GIF
                    gif.addFrame(this.renderer.domElement, {
                        copy: true,
                        delay: frameDelay
                    });

                    capturedFrames++;

                    // Report progress
                    if (onProgress) {
                        onProgress(capturedFrames / totalFrames);
                    }

                    // Continue or finish
                    if (capturedFrames < totalFrames) {
                        requestAnimationFrame(captureFrame);
                    } else {
                        console.log(`🎬 Rendering GIF with ${totalFrames} frames...`);
                        gif.render();
                    }
                };

                // Handle GIF completion
                gif.on('finished', (blob) => {
                    // Restore original size
                    this.renderer.setSize(originalWidth, originalHeight, false);
                    this.isExporting = false;

                    const url = URL.createObjectURL(blob);
                    console.log(`✅ GIF export complete! Size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
                    resolve(url);
                });

                // Handle errors
                gif.on('error', (error) => {
                    this.renderer.setSize(originalWidth, originalHeight, false);
                    this.isExporting = false;
                    reject(error);
                });

                // Start capturing
                console.log(`🎬 Capturing ${totalFrames} frames at ${fps} FPS...`);
                captureFrame();
            });

        } catch (error) {
            this.isExporting = false;
            throw error;
        }
    }

    /**
     * Download GIF file
     * @param {string} blobUrl - Blob URL from exportToGIF
     * @param {string} filename - Optional filename
     */
    downloadGIF(blobUrl, filename) {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || `optionaut-mission-${Date.now()}.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        console.log(`💾 GIF downloaded: ${a.download}`);
    }

    /**
     * Check if export is in progress
     * @returns {boolean}
     */
    isExportInProgress() {
        return this.isExporting;
    }
}
