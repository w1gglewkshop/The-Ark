const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireStaff, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/donations
// @desc    Process donation
// @access  Public (can donate without account)
router.post('/', [
    optionalAuth,
    body('amount').isFloat({ min: 1 }),
    body('donation_type').isIn(['general', 'animal_sponsorship', 'medical_fund', 'food_fund', 'shelter_maintenance']),
    body('animal_id').optional().isInt({ min: 1 }),
    body('donor_name').isLength({ min: 2, max: 100 }),
    body('donor_email').isEmail(),
    body('payment_method').isIn(['credit_card', 'paypal', 'bank_transfer']),
    body('transaction_id').isLength({ min: 1, max: 255 }),
    body('is_recurring').optional().isBoolean(),
    body('recurring_frequency').optional().isIn(['monthly', 'quarterly', 'yearly']),
    body('message').optional().isLength({ max: 1000 }),
    body('is_anonymous').optional().isBoolean()
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
            amount,
            donation_type,
            animal_id,
            donor_name,
            donor_email,
            payment_method,
            transaction_id,
            is_recurring = false,
            recurring_frequency,
            message,
            is_anonymous = false
        } = req.body;

        // Validate animal exists if animal_id provided
        if (animal_id) {
            const animal = await getOne('SELECT id, name FROM animals WHERE id = ?', [animal_id]);
            if (!animal) {
                return res.status(404).json({
                    success: false,
                    message: 'Animal not found'
                });
            }
        }

        // Validate recurring frequency if is_recurring is true
        if (is_recurring && !recurring_frequency) {
            return res.status(400).json({
                success: false,
                message: 'Recurring frequency is required for recurring donations'
            });
        }

        // Check for duplicate transaction_id
        const existingDonation = await getOne(
            'SELECT id FROM donations WHERE transaction_id = ?',
            [transaction_id]
        );

        if (existingDonation) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate transaction detected'
            });
        }

        const result = await executeQuery(
            `INSERT INTO donations (
                user_id, donor_name, donor_email, amount, donation_type, animal_id,
                payment_method, transaction_id, is_recurring, recurring_frequency,
                message, is_anonymous
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user?.id || null, donor_name, donor_email, amount, donation_type, animal_id,
                payment_method, transaction_id, is_recurring, recurring_frequency,
                message, is_anonymous
            ]
        );

        const donation = await getOne(
            `SELECT 
                d.*,
                a.name as animal_name
             FROM donations d
             LEFT JOIN animals a ON d.animal_id = a.id
             WHERE d.id = ?`,
            [result.insertId]
        );

        // TODO: Send thank you email
        console.log(`New donation received: $${amount} from ${donor_name} (${donor_email})`);

        res.status(201).json({
            success: true,
            message: 'Donation processed successfully',
            donation
        });

    } catch (error) {
        console.error('Process donation error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error processing donation'
        });
    }
});

// @route   GET /api/donations
// @desc    Get donations (admin gets all, users get their own)
// @access  Private
router.get('/', [
    verifyToken,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('donation_type').optional().isIn(['general', 'animal_sponsorship', 'medical_fund', 'food_fund', 'shelter_maintenance']),
    query('animal_id').optional().isInt({ min: 1 }),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601()
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
            donation_type,
            animal_id,
            start_date,
            end_date
        } = req.query;

        const offset = (page - 1) * limit;

        let whereConditions = [];
        let queryParams = [];

        // Regular users can only see their own donations
        if (req.user.role === 'user') {
            whereConditions.push('d.user_id = ?');
            queryParams.push(req.user.id);
        }

        if (donation_type) {
            whereConditions.push('d.donation_type = ?');
            queryParams.push(donation_type);
        }

        if (animal_id) {
            whereConditions.push('d.animal_id = ?');
            queryParams.push(animal_id);
        }

        if (start_date) {
            whereConditions.push('d.donation_date >= ?');
            queryParams.push(start_date);
        }

        if (end_date) {
            whereConditions.push('d.donation_date <= ?');
            queryParams.push(end_date);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM donations d ${whereClause}`;
        const countResult = await getOne(countQuery, queryParams);
        const total = countResult.total;

        // Get donations
        const donationsQuery = `
            SELECT 
                d.*,
                a.name as animal_name,
                u.first_name, u.last_name
            FROM donations d
            LEFT JOIN animals a ON d.animal_id = a.id
            LEFT JOIN users u ON d.user_id = u.id
            ${whereClause}
            ORDER BY d.donation_date DESC
            LIMIT ? OFFSET ?
        `;

        const donations = await executeQuery(donationsQuery, [...queryParams, parseInt(limit), parseInt(offset)]);

        // Hide sensitive info for non-staff users viewing others' donations
        if (req.user.role === 'user') {
            donations.forEach(donation => {
                if (donation.is_anonymous) {
                    donation.donor_name = 'Anonymous';
                    donation.donor_email = null;
                }
            });
        }

        res.json({
            success: true,
            data: {
                donations,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_items: total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get donations error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving donations'
        });
    }
});

