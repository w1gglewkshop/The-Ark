const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { verifyToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/recommendations/quiz
// @desc    Submit quiz and get pet recommendations
// @access  Public
router.post('/quiz', [
    optionalAuth,
    body('housing_type').isIn(['house', 'apartment', 'condo', 'other']),
    body('yard_size').isIn(['none', 'small', 'medium', 'large']),
    body('activity_level').isIn(['low', 'moderate', 'high']),
    body('experience_level').isIn(['beginner', 'intermediate', 'expert']),
    body('time_availability').isIn(['limited', 'moderate', 'high']),
    body('preferred_size').isIn(['small', 'medium', 'large', 'any']),
    body('preferred_age').isIn(['puppy_kitten', 'young', 'adult', 'senior', 'any']),
    body('other_pets').isBoolean(),
    body('children_at_home').isBoolean(),
    body('allergies').isBoolean(),
    body('grooming_commitment').isIn(['low', 'medium', 'high'])
], async (req, res) => {
    try {
        const quizData = req.body;
        
        // Save quiz results
        const sessionId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await executeQuery(`
            INSERT INTO quiz_results (
                user_id, session_id, housing_type, yard_size, activity_level,
                experience_level, time_availability, preferred_size, preferred_age,
                other_pets, children_at_home, allergies, grooming_commitment
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            req.user?.id || null, sessionId, quizData.housing_type, quizData.yard_size,
            quizData.activity_level, quizData.experience_level, quizData.time_availability,
            quizData.preferred_size, quizData.preferred_age, quizData.other_pets,
            quizData.children_at_home, quizData.allergies, quizData.grooming_commitment
        ]);

        // Generate recommendations based on quiz
        let recommendations = await generateRecommendations(quizData);

        res.json({ 
            success: true, 
            recommendations,
            session_id: sessionId
        });
    } catch (error) {
        console.error('Pet recommendation quiz error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Recommendation logic
async function generateRecommendations(quizData) {
    let whereConditions = ['is_available = 1'];
    let queryParams = [];

    // Size matching
    if (quizData.preferred_size !== 'any') {
        whereConditions.push('size = ?');
        queryParams.push(quizData.preferred_size);
    }

    // Age matching
    if (quizData.preferred_age !== 'any') {
        if (quizData.preferred_age === 'puppy_kitten') {
            whereConditions.push('age_years <= 1');
        } else if (quizData.preferred_age === 'young') {
            whereConditions.push('age_years BETWEEN 1 AND 3');
        } else if (quizData.preferred_age === 'adult') {
            whereConditions.push('age_years BETWEEN 3 AND 7');
        } else if (quizData.preferred_age === 'senior') {
            whereConditions.push('age_years > 7');
        }
    }

    // Housing type considerations
    if (quizData.housing_type === 'apartment' && quizData.yard_size === 'none') {
        // Recommend smaller, calmer animals
        whereConditions.push('(size IN ("small", "medium") OR species = "cat")');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const animals = await executeQuery(`
        SELECT a.*, 
               (SELECT image_url FROM animal_images WHERE animal_id = a.id AND is_primary = 1 LIMIT 1) as primary_image
        FROM animals a
        ${whereClause}
        ORDER BY RAND()
        LIMIT 6
    `, queryParams);

    // Calculate match scores
    return animals.map(animal => ({
        ...animal,
        match_score: calculateMatchScore(animal, quizData),
        match_reasons: getMatchReasons(animal, quizData)
    })).sort((a, b) => b.match_score - a.match_score);
}

function calculateMatchScore(animal, quiz) {
    let score = 50; // Base score

    // Size compatibility
    if (quiz.preferred_size === 'any' || animal.size === quiz.preferred_size) {
        score += 20;
    }

    // Housing compatibility
    if (quiz.housing_type === 'house' && quiz.yard_size !== 'none') {
        if (animal.species === 'dog' && animal.size === 'large') score += 15;
    }

    if (quiz.housing_type === 'apartment') {
        if (animal.species === 'cat' || animal.size === 'small') score += 15;
    }

    // Activity level matching
    if (quiz.activity_level === 'high' && animal.species === 'dog') score += 10;
    if (quiz.activity_level === 'low' && animal.species === 'cat') score += 10;

    return Math.min(100, score);
}

function getMatchReasons(animal, quiz) {
    const reasons = [];
    
    if (quiz.preferred_size === animal.size) {
        reasons.push(`Perfect size match - you wanted ${quiz.preferred_size} pets`);
    }
    
    if (quiz.housing_type === 'apartment' && animal.species === 'cat') {
        reasons.push('Great for apartment living');
    }
    
    if (quiz.activity_level === 'high' && animal.species === 'dog') {
        reasons.push('Perfect for your active lifestyle');
    }

    return reasons;
}

module.exports = router;