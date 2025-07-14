const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireStaff } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/foster
// @desc    Submit foster application
// @access  Private
router.post('/', [
    verifyToken,
    body('housing_type').isIn(['house', 'apartment', 'condo', 'other']),
    body('has_yard').isBoolean(),
    body('has_fencing').isBoolean(),
    body('has_other_pets').isBoolean(),
    body('other_pets_description').optional().isLength({ max: 1000 }),
    body('foster_experience').isLength({ min: 10, max: 1000 }),
    body('preferred_animals').isArray({ min: 1 }),
    body('preferred_animals.*').isIn(['dogs', 'cats', 'puppies', 'kittens', 'special_needs', 'seniors']),
    body('max_foster_duration').isLength({ min: 1, max: 50 }),
    body('emergency_contact_name').isLength({ min: 2, max: 100 }),
    body('emergency_contact_phone').isMobilePhone()
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
            housing_type,
            has_yard,
            has_fencing,
            has_other_pets,
            other_pets_description,
            foster_experience,
            preferred_animals,
            max_foster_duration,
            emergency_contact_name,
            emergency_contact_phone
        } = req.body;

        // Check if user already has a pending application
        const existingApplication = await getOne(
            'SELECT id FROM foster_applications WHERE user_id = ? AND status = "pending"',
            [req.user.id]
        );

        if (existingApplication) {
            return res.status(400).json({
                success: false,
                message: 'You already have a pending foster application'
            });
        }

        const preferredAnimalsString = preferred_animals.join(',');

        const result = await executeQuery(
            `INSERT INTO foster_applications (
                user_id, housing_type, has_yard, has_fencing, has_other_pets, other_pets_description,
                foster_experience, preferred_animals, max_foster_duration, emergency_contact_name,
                emergency_contact_phone
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id, housing_type, has_yard, has_fencing, has_other_pets, other_pets_description,
                foster_experience, preferredAnimalsString, max_foster_duration, emergency_contact_name,
                emergency_contact_phone
            ]
        );

        const application = await getOne(
            `SELECT fa.*, u.first_name, u.last_name, u.email, u.phone
             FROM foster_applications fa
             JOIN users u ON fa.user_id = u.id
             WHERE fa.id = ?`,
            [result.insertId]
        );

        if (application.preferred_animals) {
            application.preferred_animals = application.preferred_animals.split(',');
        }

        res.status(201).json({
            success: true,
            message: 'Foster application submitted successfully',
            application
        });

    } catch (error) {
        console.error('Submit foster application error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error submitting application'
        });
    }
});

// @route   GET /api/foster
// @desc    Get foster applications
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
            whereConditions.push('fa.user_id = ?');
            queryParams.push(req.user.id);
        }

        if (status) {
            whereConditions.push('fa.status = ?');
            queryParams.push(status);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM foster_applications fa ${whereClause}`;
        const countResult = await getOne(countQuery, queryParams);
        const total = countResult.total;

        // Get applications
        const applicationsQuery = `
            SELECT 
                fa.*,
                u.first_name, u.last_name, u.email, u.phone, u.address, u.city, u.state,
                reviewer.first_name as reviewer_first_name, reviewer.last_name as reviewer_last_name
            FROM foster_applications fa
            JOIN users u ON fa.user_id = u.id
            LEFT JOIN users reviewer ON fa.reviewed_by = reviewer.id
            ${whereClause}
            ORDER BY fa.application_date DESC
            LIMIT ? OFFSET ?
        `;

        const applications = await executeQuery(applicationsQuery, [...queryParams, parseInt(limit), parseInt(offset)]);

        // Parse preferred_animals for each application
        applications.forEach(app => {
            if (app.preferred_animals) {
                app.preferred_animals = app.preferred_animals.split(',');
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
        console.error('Get foster applications error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving applications'
        });
    }
});

// @route   PUT /api/foster/:id/status
// @desc    Update foster application status
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
            'SELECT id, user_id FROM foster_applications WHERE id = ?',
            [applicationId]
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        await executeQuery(
            `UPDATE foster_applications 
             SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_date = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [status, admin_notes, req.user.id, applicationId]
        );

        const updatedApplication = await getOne(
            `SELECT 
                fa.*,
                u.first_name, u.last_name, u.email, u.phone,
                reviewer.first_name as reviewer_first_name, reviewer.last_name as reviewer_last_name
             FROM foster_applications fa
             JOIN users u ON fa.user_id = u.id
             LEFT JOIN users reviewer ON fa.reviewed_by = reviewer.id
             WHERE fa.id = ?`,
            [applicationId]
        );

        if (updatedApplication.preferred_animals) {
            updatedApplication.preferred_animals = updatedApplication.preferred_animals.split(',');
        }

        res.json({
            success: true,
            message: `Foster application ${status} successfully`,
            application: updatedApplication
        });

    } catch (error) {
        console.error('Update foster application status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating application status'
        });
    }
});

// @route   GET /api/foster/approved
// @desc    Get approved foster families
// @access  Staff/Admin only
router.get('/approved', requireStaff, async (req, res) => {
    try {
        const fosters = await executeQuery(
            `SELECT 
                fa.*,
                u.first_name, u.last_name, u.email, u.phone, u.address, u.city, u.state
             FROM foster_applications fa
             JOIN users u ON fa.user_id = u.id
             WHERE fa.status = 'approved'
             ORDER BY u.first_name, u.last_name`
        );

        // Parse preferred_animals for each foster
        fosters.forEach(foster => {
            if (foster.preferred_animals) {
                foster.preferred_animals = foster.preferred_animals.split(',');
            }
        });

        res.json({
            success: true,
            fosters
        });

    } catch (error) {
        console.error('Get approved fosters error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving foster families'
        });
    }
});

// @route   GET /api/foster/match/:animalId
// @desc    Find potential foster matches for an animal
// @access  Staff/Admin only
router.get('/match/:animalId', requireStaff, async (req, res) => {
    try {
        const animalId = req.params.animalId;

        // Get animal details
        const animal = await getOne(
            'SELECT species, size, special_needs FROM animals WHERE id = ?',
            [animalId]
        );

        if (!animal) {
            return res.status(404).json({
                success: false,
                message: 'Animal not found'
            });
        }

        // Find matching foster families
        let matchConditions = ['fa.status = "approved"'];
        let queryParams = [];

        // Match based on species and animal type
        if (animal.species === 'dog') {
            matchConditions.push('(FIND_IN_SET("dogs", fa.preferred_animals) > 0)');
        } else if (animal.species === 'cat') {
            matchConditions.push('(FIND_IN_SET("cats", fa.preferred_animals) > 0)');
        }

        // Check for special needs
        if (animal.special_needs) {
            matchConditions.push('(FIND_IN_SET("special_needs", fa.preferred_animals) > 0)');
        }

        const matchQuery = `
            SELECT 
                fa.*,
                u.first_name, u.last_name, u.email, u.phone, u.address, u.city, u.state
             FROM foster_applications fa
             JOIN users u ON fa.user_id = u.id
             WHERE ${matchConditions.join(' AND ')}
             ORDER BY fa.application_date DESC
        `;

        const matches = await executeQuery(matchQuery, queryParams);

        // Parse preferred_animals for each match
        matches.forEach(match => {
            if (match.preferred_animals) {
                match.preferred_animals = match.preferred_animals.split(',');
            }
        });

        res.json({
            success: true,
            animal,
            matches
        });

    } catch (error) {
        console.error('Get foster matches error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error finding foster matches'
        });
    }
});

module.exports = router;