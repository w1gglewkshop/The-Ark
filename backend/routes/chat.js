const express = require('express');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireStaff, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/chat/history/:roomId
// @desc    Get chat message history
// @access  Private
router.get('/history/:roomId', verifyToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const { limit = 50 } = req.query;

        const messages = await executeQuery(`
            SELECT cm.*, u.first_name, u.last_name
            FROM chat_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE cm.room_id = ?
            ORDER BY cm.timestamp DESC
            LIMIT ?
        `, [roomId, parseInt(limit)]);

        res.json({ success: true, messages: messages.reverse() });
    } catch (error) {
        console.error('Get chat history error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/chat/rooms
// @desc    Create or get chat room
// @access  Private
router.post('/rooms', verifyToken, async (req, res) => {
    try {
        const roomId = `user_${req.user.id}_${Date.now()}`;
        res.json({ success: true, roomId });
    } catch (error) {
        console.error('Create chat room error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;