const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireAdmin, requireStaff } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/volunteers
// @desc    Submit volunteer application
// @access  Private
router.post('/', [
    verifyToken,
    body('interests').isArray({ min: 1 }),
    body('interests.*').isIn(['animal_care', 'dog_walking', 'cat_socialization', 'events', 'transport', 'admin', 'fundraising', 'education']),
    body('availability').isLength({ min: 10, max: 1000 }),
    body('experience').isLength({ min: 10, max: 1000 }),
    body('skills').optional().isLength({ max: 1000 }),
    body('emergency_contact_name').isLength({ min: 2, max: 100 }),
    body('emergency_contact_phone').isMobilePhone(),
    body('background_check_consent').isBoolean()
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
            interests,
            availability,
            experience,
            skills,
            emergency_contact_name,
            emergency_contact_phone,
            background_check_consent
        } = req.body;

        // Check if user already has a pending application
        const existingApplication = await getOne(
            'SELECT id FROM volunteer_applications WHERE user_id = ? AND status = "pending"',
            [req.user.id]
        );

        if (existingApplication) {
            return res.status(400).json({
                success: false,
                message: 'You already have a pending volunteer application'
            });
        }

        const interestsString = interests.join(',');

        const result = await executeQuery(
            `INSERT INTO volunteer_applications (
                user_id, interests, availability, experience, skills,
                emergency_contact_name, emergency_contact_phone, background_check_consent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id, interestsString, availability, experience, skills,
                emergency_contact_name, emergency_contact_phone, background_check_consent
            ]
        );

        const application = await getOne(
            `SELECT va.*, u.first_name, u.last_name, u.email, u.phone
             FROM volunteer_applications va
             JOIN users u ON va.user_id = u.id
             WHERE va.id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Volunteer application submitted successfully',
            application
        });

    } catch (error) {
        console.error('Submit volunteer application error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error submitting application'
        });
    }
});

// @route   GET /api/volunteers
// @desc    Get volunteer applications
// @access  Staff/Admin get all, users get their own
router.get('/', [
    verifyToken,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('status').optional().isIn(['pending', 'approved', 'rejected'])
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
            status
        } = req.query;

        const offset = (page - 1) * limit;

        let whereConditions = [];
        let queryParams = [];

        // Regular users can only see their own applications
        if (req.user.role === 'user') {
            whereConditions.push('va.user_id = ?');
            queryParams.push(req.user.id);
        }

        if (status) {
            whereConditions.push('va.status = ?');
            queryParams.push(status);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM volunteer_applications va ${whereClause}`;
        const countResult = await getOne(countQuery, queryParams);
        const total = countResult.total;

        // Get applications
        const applicationsQuery = `
            SELECT 
                va.*,
                u.first_name, u.last_name, u.email, u.phone,
                reviewer.first_name as reviewer_first_name, reviewer.last_name as reviewer_last_name
            FROM volunteer_applications va
            JOIN users u ON va.user_id = u.id
            LEFT JOIN users reviewer ON va.reviewed_by = reviewer.id
            ${whereClause}
            ORDER BY va.application_date DESC
            LIMIT ? OFFSET ?
        `;

        const applications = await executeQuery(applicationsQuery, [...queryParams, parseInt(limit), parseInt(offset)]);

        // Parse interests for each application
        applications.forEach(app => {
            if (app.interests) {
                app.interests = app.interests.split(',');
            }
        });

        res.json({
            success: true,
            data: {
                applications,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_items: total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get volunteer applications error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving applications'
        });
    }
});

// @route   PUT /api/volunteers/:id/status
// @desc    Update volunteer application status
// @access  Admin/Staff only
router.put('/:id/status', [
    requireStaff,
    body('status').isIn(['pending', 'approved', 'rejected']),
    body('admin_notes').optional().isLength({ max: 1000 })
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

        const applicationId = req.params.id;
        const { status, admin_notes } = req.body;

        const application = await getOne(
            'SELECT id, user_id FROM volunteer_applications WHERE id = ?',
            [applicationId]
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        await executeQuery(
            `UPDATE volunteer_applications 
             SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_date = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [status, admin_notes, req.user.id, applicationId]
        );

        // If approved, update user role to volunteer
        if (status === 'approved') {
            await executeQuery(
                'UPDATE users SET role = "volunteer" WHERE id = ?',
                [application.user_id]
            );
        }

        const updatedApplication = await getOne(
            `SELECT 
                va.*,
                u.first_name, u.last_name, u.email,
                reviewer.first_name as reviewer_first_name, reviewer.last_name as reviewer_last_name
             FROM volunteer_applications va
             JOIN users u ON va.user_id = u.id
             LEFT JOIN users reviewer ON va.reviewed_by = reviewer.id
             WHERE va.id = ?`,
            [applicationId]
        );

        if (updatedApplication.interests) {
            updatedApplication.interests = updatedApplication.interests.split(',');
        }

        res.json({
            success: true,
            message: `Volunteer application ${status} successfully`,
            application: updatedApplication
        });

    } catch (error) {
        console.error('Update volunteer application status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating application status'
        });
    }
});

// @route   GET /api/volunteers/active
// @desc    Get active volunteers
// @access  Staff/Admin only
router.get('/active', requireStaff, async (req, res) => {
    try {
        const volunteers = await executeQuery(
            `SELECT 
                u.id, u.first_name, u.last_name, u.email, u.phone,
                va.interests, va.skills, va.application_date
             FROM users u
             JOIN volunteer_applications va ON u.id = va.user_id
             WHERE u.role = 'volunteer' AND va.status = 'approved'
             ORDER BY u.first_name, u.last_name`
        );

        // Parse interests for each volunteer
        volunteers.forEach(volunteer => {
            if (volunteer.interests) {
                volunteer.interests = volunteer.interests.split(',');
            }
        });

        res.json({
            success: true,
            volunteers
        });

    } catch (error) {
        console.error('Get active volunteers error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving volunteers'
        });
    }
});

module.exports = router;