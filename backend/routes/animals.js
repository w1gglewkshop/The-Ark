const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, requireAdmin, requireStaff, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/animals
// @desc    Get all animals with search and filtering
// @access  Public
router.get('/', [
    optionalAuth,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('search').optional().isLength({ max: 100 }),
    query('species').optional().isIn(['dog', 'cat', 'rabbit', 'bird', 'other']),
    query('size').optional().isIn(['small', 'medium', 'large', 'extra_large']),
    query('gender').optional().isIn(['male', 'female']),
    query('age_min').optional().isInt({ min: 0 }),
    query('age_max').optional().isInt({ min: 0 }),
    query('available_only').optional().isBoolean(),
    query('sort_by').optional().isIn(['name', 'date_added', 'age_years', 'adoption_fee']),
    query('sort_order').optional().isIn(['asc', 'desc'])
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
            limit = 12,
            search,
            species,
            size,
            gender,
            age_min,
            age_max,
            available_only = 'true',
            sort_by = 'date_added',
            sort_order = 'desc'
        } = req.query;

        const offset = (page - 1) * limit;
        
        // Build WHERE clause
        let whereConditions = [];
        let queryParams = [];

        if (available_only === 'true') {
            whereConditions.push('a.is_available = ?');
            queryParams.push(true);
        }

        if (search) {
            whereConditions.push('(a.name LIKE ? OR a.breed LIKE ? OR a.description LIKE ?)');
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
        }

        if (species) {
            whereConditions.push('a.species = ?');
            queryParams.push(species);
        }

        if (size) {
            whereConditions.push('a.size = ?');
            queryParams.push(size);
        }

        if (gender) {
            whereConditions.push('a.gender = ?');
            queryParams.push(gender);
        }

        if (age_min !== undefined) {
            whereConditions.push('(a.age_years >= ? OR (a.age_years = ? AND a.age_months >= 0))');
            queryParams.push(age_min, age_min);
        }

        if (age_max !== undefined) {
            whereConditions.push('a.age_years <= ?');
            queryParams.push(age_max);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM animals a 
            ${whereClause}
        `;
        const countResult = await getOne(countQuery, queryParams);
        const total = countResult.total;

        // Get animals with primary images
        const animalsQuery = `
            SELECT 
                a.*,
                ai.image_url as primary_image,
                COALESCE(a.age_years, 0) + ROUND(COALESCE(a.age_months, 0) / 12, 1) as total_age
            FROM animals a
            LEFT JOIN animal_images ai ON a.id = ai.animal_id AND ai.is_primary = 1
            ${whereClause}
            ORDER BY a.${sort_by} ${sort_order.toUpperCase()}
            LIMIT ? OFFSET ?
        `;

        const animals = await executeQuery(animalsQuery, [...queryParams, parseInt(limit), parseInt(offset)]);

        // Get all images for each animal
        for (let animal of animals) {
            const images = await executeQuery(
                'SELECT image_url, is_primary, caption FROM animal_images WHERE animal_id = ? ORDER BY is_primary DESC, id ASC',
                [animal.id]
            );
            animal.images = images;
        }

        res.json({
            success: true,
            data: {
                animals,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_items: total,
                    total_pages: Math.ceil(total / limit)
                },
                filters: {
                    search,
                    species,
                    size,
                    gender,
                    age_min,
                    age_max,
                    available_only
                }
            }
        });

    } catch (error) {
        console.error('Get animals error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving animals'
        });
    }
});

// @route   GET /api/animals/:id
// @desc    Get single animal by ID
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const animalId = req.params.id;

        const animal = await getOne(
            `SELECT 
                a.*,
                COALESCE(a.age_years, 0) + ROUND(COALESCE(a.age_months, 0) / 12, 1) as total_age
            FROM animals a 
            WHERE a.id = ?`,
            [animalId]
        );

        if (!animal) {
            return res.status(404).json({
                success: false,
                message: 'Animal not found'
            });
        }

        // Get all images
        const images = await executeQuery(
            'SELECT image_url, is_primary, caption FROM animal_images WHERE animal_id = ? ORDER BY is_primary DESC, id ASC',
            [animalId]
        );
        animal.images = images;

        // Get health records if user is staff
        if (req.user && ['admin', 'volunteer'].includes(req.user.role)) {
            const healthRecords = await executeQuery(
                'SELECT * FROM animal_health WHERE animal_id = ? ORDER BY created_at DESC',
                [animalId]
            );
            animal.health_records = healthRecords;
        }

        res.json({
            success: true,
            animal
        });

    } catch (error) {
        console.error('Get animal error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving animal'
        });
    }
});

// @route   POST /api/animals
// @desc    Create new animal
// @access  Admin/Staff only
router.post('/', [
    requireStaff,
    body('name').isLength({ min: 1, max: 100 }).trim().escape(),
    body('species').isIn(['dog', 'cat', 'rabbit', 'bird', 'other']),
    body('breed').optional().isLength({ max: 100 }).trim().escape(),
    body('age_years').optional().isInt({ min: 0, max: 30 }),
    body('age_months').optional().isInt({ min: 0, max: 11 }),
    body('gender').isIn(['male', 'female']),
    body('size').isIn(['small', 'medium', 'large', 'extra_large']),
    body('color').optional().isLength({ max: 100 }).trim().escape(),
    body('description').optional().isLength({ max: 2000 }),
    body('personality').optional().isLength({ max: 1000 }),
    body('special_needs').optional().isLength({ max: 1000 }),
    body('adoption_fee').optional().isFloat({ min: 0 }),
    body('location').optional().isLength({ max: 255 }),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 })
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
            name,
            species,
            breed,
            age_years,
            age_months,
            gender,
            size,
            color,
            description,
            personality,
            special_needs,
            adoption_fee,
            location,
            latitude,
            longitude
        } = req.body;

        const result = await executeQuery(
            `INSERT INTO animals (
                name, species, breed, age_years, age_months, gender, size, color,
                description, personality, special_needs, adoption_fee, location, latitude, longitude
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, species, breed, age_years, age_months, gender, size, color,
                description, personality, special_needs, adoption_fee, location, latitude, longitude
            ]
        );

        const newAnimal = await getOne(
            'SELECT * FROM animals WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Animal created successfully',
            animal: newAnimal
        });

    } catch (error) {
        console.error('Create animal error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error creating animal'
        });
    }
});

