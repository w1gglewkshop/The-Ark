const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireAdmin, requireStaff } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/adoptions
// @desc    Submit adoption application
// @access  Private
router.post('/', [
    verifyToken,
    body('animal_id').isInt({ min: 1 }),
    body('housing_type').isIn(['house', 'apartment', 'condo', 'other']),
    body('has_yard').isBoolean(),
    body('has_other_pets').isBoolean(),
    body('other_pets_description').optional().isLength({ max: 1000 }),
    body('experience_with_pets').isLength({ min: 10, max: 1000 }),
    body('reason_for_adoption').isLength({ min: 10, max: 1000 }),
    body('work_schedule').isLength({ min: 5, max: 500 }),
    body('emergency_contact_name').isLength({ min: 2, max: 100 }),
    body('emergency_contact_phone').isMobilePhone(),
    body('veterinarian_name').optional().isLength({ max: 100 }),
    body('veterinarian_phone').optional().isMobilePhone()
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
            animal_id,
            housing_type,
            has_yard,
            has_other_pets,
            other_pets_description,
            experience_with_pets,
            reason_for_adoption,
            work_schedule,
            emergency_contact_name,
            emergency_contact_phone,
            veterinarian_name,
            veterinarian_phone
        } = req.body;

        // Check if animal exists and is available
        const animal = await getOne(
            'SELECT id, name, is_available FROM animals WHERE id = ?',
            [animal_id]
        );

        if (!animal) {
            return res.status(404).json({
                success: false,
                message: 'Animal not found'
            });
        }

        if (!animal.is_available) {
            return res.status(400).json({
                success: false,
                message: 'This animal is no longer available for adoption'
            });
        }

        // Check if user already has pending application for this animal
        const existingApplication = await getOne(
            'SELECT id FROM adoption_applications WHERE user_id = ? AND animal_id = ? AND status = "pending"',
            [req.user.id, animal_id]
        );

        if (existingApplication) {
            return res.status(400).json({
                success: false,
                message: 'You already have a pending application for this animal'
            });
        }

        const result = await executeQuery(
            `INSERT INTO adoption_applications (
                user_id, animal_id, housing_type, has_yard, has_other_pets, other_pets_description,
                experience_with_pets, reason_for_adoption, work_schedule, emergency_contact_name,
                emergency_contact_phone, veterinarian_name, veterinarian_phone
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id, animal_id, housing_type, has_yard, has_other_pets, other_pets_description,
                experience_with_pets, reason_for_adoption, work_schedule, emergency_contact_name,
                emergency_contact_phone, veterinarian_name, veterinarian_phone
            ]
        );

        const application = await getOne(
            `SELECT aa.*, a.name as animal_name, u.first_name, u.last_name, u.email
             FROM adoption_applications aa
             JOIN animals a ON aa.animal_id = a.id
             JOIN users u ON aa.user_id = u.id
             WHERE aa.id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Adoption application submitted successfully',
            application
        });

    } catch (error) {
        console.error('Submit adoption application error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error submitting application'
        });
    }
});

