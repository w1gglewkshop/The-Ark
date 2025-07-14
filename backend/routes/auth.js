const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { generateToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const registerValidation = [
    body('username').isLength({ min: 3, max: 50 }).trim().escape(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6, max: 128 }),
    body('firstName').isLength({ min: 1, max: 50 }).trim().escape(),
    body('lastName').isLength({ min: 1, max: 50 }).trim().escape(),
    body('phone').optional().isMobilePhone(),
    body('address').optional().isLength({ max: 500 }).trim().escape(),
    body('city').optional().isLength({ max: 100 }).trim().escape(),
    body('state').optional().isLength({ max: 50 }).trim().escape(),
    body('zipCode').optional().isLength({ max: 10 }).trim().escape()
];

const loginValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
];

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', registerValidation, async (req, res) => {
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
            username,
            email,
            password,
            firstName,
            lastName,
            phone,
            address,
            city,
            state,
            zipCode
        } = req.body;

        // Check if user already exists
        const existingUser = await getOne(
            'SELECT id FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email or username already exists'
            });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert new user
        const result = await executeQuery(
            `INSERT INTO users (username, email, password_hash, first_name, last_name, 
             phone, address, city, state, zip_code) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [username, email, passwordHash, firstName, lastName, phone, address, city, state, zipCode]
        );

        // Generate JWT token
        const token = generateToken(result.insertId);

        // Get user data (without password)
        const user = await getOne(
            'SELECT id, username, email, first_name, last_name, role, date_joined FROM users WHERE id = ?',
            [result.insertId]
        );

        // Set cookie and send response
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user,
            token
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', loginValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // Find user by email
        const user = await getOne(
            'SELECT id, username, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = ?',
            [email]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Update last login
        await executeQuery(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );

        // Generate JWT token
        const token = generateToken(user.id);

        // Remove password from user object
        delete user.password_hash;

        // Set cookie and send response
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            success: true,
            message: 'Login successful',
            user,
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', verifyToken, async (req, res) => {
    try {
        // Clear the cookie
        res.clearCookie('token');

        res.json({
            success: true,
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during logout'
        });
    }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = await getOne(
            'SELECT id, username, email, first_name, last_name, phone, address, city, state, zip_code, role, profile_image, date_joined, last_login FROM users WHERE id = ?',
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/auth/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', [
    verifyToken,
    body('currentPassword').isLength({ min: 6 }),
    body('newPassword').isLength({ min: 6, max: 128 })
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

        const { currentPassword, newPassword } = req.body;

        // Get current user with password
        const user = await getOne(
            'SELECT id, password_hash FROM users WHERE id = ?',
            [req.user.id]
        );

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const saltRounds = 12;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await executeQuery(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newPasswordHash, req.user.id]
        );

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during password change'
        });
    }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset (placeholder for email functionality)
// @access  Public
router.post('/forgot-password', [
    body('email').isEmail().normalizeEmail()
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

        const { email } = req.body;

        // Check if user exists
        const user = await getOne(
            'SELECT id, email, first_name FROM users WHERE email = ?',
            [email]
        );

        // Always return success for security (don't reveal if email exists)
        res.json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.'
        });

        // TODO: Implement email sending logic here
        if (user) {
            console.log(`Password reset requested for user ${user.id} (${user.email})`);
            // Generate reset token, save to database, send email
        }

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;