// @route   GET /api/donations/stats
// @desc    Get donation statistics
// @access  Staff/Admin only
router.get('/stats', requireStaff, async (req, res) => {
    try {
        // Total donations
        const totalStats = await getOne(
            `SELECT 
                COUNT(*) as total_donations,
                SUM(amount) as total_amount,
                AVG(amount) as average_amount
             FROM donations`
        );

        // Donations by type
        const typeStats = await executeQuery(
            `SELECT 
                donation_type,
                COUNT(*) as count,
                SUM(amount) as total_amount
             FROM donations
             GROUP BY donation_type
             ORDER BY total_amount DESC`
        );

        // Monthly donations (last 12 months)
        const monthlyStats = await executeQuery(
            `SELECT 
                DATE_FORMAT(donation_date, '%Y-%m') as month,
                COUNT(*) as count,
                SUM(amount) as total_amount
             FROM donations
             WHERE donation_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
             GROUP BY DATE_FORMAT(donation_date, '%Y-%m')
             ORDER BY month DESC`
        );

        // Recent large donations
        const recentLarge = await executeQuery(
            `SELECT 
                d.amount, d.donor_name, d.donation_date, d.donation_type,
                a.name as animal_name
             FROM donations d
             LEFT JOIN animals a ON d.animal_id = a.id
             WHERE d.amount >= 100 AND d.is_anonymous = FALSE
             ORDER BY d.donation_date DESC
             LIMIT 10`
        );

        res.json({
            success: true,
            stats: {
                total: totalStats,
                by_type: typeStats,
                monthly: monthlyStats,
                recent_large: recentLarge
            }
        });

    } catch (error) {
        console.error('Get donation stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving donation statistics'
        });
    }
});

// @route   GET /api/donations/animal/:animalId
// @desc    Get donations for specific animal
// @access  Public
router.get('/animal/:animalId', optionalAuth, async (req, res) => {
    try {
        const animalId = req.params.animalId;

        // Check if animal exists
        const animal = await getOne('SELECT id, name FROM animals WHERE id = ?', [animalId]);
        if (!animal) {
            return res.status(404).json({
                success: false,
                message: 'Animal not found'
            });
        }

        // Get donation stats for this animal
        const stats = await getOne(
            `SELECT 
                COUNT(*) as total_donations,
                SUM(amount) as total_amount
             FROM donations
             WHERE animal_id = ?`,
            [animalId]
        );

        // Get recent donations for this animal (non-anonymous only)
        const recentDonations = await executeQuery(
            `SELECT 
                donor_name, amount, donation_date, message
             FROM donations
             WHERE animal_id = ? AND is_anonymous = FALSE
             ORDER BY donation_date DESC
             LIMIT 10`,
            [animalId]
        );

        res.json({
            success: true,
            animal,
            stats,
            recent_donations: recentDonations
        });

    } catch (error) {
        console.error('Get animal donations error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving animal donations'
        });
    }
});

// @route   GET /api/donations/leaderboard
// @desc    Get donation leaderboard (non-anonymous donors)
// @access  Public
router.get('/leaderboard', async (req, res) => {
    try {
        const leaderboard = await executeQuery(
            `SELECT 
                donor_name,
                COUNT(*) as donation_count,
                SUM(amount) as total_donated
             FROM donations
             WHERE is_anonymous = FALSE
             GROUP BY donor_name, donor_email
             ORDER BY total_donated DESC
             LIMIT 20`
        );

        res.json({
            success: true,
            leaderboard
        });

    } catch (error) {
        console.error('Get donation leaderboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving donation leaderboard'
        });
    }
});

// @route   PUT /api/donations/:id/cancel
// @desc    Cancel recurring donation
// @access  Private (donor or admin)
router.put('/:id/cancel', verifyToken, async (req, res) => {
    try {
        const donationId = req.params.id;

        const donation = await getOne(
            'SELECT id, user_id, is_recurring FROM donations WHERE id = ?',
            [donationId]
        );

        if (!donation) {
            return res.status(404).json({
                success: false,
                message: 'Donation not found'
            });
        }

        if (!donation.is_recurring) {
            return res.status(400).json({
                success: false,
                message: 'This is not a recurring donation'
            });
        }

        // Only donor or admin can cancel
        if (req.user.role === 'user' && donation.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Note: In a real application, you would also cancel the recurring payment
        // with your payment processor (Stripe, PayPal, etc.)

        await executeQuery(
            'UPDATE donations SET is_recurring = FALSE WHERE id = ?',
            [donationId]
        );

        res.json({
            success: true,
            message: 'Recurring donation cancelled successfully'
        });

    } catch (error) {
        console.error('Cancel donation error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error cancelling donation'
        });
    }
});

module.exports = router;