const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/health-tracker/:animalId
// @desc    Get health records for an animal
// @access  Staff only
router.get('/:animalId', requireStaff, async (req, res) => {
    try {
        const animalId = req.params.animalId;
        
        const records = await executeQuery(`
            SELECT * FROM animal_health 
            WHERE animal_id = ? 
            ORDER BY created_at DESC
        `, [animalId]);

        res.json({ success: true, records });
    } catch (error) {
        console.error('Get health records error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/health-tracker
// @desc    Add health record
// @access  Staff only
router.post('/', [
    requireStaff,
    body('animal_id').isInt({ min: 1 }),
    body('vet_visit_date').optional().isISO8601(),
    body('vaccination_date').optional().isISO8601(),
    body('vaccination_type').optional().isLength({ max: 100 }),
    body('health_status').isIn(['excellent', 'good', 'fair', 'poor', 'critical']),
    body('weight').optional().isFloat({ min: 0 }),
    body('notes').optional().isLength({ max: 2000 }),
    body('next_checkup').optional().isISO8601()
], async (req, res) => {
    try {
        const {
            animal_id, vet_visit_date, vaccination_date, vaccination_type,
            health_status, weight, notes, next_checkup
        } = req.body;

        const result = await executeQuery(`
            INSERT INTO animal_health (
                animal_id, vet_visit_date, vaccination_date, vaccination_type,
                health_status, weight, notes, next_checkup
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [animal_id, vet_visit_date, vaccination_date, vaccination_type, health_status, weight, notes, next_checkup]);

        res.status(201).json({ success: true, message: 'Health record added', id: result.insertId });
    } catch (error) {
        console.error('Add health record error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;