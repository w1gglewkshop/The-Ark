const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireStaff, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/stories
// @desc    Get approved success stories
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
    try {
        const stories = await executeQuery(`
            SELECT s.*, a.name as animal_name, a.species
            FROM success_stories s
            LEFT JOIN animals a ON s.animal_id = a.id
            WHERE s.status = 'approved'
            ORDER BY s.story_date DESC, s.created_at DESC
        `);
        res.json({ success: true, stories });
    } catch (error) {
        console.error('Get success stories error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/stories
// @desc    Submit success story
// @access  Private
router.post('/', [
    verifyToken,
    body('title').isLength({ min: 1, max: 255 }),
    body('content').isLength({ min: 10, max: 5000 }),
    body('animal_id').optional().isInt({ min: 1 }),
    body('adopter_name').isLength({ min: 1, max: 100 }),
    body('adopter_email').isEmail(),
    body('story_date').optional().isISO8601()
], async (req, res) => {
    try {
        const { title, content, animal_id, adopter_name, adopter_email, story_date } = req.body;
        
        const result = await executeQuery(`
            INSERT INTO success_stories (title, content, animal_id, adopter_name, adopter_email, story_date, submitted_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [title, content, animal_id, adopter_name, adopter_email, story_date, req.user.id]);

        res.status(201).json({ success: true, message: 'Success story submitted for review', id: result.insertId });
    } catch (error) {
        console.error('Submit success story error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   PUT /api/stories/:id/status
// @desc    Update story status (approve/reject)
// @access  Staff only
router.put('/:id/status', [
    requireStaff,
    body('status').isIn(['pending', 'approved', 'rejected'])
], async (req, res) => {
    try {
        const { status } = req.body;
        const storyId = req.params.id;

        await executeQuery(
            'UPDATE success_stories SET status = ?, approved_by = ? WHERE id = ?',
            [status, req.user.id, storyId]
        );

        res.json({ success: true, message: `Story ${status} successfully` });
    } catch (error) {
        console.error('Update story status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;