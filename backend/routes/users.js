const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get user profile with application history
// @access  Private
router.get('/profile', verifyToken, async (req, res) => {
    try {
        // Get user profile
        const user = await getOne(`
            SELECT id, username, email, first_name, last_name, phone, address, city, state, zip_code, 
                   profile_image, date_joined, role
            FROM users WHERE id = ?
        `, [req.user.id]);

        // Get adoption applications
        const adoptions = await executeQuery(`
            SELECT aa.*, a.name as animal_name, a.species
            FROM adoption_applications aa
            JOIN animals a ON aa.animal_id = a.id
            WHERE aa.user_id = ?
            ORDER BY aa.application_date DESC
        `, [req.user.id]);

        // Get donations
        const donations = await executeQuery(`
            SELECT id, amount, donation_type, donation_date, is_recurring
            FROM donations WHERE user_id = ?
            ORDER BY donation_date DESC
        `, [req.user.id]);

        // Get volunteer status
        const volunteerApp = await getOne(`
            SELECT status, application_date
            FROM volunteer_applications 
            WHERE user_id = ? ORDER BY application_date DESC LIMIT 1
        `, [req.user.id]);

        res.json({
            success: true,
            profile: {
                user,
                adoptions,
                donations,
                volunteer_status: volunteerApp
            }
        });
    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
    verifyToken,
    body('first_name').optional().isLength({ min: 1, max: 50 }),
    body('last_name').optional().isLength({ min: 1, max: 50 }),
    body('phone').optional().isMobilePhone(),
    body('address').optional().isLength({ max: 500 }),
    body('city').optional().isLength({ max: 100 }),
    body('state').optional().isLength({ max: 50 }),
    body('zip_code').optional().isLength({ max: 10 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
        }

        const allowedFields = ['first_name', 'last_name', 'phone', 'address', 'city', 'state', 'zip_code'];
        const updateFields = {};

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateFields[field] = req.body[field];
            }
        });

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields to update' });
        }

        const setClause = Object.keys(updateFields).map(field => `${field} = ?`).join(', ');
        const values = Object.values(updateFields);

        await executeQuery(
            `UPDATE users SET ${setClause} WHERE id = ?`,
            [...values, req.user.id]
        );

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update user profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;