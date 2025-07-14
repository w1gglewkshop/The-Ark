const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireStaff, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/lost-found
// @desc    Create lost/found pet post
// @access  Private
router.post('/', [
    verifyToken,
    body('pet_name').optional().isLength({ min: 1, max: 100 }),
    body('species').isIn(['dog', 'cat', 'rabbit', 'bird', 'other']),
    body('breed').optional().isLength({ max: 100 }),
    body('color').isLength({ min: 1, max: 100 }),
    body('size').optional().isIn(['small', 'medium', 'large', 'extra_large']),
    body('distinctive_features').optional().isLength({ max: 1000 }),
    body('last_seen_location').isLength({ min: 5, max: 255 }),
    body('last_seen_date').isISO8601(),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('contact_phone').isMobilePhone(),
    body('additional_contact').optional().isLength({ max: 255 }),
    body('status').isIn(['lost', 'found']),
    body('post_type').isIn(['lost', 'found']),
    body('reward_amount').optional().isFloat({ min: 0 }),
    body('description').optional().isLength({ max: 2000 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const {
            pet_name,
            species,
            breed,
            color,
            size,
            distinctive_features,
            last_seen_location,
            last_seen_date,
            latitude,
            longitude,
            contact_phone,
            additional_contact,
            status,
            post_type,
            reward_amount,
            description
        } = req.body;

        const result = await executeQuery(
            `INSERT INTO lost_found_pets (
                user_id, pet_name, species, breed, color, size, distinctive_features,
                last_seen_location, last_seen_date, latitude, longitude, contact_phone,
                additional_contact, status, post_type, reward_amount, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id, pet_name, species, breed, color, size, distinctive_features,
                last_seen_location, last_seen_date, latitude, longitude, contact_phone,
                additional_contact, status, post_type, reward_amount, description
            ]
        );

        const post = await getOne(
            `SELECT 
                lf.*,
                u.first_name, u.last_name, u.email
             FROM lost_found_pets lf
             JOIN users u ON lf.user_id = u.id
             WHERE lf.id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Lost/Found post created successfully',
            post
        });

    } catch (error) {
        console.error('Create lost/found post error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error creating post'
        });
    }
});

