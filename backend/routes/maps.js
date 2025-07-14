const express = require('express');
const { query, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/maps/animals
// @desc    Get animals with location data for map display
// @access  Public
router.get('/animals', [
    optionalAuth,
    query('lat').optional().isFloat({ min: -90, max: 90 }),
    query('lng').optional().isFloat({ min: -180, max: 180 }),
    query('radius').optional().isFloat({ min: 0, max: 1000 }),
    query('species').optional().isIn(['dog', 'cat', 'rabbit', 'bird', 'other'])
], async (req, res) => {
    try {
        const { lat, lng, radius = 50, species } = req.query;
        
        let whereConditions = ['a.is_available = 1', 'a.latitude IS NOT NULL', 'a.longitude IS NOT NULL'];
        let queryParams = [];

        if (species) {
            whereConditions.push('a.species = ?');
            queryParams.push(species);
        }

        // Location-based filtering
        if (lat && lng) {
            whereConditions.push(`(
                6371 * acos(
                    cos(radians(?)) * cos(radians(a.latitude)) * 
                    cos(radians(a.longitude) - radians(?)) + 
                    sin(radians(?)) * sin(radians(a.latitude))
                ) <= ?
            )`);
            queryParams.push(lat, lng, lat, radius);
        }

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        const animals = await executeQuery(`
            SELECT 
                a.id, a.name, a.species, a.breed, a.size, a.gender,
                a.latitude, a.longitude, a.adoption_fee, a.location,
                (SELECT image_url FROM animal_images WHERE animal_id = a.id AND is_primary = 1 LIMIT 1) as image_url
            FROM animals a
            ${whereClause}
            ORDER BY a.date_added DESC
        `, queryParams);

        res.json({ success: true, animals });
    } catch (error) {
        console.error('Get map animals error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/maps/lost-found
// @desc    Get lost/found pets with location data for map display
// @access  Public
router.get('/lost-found', [
    optionalAuth,
    query('lat').optional().isFloat({ min: -90, max: 90 }),
    query('lng').optional().isFloat({ min: -180, max: 180 }),
    query('radius').optional().isFloat({ min: 0, max: 1000 }),
    query('post_type').optional().isIn(['lost', 'found']),
    query('species').optional().isIn(['dog', 'cat', 'rabbit', 'bird', 'other'])
], async (req, res) => {
    try {
        const { lat, lng, radius = 50, post_type, species } = req.query;
        
        let whereConditions = ['lf.latitude IS NOT NULL', 'lf.longitude IS NOT NULL', 'lf.status != "reunited"'];
        let queryParams = [];

        if (post_type) {
            whereConditions.push('lf.post_type = ?');
            queryParams.push(post_type);
        }

        if (species) {
            whereConditions.push('lf.species = ?');
            queryParams.push(species);
        }

        // Location-based filtering
        if (lat && lng) {
            whereConditions.push(`(
                6371 * acos(
                    cos(radians(?)) * cos(radians(lf.latitude)) * 
                    cos(radians(lf.longitude) - radians(?)) + 
                    sin(radians(?)) * sin(radians(lf.latitude))
                ) <= ?
            )`);
            queryParams.push(lat, lng, lat, radius);
        }

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        const posts = await executeQuery(`
            SELECT 
                lf.id, lf.pet_name, lf.species, lf.breed, lf.color, lf.size,
                lf.latitude, lf.longitude, lf.last_seen_location, lf.last_seen_date,
                lf.post_type, lf.status, lf.reward_amount, lf.contact_phone,
                (SELECT image_url FROM lost_found_images WHERE post_id = lf.id LIMIT 1) as image_url
            FROM lost_found_pets lf
            ${whereClause}
            ORDER BY lf.last_seen_date DESC
        `, queryParams);

        res.json({ success: true, posts });
    } catch (error) {
        console.error('Get map lost/found error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/maps/combined
// @desc    Get both animals and lost/found data for comprehensive map view
// @access  Public
router.get('/combined', [
    optionalAuth,
    query('lat').optional().isFloat({ min: -90, max: 90 }),
    query('lng').optional().isFloat({ min: -180, max: 180 }),
    query('radius').optional().isFloat({ min: 0, max: 1000 })
], async (req, res) => {
    try {
        const { lat, lng, radius = 50 } = req.query;
        
        // Get animals
        const animalsPromise = executeQuery(`
            SELECT 
                a.id, a.name as title, a.species, a.latitude, a.longitude, a.location,
                'animal' as type, a.adoption_fee,
                (SELECT image_url FROM animal_images WHERE animal_id = a.id AND is_primary = 1 LIMIT 1) as image_url
            FROM animals a
            WHERE a.is_available = 1 AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
            ${lat && lng ? `AND (
                6371 * acos(
                    cos(radians(?)) * cos(radians(a.latitude)) * 
                    cos(radians(a.longitude) - radians(?)) + 
                    sin(radians(?)) * sin(radians(a.latitude))
                ) <= ?
            )` : ''}
            ORDER BY a.date_added DESC
        `, lat && lng ? [lat, lng, lat, radius] : []);

        // Get lost/found posts
        const lostFoundPromise = executeQuery(`
            SELECT 
                lf.id, lf.pet_name as title, lf.species, lf.latitude, lf.longitude, 
                lf.last_seen_location as location, lf.post_type as type, lf.reward_amount,
                (SELECT image_url FROM lost_found_images WHERE post_id = lf.id LIMIT 1) as image_url
            FROM lost_found_pets lf
            WHERE lf.status != 'reunited' AND lf.latitude IS NOT NULL AND lf.longitude IS NOT NULL
            ${lat && lng ? `AND (
                6371 * acos(
                    cos(radians(?)) * cos(radians(lf.latitude)) * 
                    cos(radians(lf.longitude) - radians(?)) + 
                    sin(radians(?)) * sin(radians(lf.latitude))
                ) <= ?
            )` : ''}
            ORDER BY lf.last_seen_date DESC
        `, lat && lng ? [lat, lng, lat, radius] : []);

        const [animals, lostFound] = await Promise.all([animalsPromise, lostFoundPromise]);

        res.json({ 
            success: true, 
            data: {
                animals,
                lost_found: lostFound,
                total_markers: animals.length + lostFound.length
            }
        });
    } catch (error) {
        console.error('Get combined map data error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;