// @route   GET /api/adoptions
// @desc    Get adoption applications (admin/staff get all, users get their own)
// @access  Private
router.get('/', [
    verifyToken,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('status').optional().isIn(['pending', 'approved', 'rejected', 'completed']),
    query('animal_id').optional().isInt({ min: 1 })
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
            status,
            animal_id
        } = req.query;

        const offset = (page - 1) * limit;

        let whereConditions = [];
        let queryParams = [];

        // Regular users can only see their own applications
        if (req.user.role === 'user') {
            whereConditions.push('aa.user_id = ?');
            queryParams.push(req.user.id);
        }

        if (status) {
            whereConditions.push('aa.status = ?');
            queryParams.push(status);
        }

        if (animal_id) {
            whereConditions.push('aa.animal_id = ?');
            queryParams.push(animal_id);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM adoption_applications aa ${whereClause}`;
        const countResult = await getOne(countQuery, queryParams);
        const total = countResult.total;

        // Get applications
        const applicationsQuery = `
            SELECT 
                aa.*,
                a.name as animal_name, a.species, a.breed, a.size,
                u.first_name, u.last_name, u.email, u.phone,
                reviewer.first_name as reviewer_first_name, reviewer.last_name as reviewer_last_name
            FROM adoption_applications aa
            JOIN animals a ON aa.animal_id = a.id
            JOIN users u ON aa.user_id = u.id
            LEFT JOIN users reviewer ON aa.reviewed_by = reviewer.id
            ${whereClause}
            ORDER BY aa.application_date DESC
            LIMIT ? OFFSET ?
        `;

        const applications = await executeQuery(applicationsQuery, [...queryParams, parseInt(limit), parseInt(offset)]);

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
        console.error('Get adoption applications error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving applications'
        });
    }
});

// @route   GET /api/adoptions/:id
// @desc    Get single adoption application
// @access  Private
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const applicationId = req.params.id;

        const application = await getOne(
            `SELECT 
                aa.*,
                a.name as animal_name, a.species, a.breed, a.size, a.description,
                u.first_name, u.last_name, u.email, u.phone, u.address, u.city, u.state,
                reviewer.first_name as reviewer_first_name, reviewer.last_name as reviewer_last_name
             FROM adoption_applications aa
             JOIN animals a ON aa.animal_id = a.id
             JOIN users u ON aa.user_id = u.id
             LEFT JOIN users reviewer ON aa.reviewed_by = reviewer.id
             WHERE aa.id = ?`,
            [applicationId]
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // Users can only view their own applications, staff can view all
        if (req.user.role === 'user' && application.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.json({
            success: true,
            application
        });

    } catch (error) {
        console.error('Get adoption application error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving application'
        });
    }
});

// @route   PUT /api/adoptions/:id/status
// @desc    Update adoption application status
// @access  Admin/Staff only
router.put('/:id/status', [
    requireStaff,
    body('status').isIn(['pending', 'approved', 'rejected', 'completed']),
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
            'SELECT id, animal_id, status as current_status FROM adoption_applications WHERE id = ?',
            [applicationId]
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        await executeQuery(
            `UPDATE adoption_applications 
             SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_date = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [status, admin_notes, req.user.id, applicationId]
        );

        // If application is approved, mark animal as unavailable
        if (status === 'approved' && application.current_status !== 'approved') {
            await executeQuery(
                'UPDATE animals SET is_available = FALSE WHERE id = ?',
                [application.animal_id]
            );

            // Reject all other pending applications for this animal
            await executeQuery(
                `UPDATE adoption_applications 
                 SET status = 'rejected', admin_notes = 'Animal was adopted by another applicant', 
                     reviewed_by = ?, reviewed_date = CURRENT_TIMESTAMP 
                 WHERE animal_id = ? AND id != ? AND status = 'pending'`,
                [req.user.id, application.animal_id, applicationId]
            );
        }

        // If application is rejected or completed, and it was previously approved, make animal available again
        if ((status === 'rejected' || status === 'completed') && application.current_status === 'approved') {
            await executeQuery(
                'UPDATE animals SET is_available = TRUE WHERE id = ?',
                [application.animal_id]
            );
        }

        const updatedApplication = await getOne(
            `SELECT 
                aa.*,
                a.name as animal_name,
                u.first_name, u.last_name, u.email,
                reviewer.first_name as reviewer_first_name, reviewer.last_name as reviewer_last_name
             FROM adoption_applications aa
             JOIN animals a ON aa.animal_id = a.id
             JOIN users u ON aa.user_id = u.id
             LEFT JOIN users reviewer ON aa.reviewed_by = reviewer.id
             WHERE aa.id = ?`,
            [applicationId]
        );

        res.json({
            success: true,
            message: `Application ${status} successfully`,
            application: updatedApplication
        });

    } catch (error) {
        console.error('Update application status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating application status'
        });
    }
});

// @route   DELETE /api/adoptions/:id
// @desc    Delete adoption application (user can delete their own pending applications)
// @access  Private
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const applicationId = req.params.id;

        const application = await getOne(
            'SELECT id, user_id, status FROM adoption_applications WHERE id = ?',
            [applicationId]
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // Users can only delete their own pending applications, admins can delete any
        if (req.user.role === 'user') {
            if (application.user_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            if (application.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete non-pending applications'
                });
            }
        }

        await executeQuery('DELETE FROM adoption_applications WHERE id = ?', [applicationId]);

        res.json({
            success: true,
            message: 'Application deleted successfully'
        });

    } catch (error) {
        console.error('Delete adoption application error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deleting application'
        });
    }
});

module.exports = router;