// @route   PUT /api/animals/:id
// @desc    Update animal
// @access  Admin/Staff only
router.put('/:id', [
    requireStaff,
    body('name').optional().isLength({ min: 1, max: 100 }).trim().escape(),
    body('species').optional().isIn(['dog', 'cat', 'rabbit', 'bird', 'other']),
    body('breed').optional().isLength({ max: 100 }).trim().escape(),
    body('age_years').optional().isInt({ min: 0, max: 30 }),
    body('age_months').optional().isInt({ min: 0, max: 11 }),
    body('gender').optional().isIn(['male', 'female']),
    body('size').optional().isIn(['small', 'medium', 'large', 'extra_large']),
    body('color').optional().isLength({ max: 100 }).trim().escape(),
    body('description').optional().isLength({ max: 2000 }),
    body('personality').optional().isLength({ max: 1000 }),
    body('special_needs').optional().isLength({ max: 1000 }),
    body('adoption_fee').optional().isFloat({ min: 0 }),
    body('is_available').optional().isBoolean(),
    body('location').optional().isLength({ max: 255 }),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 })
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

        const animalId = req.params.id;
        const updateFields = {};
        const allowedFields = [
            'name', 'species', 'breed', 'age_years', 'age_months', 'gender', 'size',
            'color', 'description', 'personality', 'special_needs', 'adoption_fee',
            'is_available', 'location', 'latitude', 'longitude'
        ];

        // Build update object
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateFields[field] = req.body[field];
            }
        });

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        // Check if animal exists
        const existingAnimal = await getOne('SELECT id FROM animals WHERE id = ?', [animalId]);
        if (!existingAnimal) {
            return res.status(404).json({
                success: false,
                message: 'Animal not found'
            });
        }

        // Build update query
        const setClause = Object.keys(updateFields).map(field => `${field} = ?`).join(', ');
        const values = Object.values(updateFields);

        await executeQuery(
            `UPDATE animals SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [...values, animalId]
        );

        // Get updated animal
        const updatedAnimal = await getOne('SELECT * FROM animals WHERE id = ?', [animalId]);

        res.json({
            success: true,
            message: 'Animal updated successfully',
            animal: updatedAnimal
        });

    } catch (error) {
        console.error('Update animal error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating animal'
        });
    }
});

// @route   DELETE /api/animals/:id
// @desc    Delete animal
// @access  Admin only
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const animalId = req.params.id;

        const animal = await getOne('SELECT id FROM animals WHERE id = ?', [animalId]);
        if (!animal) {
            return res.status(404).json({
                success: false,
                message: 'Animal not found'
            });
        }

        await executeQuery('DELETE FROM animals WHERE id = ?', [animalId]);

        res.json({
            success: true,
            message: 'Animal deleted successfully'
        });

    } catch (error) {
        console.error('Delete animal error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deleting animal'
        });
    }
});

// @route   GET /api/animals/search/map
// @desc    Get animals for map display
// @access  Public
router.get('/search/map', optionalAuth, async (req, res) => {
    try {
        const animals = await executeQuery(
            `SELECT 
                id, name, species, size, latitude, longitude, adoption_fee,
                (SELECT image_url FROM animal_images WHERE animal_id = animals.id AND is_primary = 1 LIMIT 1) as image_url
            FROM animals 
            WHERE is_available = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL`
        );

        res.json({
            success: true,
            animals
        });

    } catch (error) {
        console.error('Get map animals error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error retrieving animals for map'
        });
    }
});

module.exports = router;