// @route   GET /api/lost-found
// @desc    Get lost/found posts with search and filtering
// @access  Public
router.get('/', [
    optionalAuth,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('search').optional().isLength({ max: 100 }),
    query('species').optional().isIn(['dog', 'cat', 'rabbit', 'bird', 'other']),
    query('size').optional().isIn(['small', 'medium', 'large', 'extra_large']),
    query('status').optional().isIn(['lost', 'found', 'reunited']),
    query('post_type').optional().isIn(['lost', 'found']),
    query('latitude').optional().isFloat({ min: -90, max: 90 }),
    query('longitude').optional().isFloat({ min: -180, max: 180 }),
    query('radius').optional().isFloat({ min: 0, max: 1000 }),
    query('sort_by').optional().isIn(['last_seen_date', 'created_at', 'reward_amount']),
    query('sort_order').optional().isIn(['asc', 'desc'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const {
            page = 1,
            limit = 20,
            search,
            species,
            size,
            status,
            post_type,
            latitude,
            longitude,
            radius = 50, // Default 50km radius
            sort_by = 'created_at',
            sort_order = 'desc'
        } = req.query;

        const offset = (page - 1) * limit;

        let whereConditions = [];
        let queryParams = [];

        if (search) {
            whereConditions.push('(lf.pet_name LIKE ? OR lf.breed LIKE ? OR lf.description LIKE ? OR lf.last_seen_location LIKE ?)');
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (species) {
            whereConditions.push('lf.species = ?');
            queryParams.push(species);
        }

        if (size) {
            whereConditions.push('lf.size = ?');
            queryParams.push(size);
        }

        if (status) {
            whereConditions.push('lf.status = ?');
            queryParams.push(status);
        }

        if (post_type) {
            whereConditions.push('lf.post_type = ?');
            queryParams.push(post_type);
        }

        // Location-based search
        if (latitude && longitude) {
            whereConditions.push(`(
                6371 * acos(
                    cos(radians(?)) * cos(radians(lf.latitude)) * 
                    cos(radians(lf.longitude) - radians(?)) + 
                    sin(radians(?)) * sin(radians(lf.latitude))
                ) <= ?
            )`);
            queryParams.push(latitude, longitude, latitude, radius);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM lost_found_pets lf ${whereClause}`;
        const countResult = await getOne(countQuery, queryParams);
        const total = countResult.total;

        // Get posts with images
        const postsQuery = `
            SELECT 
                lf.*,
                u.first_name, u.last_name,
                (SELECT COUNT(*) FROM lost_found_images WHERE post_id = lf.id) as image_count,
                (SELECT image_url FROM lost_found_images WHERE post_id = lf.id LIMIT 1) as primary_image
            FROM lost_found_pets lf
            JOIN users u ON lf.user_id = u.id
            ${whereClause}
            ORDER BY lf.${sort_by} ${sort_order.toUpperCase()}
            LIMIT ? OFFSET ?
        `;

        const posts = await executeQuery(postsQuery, [...queryParams, parseInt(limit), parseInt(offset)]);

        // Get all images for each post
        for (let post of posts) {
            const images = await executeQuery(
                'SELECT image_url, caption FROM lost_found_images WHERE post_id = ? ORDER BY id ASC',
                [post.id]
            );
            post.images = images;
        }

        res.json({
            success: true,
            data: {
                posts,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_items: total,
                    total_pages: Math.ceil(total / limit)
                },
                filters: {
                    search,
                    species,
                    size,
                    status,
                    post_type,
                    latitude,
                    longitude,
                    radius
                }
            }
        });

    } catch (error) {
        console.error('Get lost/found posts error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving posts'
        });
    }
});

// @route   GET /api/lost-found/:id
// @desc    Get single lost/found post
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const postId = req.params.id;

        const post = await getOne(
            `SELECT 
                lf.*,
                u.first_name, u.last_name, u.email, u.phone
             FROM lost_found_pets lf
             JOIN users u ON lf.user_id = u.id
             WHERE lf.id = ?`,
            [postId]
        );

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        // Get all images
        const images = await executeQuery(
            'SELECT image_url, caption FROM lost_found_images WHERE post_id = ? ORDER BY id ASC',
            [postId]
        );
        post.images = images;

        // Hide some personal info if not the owner or staff
        if (req.user?.id !== post.user_id && req.user?.role !== 'admin' && req.user?.role !== 'volunteer') {
            delete post.email;
        }

        res.json({
            success: true,
            post
        });

    } catch (error) {
        console.error('Get lost/found post error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving post'
        });
    }
});

// @route   PUT /api/lost-found/:id
// @desc    Update lost/found post
// @access  Private (owner or staff)
router.put('/:id', [
    verifyToken,
    body('pet_name').optional().isLength({ min: 1, max: 100 }),
    body('species').optional().isIn(['dog', 'cat', 'rabbit', 'bird', 'other']),
    body('breed').optional().isLength({ max: 100 }),
    body('color').optional().isLength({ min: 1, max: 100 }),
    body('size').optional().isIn(['small', 'medium', 'large', 'extra_large']),
    body('distinctive_features').optional().isLength({ max: 1000 }),
    body('last_seen_location').optional().isLength({ min: 5, max: 255 }),
    body('last_seen_date').optional().isISO8601(),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('contact_phone').optional().isMobilePhone(),
    body('additional_contact').optional().isLength({ max: 255 }),
    body('status').optional().isIn(['lost', 'found', 'reunited']),
    body('reward_amount').optional().isFloat({ min: 0 }),
    body('description').optional().isLength({ max: 2000 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const postId = req.params.id;

        const post = await getOne('SELECT user_id FROM lost_found_pets WHERE id = ?', [postId]);
        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        // Only owner or staff can update
        if (req.user.role === 'user' && post.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const updateFields = {};
        const allowedFields = [
            'pet_name', 'species', 'breed', 'color', 'size', 'distinctive_features',
            'last_seen_location', 'last_seen_date', 'latitude', 'longitude', 'contact_phone',
            'additional_contact', 'status', 'reward_amount', 'description'
        ];

        // Build update object
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateFields[field] = req.body[field];
            }
        });

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        // Build update query
        const setClause = Object.keys(updateFields).map(field => `${field} = ?`).join(', ');
        const values = Object.values(updateFields);

        await executeQuery(
            `UPDATE lost_found_pets SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [...values, postId]
        );

        // Get updated post
        const updatedPost = await getOne(
            `SELECT 
                lf.*,
                u.first_name, u.last_name, u.email
             FROM lost_found_pets lf
             JOIN users u ON lf.user_id = u.id
             WHERE lf.id = ?`,
            [postId]
        );

        res.json({
            success: true,
            message: 'Post updated successfully',
            post: updatedPost
        });

    } catch (error) {
        console.error('Update lost/found post error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating post'
        });
    }
});

// @route   DELETE /api/lost-found/:id
// @desc    Delete lost/found post
// @access  Private (owner or admin)
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const postId = req.params.id;

        const post = await getOne('SELECT user_id FROM lost_found_pets WHERE id = ?', [postId]);
        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        // Only owner or admin can delete
        if (req.user.role === 'user' && post.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        await executeQuery('DELETE FROM lost_found_pets WHERE id = ?', [postId]);

        res.json({
            success: true,
            message: 'Post deleted successfully'
        });

    } catch (error) {
        console.error('Delete lost/found post error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deleting post'
        });
    }
});

