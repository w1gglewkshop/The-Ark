const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'the_ark_sanctuary',
    port: process.env.DB_PORT || 3306,
    charset: 'utf8mb4',
    timezone: '+00:00',
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
};

// Create connection pool for better performance
const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000
});

// Test database connection
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL database successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
};

// Execute queries with error handling
const executeQuery = async (query, params = []) => {
    try {
        const [results] = await pool.execute(query, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

// Get a single result
const getOne = async (query, params = []) => {
    try {
        const [results] = await pool.execute(query, params);
        return results[0] || null;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

// Begin transaction
const beginTransaction = async () => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    return connection;
};

// Commit transaction
const commitTransaction = async (connection) => {
    await connection.commit();
    connection.release();
};

// Rollback transaction
const rollbackTransaction = async (connection) => {
    await connection.rollback();
    connection.release();
};

module.exports = {
    pool,
    testConnection,
    executeQuery,
    getOne,
    beginTransaction,
    commitTransaction,
    rollbackTransaction
};