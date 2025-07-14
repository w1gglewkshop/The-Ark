const jwt = require('jsonwebtoken');
const { getOne } = require('../config/database');

// Verify JWT token
const verifyToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '') || 
                     req.cookies?.token;

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access denied. No token provided.' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database to ensure they still exist and are active
        const user = await getOne(
            'SELECT id, username, email, first_name, last_name, role, is_active FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Token is not valid. User not found.' 
            });
        }

        if (!user.is_active) {
            return res.status(401).json({ 
                success: false, 
                message: 'Account is deactivated.' 
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ 
            success: false, 
            message: 'Token is not valid.' 
        });
    }
};

// Optional authentication (for public endpoints that can benefit from user info)
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '') || 
                     req.cookies?.token;

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await getOne(
                'SELECT id, username, email, first_name, last_name, role, is_active FROM users WHERE id = ?',
                [decoded.userId]
            );

            if (user && user.is_active) {
                req.user = user;
            }
        }
        next();
    } catch (error) {
        // Silently fail for optional auth
        next();
    }
};

// Role-based authorization
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required.' 
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Insufficient permissions.' 
            });
        }

        next();
    };
};

// Admin only middleware
const requireAdmin = requireRole('admin');

// Admin or Volunteer middleware
const requireStaff = requireRole('admin', 'volunteer');

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

// Verify and decode token without middleware
const decodeToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
};

module.exports = {
    verifyToken,
    optionalAuth,
    requireRole,
    requireAdmin,
    requireStaff,
    generateToken,
    decodeToken
};