// @route   GET /api/lost-found/map/data
// @desc    Get lost/found posts for map display
// @access  Public
router.get('/map/data', optionalAuth, async (req, res) => {
    try {
        const {
            status,
            post_type,
            species
        } = req.query;

        let whereConditions = ['lf.latitude IS NOT NULL', 'lf.longitude IS NOT NULL'];
        let queryParams = [];

        if (status) {
            whereConditions.push('lf.status = ?');
            queryParams.push(status);
        }

        if (post_type) {
            whereConditions.push('lf.post_type = ?');
            queryParams.push(post_type);
        }

        if (species) {
            whereConditions.push('lf.species = ?');
            queryParams.push(species);
        }

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        const posts = await executeQuery(
            `SELECT 
                lf.id, lf.pet_name, lf.species, lf.post_type, lf.status,
                lf.latitude, lf.longitude, lf.last_seen_date, lf.reward_amount,
                (SELECT image_url FROM lost_found_images WHERE post_id = lf.id LIMIT 1) as image_url
             FROM lost_found_pets lf
             ${whereClause}
             ORDER BY lf.created_at DESC`,
            queryParams
        );

        res.json({
            success: true,
            posts
        });

    } catch (error) {
        console.error('Get map data error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving map data'
        });
    }
});

// @route   GET /api/lost-found/stats
// @desc    Get lost/found statistics
// @access  Staff only
router.get('/stats', requireStaff, async (req, res) => {
    try {
        // Overall stats
        const totalStats = await getOne(
            `SELECT 
                COUNT(*) as total_posts,
                SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost_count,
                SUM(CASE WHEN status = 'found' THEN 1 ELSE 0 END) as found_count,
                SUM(CASE WHEN status = 'reunited' THEN 1 ELSE 0 END) as reunited_count
             FROM lost_found_pets`
        );

        // Recent activity
        const recentActivity = await executeQuery(
            `SELECT 
                lf.id, lf.pet_name, lf.species, lf.post_type, lf.status, lf.created_at,
                u.first_name, u.last_name
             FROM lost_found_pets lf
             JOIN users u ON lf.user_id = u.id
             ORDER BY lf.created_at DESC
             LIMIT 10`
        );

        res.json({
            success: true,
            stats: {
                total: totalStats,
                recent_activity: recentActivity
            }
        });

    } catch (error) {
        console.error('Get lost/found stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving statistics'
        });
    }
});

module.exports = router;