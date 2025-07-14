const express = require('express');
const { query, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { requireAdmin, requireStaff } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Admin/Staff only
router.get('/dashboard', requireStaff, async (req, res) => {
    try {
        // Get comprehensive dashboard statistics
        const [
            userStats,
            animalStats,
            adoptionStats,
            donationStats,
            volunteerStats,
            lostFoundStats
        ] = await Promise.all([
            // User statistics
            getOne(`SELECT 
                COUNT(*) as total_users,
                SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as regular_users,
                SUM(CASE WHEN role = 'volunteer' THEN 1 ELSE 0 END) as volunteers,
                SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users
            FROM users`),

            // Animal statistics
            getOne(`SELECT 
                COUNT(*) as total_animals,
                SUM(CASE WHEN is_available = 1 THEN 1 ELSE 0 END) as available_animals,
                SUM(CASE WHEN species = 'dog' THEN 1 ELSE 0 END) as dogs,
                SUM(CASE WHEN species = 'cat' THEN 1 ELSE 0 END) as cats,
                SUM(CASE WHEN species = 'rabbit' THEN 1 ELSE 0 END) as rabbits,
                SUM(CASE WHEN species = 'bird' THEN 1 ELSE 0 END) as birds,
                SUM(CASE WHEN species = 'other' THEN 1 ELSE 0 END) as others
            FROM animals`),

            // Adoption statistics
            getOne(`SELECT 
                COUNT(*) as total_applications,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM adoption_applications`),

            // Donation statistics
            getOne(`SELECT 
                COUNT(*) as total_donations,
                SUM(amount) as total_amount,
                AVG(amount) as average_amount,
                MAX(amount) as highest_donation
            FROM donations`),

            // Volunteer statistics
            getOne(`SELECT 
                COUNT(*) as total_applications,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
            FROM volunteer_applications`),

            // Lost & Found statistics
            getOne(`SELECT 
                COUNT(*) as total_posts,
                SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
                SUM(CASE WHEN status = 'found' THEN 1 ELSE 0 END) as found,
                SUM(CASE WHEN status = 'reunited' THEN 1 ELSE 0 END) as reunited
            FROM lost_found_pets`)
        ]);

        // Get recent activities
        const recentActivities = await executeQuery(`
            SELECT 'adoption' as type, 'New adoption application' as activity, 
                   CONCAT(u.first_name, ' ', u.last_name, ' applied for ', a.name) as details,
                   aa.application_date as created_at
            FROM adoption_applications aa
            JOIN users u ON aa.user_id = u.id
            JOIN animals a ON aa.animal_id = a.id
            WHERE aa.application_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            
            UNION ALL
            
            SELECT 'volunteer' as type, 'New volunteer application' as activity,
                   CONCAT(u.first_name, ' ', u.last_name, ' applied to volunteer') as details,
                   va.application_date as created_at
            FROM volunteer_applications va
            JOIN users u ON va.user_id = u.id
            WHERE va.application_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            
            UNION ALL
            
            SELECT 'donation' as type, 'New donation received' as activity,
                   CONCAT('$', d.amount, ' donated by ', d.donor_name) as details,
                   d.donation_date as created_at
            FROM donations d
            WHERE d.donation_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            
            ORDER BY created_at DESC
            LIMIT 20
        `);

        // Get monthly trends (last 6 months)
        const monthlyTrends = await executeQuery(`
            SELECT 
                DATE_FORMAT(month_date, '%Y-%m') as month,
                COALESCE(adoptions, 0) as adoptions,
                COALESCE(donations, 0) as donations,
                COALESCE(donation_amount, 0) as donation_amount
            FROM (
                SELECT DATE_FORMAT(DATE_SUB(NOW(), INTERVAL n MONTH), '%Y-%m-01') as month_date
                FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) months
            ) calendar
            LEFT JOIN (
                SELECT DATE_FORMAT(application_date, '%Y-%m') as month, COUNT(*) as adoptions
                FROM adoption_applications 
                WHERE status = 'approved' AND application_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(application_date, '%Y-%m')
            ) a ON DATE_FORMAT(calendar.month_date, '%Y-%m') = a.month
            LEFT JOIN (
                SELECT DATE_FORMAT(donation_date, '%Y-%m') as month, COUNT(*) as donations, SUM(amount) as donation_amount
                FROM donations 
                WHERE donation_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(donation_date, '%Y-%m')
            ) d ON DATE_FORMAT(calendar.month_date, '%Y-%m') = d.month
            ORDER BY month_date DESC
        `);

        res.json({
            success: true,
            dashboard: {
                stats: {
                    users: userStats,
                    animals: animalStats,
                    adoptions: adoptionStats,
                    donations: donationStats,
                    volunteers: volunteerStats,
                    lost_found: lostFoundStats
                },
                recent_activities: recentActivities,
                monthly_trends: monthlyTrends
            }
        });

    } catch (error) {
        console.error('Get admin dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving dashboard data'
        });
    }
});

