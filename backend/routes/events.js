const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireStaff, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/events
// @desc    Get events
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
    try {
        const events = await executeQuery(`
            SELECT e.*, CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
                   (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id) as registered_count
            FROM events e
            JOIN users u ON e.created_by = u.id
            WHERE e.status = 'active' AND e.start_date >= NOW()
            ORDER BY e.start_date ASC
        `);
        res.json({ success: true, events });
    } catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/events
// @desc    Create event
// @access  Staff only
router.post('/', [
    requireStaff,
    body('title').isLength({ min: 1, max: 255 }),
    body('description').optional().isLength({ max: 2000 }),
    body('event_type').isIn(['adoption_drive', 'fundraiser', 'educational', 'volunteer_training', 'community_outreach']),
    body('start_date').isISO8601(),
    body('end_date').isISO8601(),
    body('location').optional().isLength({ max: 255 }),
    body('max_attendees').optional().isInt({ min: 1 })
], async (req, res) => {
    try {
        const { title, description, event_type, start_date, end_date, location, max_attendees } = req.body;
        
        const result = await executeQuery(`
            INSERT INTO events (title, description, event_type, start_date, end_date, location, max_attendees, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [title, description, event_type, start_date, end_date, location, max_attendees, req.user.id]);

        res.status(201).json({ success: true, message: 'Event created', id: result.insertId });
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/events/:id/register
// @desc    Register for event
// @access  Private
router.post('/:id/register', [
    verifyToken,
    body('attendee_name').isLength({ min: 1, max: 100 }),
    body('attendee_email').isEmail(),
    body('number_of_attendees').optional().isInt({ min: 1, max: 10 })
], async (req, res) => {
    try {
        const eventId = req.params.id;
        const { attendee_name, attendee_email, number_of_attendees = 1 } = req.body;

        // Check if already registered
        const existing = await getOne('SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ?', [eventId, req.user.id]);
        if (existing) {
            return res.status(400).json({ success: false, message: 'Already registered for this event' });
        }

        await executeQuery(`
            INSERT INTO event_registrations (event_id, user_id, attendee_name, attendee_email, number_of_attendees)
            VALUES (?, ?, ?, ?, ?)
        `, [eventId, req.user.id, attendee_name, attendee_email, number_of_attendees]);

        res.json({ success: true, message: 'Successfully registered for event' });
    } catch (error) {
        console.error('Register for event error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;