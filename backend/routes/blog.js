const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireStaff, optionalAuth } = require('../middleware/auth');
const slugify = require('slugify');

const router = express.Router();

// @route   GET /api/blog
// @desc    Get published blog posts
// @access  Public
router.get('/', [
    optionalAuth,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('category').optional().isIn(['care_tips', 'success_stories', 'news', 'educational', 'fundraising', 'volunteer_spotlight']),
    query('search').optional().isLength({ max: 100 })
], async (req, res) => {
    try {
        const { page = 1, limit = 10, category, search } = req.query;
        const offset = (page - 1) * limit;

        let whereConditions = ['status = "published"'];
        let queryParams = [];

        if (category) {
            whereConditions.push('category = ?');
            queryParams.push(category);
        }

        if (search) {
            whereConditions.push('(title LIKE ? OR content LIKE ? OR excerpt LIKE ?)');
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
        }

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        const posts = await executeQuery(`
            SELECT b.*, CONCAT(u.first_name, ' ', u.last_name) as author_name
            FROM blog_posts b
            JOIN users u ON b.author_id = u.id
            ${whereClause}
            ORDER BY b.published_at DESC
            LIMIT ? OFFSET ?
        `, [...queryParams, parseInt(limit), parseInt(offset)]);

        res.json({ success: true, posts });
    } catch (error) {
        console.error('Get blog posts error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/blog
// @desc    Create blog post
// @access  Staff only
router.post('/', [
    requireStaff,
    body('title').isLength({ min: 1, max: 255 }),
    body('content').isLength({ min: 1 }),
    body('excerpt').optional().isLength({ max: 500 }),
    body('category').isIn(['care_tips', 'success_stories', 'news', 'educational', 'fundraising', 'volunteer_spotlight']),
    body('featured_image').optional().isURL(),
    body('status').optional().isIn(['draft', 'published'])
], async (req, res) => {
    try {
        const { title, content, excerpt, category, featured_image, status = 'draft' } = req.body;
        const slug = slugify(title, { lower: true, strict: true });

        const result = await executeQuery(`
            INSERT INTO blog_posts (title, slug, content, excerpt, author_id, category, featured_image, status, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [title, slug, content, excerpt, req.user.id, category, featured_image, status, status === 'published' ? new Date() : null]);

        res.status(201).json({ success: true, message: 'Blog post created', id: result.insertId });
    } catch (error) {
        console.error('Create blog post error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;