// @route   GET /api/admin/users
// @desc    Get all users for admin management
// @access  Admin only
router.get('/users', [
    requireAdmin,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isLength({ max: 100 }),
    query('role').optional().isIn(['user', 'volunteer', 'admin']),
    query('is_active').optional().isBoolean()
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
            limit = 50,
            search,
            role,
            is_active
        } = req.query;

        const offset = (page - 1) * limit;

        let whereConditions = [];
        let queryParams = [];

        if (search) {
            whereConditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR username LIKE ?)');
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (role) {
            whereConditions.push('role = ?');
            queryParams.push(role);
        }

        if (is_active !== undefined) {
            whereConditions.push('is_active = ?');
            queryParams.push(is_active === 'true');
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
        const countResult = await getOne(countQuery, queryParams);
        const total = countResult.total;

        // Get users
        const usersQuery = `
            SELECT 
                id, username, email, first_name, last_name, phone, role, 
                is_active, email_verified, date_joined, last_login
            FROM users 
            ${whereClause}
            ORDER BY date_joined DESC
            LIMIT ? OFFSET ?
        `;

        const users = await executeQuery(usersQuery, [...queryParams, parseInt(limit), parseInt(offset)]);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_items: total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get admin users error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving users'
        });
    }
});

// @route   PUT /api/admin/users/:id/toggle-active
// @desc    Toggle user active status
// @access  Admin only
router.put('/users/:id/toggle-active', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;

        const user = await getOne('SELECT id, is_active, first_name, last_name FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const newStatus = !user.is_active;
        await executeQuery('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, userId]);

        res.json({
            success: true,
            message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
            user: { ...user, is_active: newStatus }
        });

    } catch (error) {
        console.error('Toggle user active error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating user status'
        });
    }
});

// @route   PUT /api/admin/users/:id/role
// @desc    Update user role
// @access  Admin only
router.put('/users/:id/role', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const { role } = req.body;

        if (!['user', 'volunteer', 'admin'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }

        const user = await getOne('SELECT id, role, first_name, last_name FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await executeQuery('UPDATE users SET role = ? WHERE id = ?', [role, userId]);

        res.json({
            success: true,
            message: `User role updated to ${role} successfully`,
            user: { ...user, role }
        });

    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating user role'
        });
    }
});

// @route   GET /api/admin/reports/adoptions
// @desc    Get adoption reports
// @access  Staff only
router.get('/reports/adoptions', requireStaff, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        let dateFilter = '';
        let queryParams = [];

        if (start_date && end_date) {
            dateFilter = 'WHERE aa.application_date BETWEEN ? AND ?';
            queryParams = [start_date, end_date];
        }

        const adoptionReport = await executeQuery(`
            SELECT 
                aa.id, aa.application_date, aa.status,
                CONCAT(u.first_name, ' ', u.last_name) as adopter_name,
                u.email as adopter_email,
                a.name as animal_name, a.species, a.breed,
                CONCAT(reviewer.first_name, ' ', reviewer.last_name) as reviewed_by,
                aa.reviewed_date
            FROM adoption_applications aa
            JOIN users u ON aa.user_id = u.id
            JOIN animals a ON aa.animal_id = a.id
            LEFT JOIN users reviewer ON aa.reviewed_by = reviewer.id
            ${dateFilter}
            ORDER BY aa.application_date DESC
        `, queryParams);

        res.json({
            success: true,
            report: adoptionReport
        });

    } catch (error) {
        console.error('Get adoption report error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error generating adoption report'
        });
    }
});

// @route   DELETE /api/admin/cleanup
// @desc    Clean up old data (admin maintenance)
// @access  Admin only
router.delete('/cleanup', requireAdmin, async (req, res) => {
    try {
        const { days = 365 } = req.query;

        // Clean up old notifications
        const deletedNotifications = await executeQuery(
            'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY) AND is_read = TRUE',
            [days]
        );

        // Clean up old chat messages (optional)
        const deletedMessages = await executeQuery(
            'DELETE FROM chat_messages WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [days * 2] // Keep chat messages for double the time
        );

        res.json({
            success: true,
            message: 'Cleanup completed successfully',
            cleaned: {
                notifications: deletedNotifications.affectedRows,
                chat_messages: deletedMessages.affectedRows
            }
        });

    } catch (error) {
        console.error('Admin cleanup error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during cleanup'
        });
    }
});

module.exports = router;