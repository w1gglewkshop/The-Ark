const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireStaff } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB default
    },
    fileFilter: fileFilter
});

// @route   POST /api/upload/animal-image/:animalId
// @desc    Upload image for an animal
// @access  Admin/Staff only
router.post('/animal-image/:animalId', [requireStaff, upload.single('image')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        const animalId = req.params.animalId;
        const { caption, is_primary } = req.body;

        // Check if animal exists
        const animal = await getOne('SELECT id FROM animals WHERE id = ?', [animalId]);
        if (!animal) {
            // Delete uploaded file if animal doesn't exist
            fs.unlinkSync(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'Animal not found'
            });
        }

        const imageUrl = `/uploads/${req.file.filename}`;
        const isPrimary = is_primary === 'true' || is_primary === true;

        // If this is set as primary, unset other primary images for this animal
        if (isPrimary) {
            await executeQuery(
                'UPDATE animal_images SET is_primary = FALSE WHERE animal_id = ?',
                [animalId]
            );
        }

        // Insert image record
        const result = await executeQuery(
            'INSERT INTO animal_images (animal_id, image_url, is_primary, caption) VALUES (?, ?, ?, ?)',
            [animalId, imageUrl, isPrimary, caption]
        );

        const imageRecord = await getOne(
            'SELECT * FROM animal_images WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Image uploaded successfully',
            image: imageRecord
        });

    } catch (error) {
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        console.error('Upload animal image error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error uploading image'
        });
    }
});

// @route   POST /api/upload/lost-found-image/:postId
// @desc    Upload image for lost/found post
// @access  Private
router.post('/lost-found-image/:postId', [verifyToken, upload.single('image')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        const postId = req.params.postId;
        const { caption } = req.body;

        // Check if post exists and user owns it or is staff
        const post = await getOne('SELECT user_id FROM lost_found_pets WHERE id = ?', [postId]);
        if (!post) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        if (req.user.role === 'user' && post.user_id !== req.user.id) {
            fs.unlinkSync(req.file.path);
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const imageUrl = `/uploads/${req.file.filename}`;

        const result = await executeQuery(
            'INSERT INTO lost_found_images (post_id, image_url, caption) VALUES (?, ?, ?)',
            [postId, imageUrl, caption]
        );

        const imageRecord = await getOne(
            'SELECT * FROM lost_found_images WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Image uploaded successfully',
            image: imageRecord
        });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        console.error('Upload lost/found image error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error uploading image'
        });
    }
});

// @route   POST /api/upload/profile-image
// @desc    Upload user profile image
// @access  Private
router.post('/profile-image', [verifyToken, upload.single('image')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        const imageUrl = `/uploads/${req.file.filename}`;

        // Get current profile image to delete it
        const currentUser = await getOne('SELECT profile_image FROM users WHERE id = ?', [req.user.id]);
        
        // Update user profile image
        await executeQuery(
            'UPDATE users SET profile_image = ? WHERE id = ?',
            [imageUrl, req.user.id]
        );

        // Delete old profile image if it exists
        if (currentUser.profile_image) {
            const oldImagePath = path.join(process.cwd(), currentUser.profile_image);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }

        res.json({
            success: true,
            message: 'Profile image updated successfully',
            image_url: imageUrl
        });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        console.error('Upload profile image error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error uploading image'
        });
    }
});

// @route   POST /api/upload/blog-image
// @desc    Upload image for blog post
// @access  Admin/Staff only
router.post('/blog-image', [requireStaff, upload.single('image')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        const imageUrl = `/uploads/${req.file.filename}`;

        res.json({
            success: true,
            message: 'Blog image uploaded successfully',
            image_url: imageUrl
        });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        console.error('Upload blog image error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error uploading image'
        });
    }
});

// @route   POST /api/upload/event-image
// @desc    Upload image for event
// @access  Admin/Staff only
router.post('/event-image', [requireStaff, upload.single('image')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        const imageUrl = `/uploads/${req.file.filename}`;

        res.json({
            success: true,
            message: 'Event image uploaded successfully',
            image_url: imageUrl
        });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        console.error('Upload event image error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error uploading image'
        });
    }
});

// @route   DELETE /api/upload/animal-image/:imageId
// @desc    Delete animal image
// @access  Admin/Staff only
router.delete('/animal-image/:imageId', requireStaff, async (req, res) => {
    try {
        const imageId = req.params.imageId;

        const image = await getOne('SELECT * FROM animal_images WHERE id = ?', [imageId]);
        if (!image) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        // Delete image file
        const imagePath = path.join(process.cwd(), image.image_url);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }

        // Delete image record
        await executeQuery('DELETE FROM animal_images WHERE id = ?', [imageId]);

        res.json({
            success: true,
            message: 'Image deleted successfully'
        });

    } catch (error) {
        console.error('Delete animal image error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deleting image'
        });
    }
});

// @route   PUT /api/upload/animal-image/:imageId/primary
// @desc    Set animal image as primary
// @access  Admin/Staff only
router.put('/animal-image/:imageId/primary', requireStaff, async (req, res) => {
    try {
        const imageId = req.params.imageId;

        const image = await getOne('SELECT animal_id FROM animal_images WHERE id = ?', [imageId]);
        if (!image) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        // Unset all primary images for this animal
        await executeQuery(
            'UPDATE animal_images SET is_primary = FALSE WHERE animal_id = ?',
            [image.animal_id]
        );

        // Set this image as primary
        await executeQuery(
            'UPDATE animal_images SET is_primary = TRUE WHERE id = ?',
            [imageId]
        );

        res.json({
            success: true,
            message: 'Image set as primary successfully'
        });

    } catch (error) {
        console.error('Set primary image error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error setting primary image'
        });
    }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum size is 5MB.'
            });
        }
    }
    
    if (error.message === 'Only image files are allowed') {
        return res.status(400).json({
            success: false,
            message: 'Only image files (JPG, JPEG, PNG, GIF, WebP) are allowed'
        });
    }

    res.status(500).json({
        success: false,
        message: 'File upload error'
    });
});

module.exports = router;