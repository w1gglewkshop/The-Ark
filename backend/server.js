const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');

// Import database and test connection
const { testConnection } = require('./config/database');

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Socket.io setup for real-time chat
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    }
});

// Middleware
app.use(limiter);
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(morgan('combined'));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'The Ark API is running!',
        timestamp: new Date().toISOString()
    });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/animals', require('./routes/animals'));
app.use('/api/adoptions', require('./routes/adoptions'));
app.use('/api/volunteers', require('./routes/volunteers'));
app.use('/api/foster', require('./routes/foster'));
app.use('/api/donations', require('./routes/donations'));
app.use('/api/lost-found', require('./routes/lostFound'));
app.use('/api/blog', require('./routes/blog'));
app.use('/api/events', require('./routes/events'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/stories', require('./routes/stories'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/users', require('./routes/users'));
app.use('/api/health-tracker', require('./routes/healthTracker'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/maps', require('./routes/maps'));
app.use('/api/upload', require('./routes/upload'));

// Socket.io chat functionality
const chatNamespace = io.of('/chat');
const activeUsers = new Map();
const chatRooms = new Map();

chatNamespace.on('connection', (socket) => {
    console.log('User connected to chat:', socket.id);

    // Join chat room
    socket.on('join_room', (roomId, userData) => {
        socket.join(roomId);
        activeUsers.set(socket.id, { ...userData, roomId });
        
        if (!chatRooms.has(roomId)) {
            chatRooms.set(roomId, new Set());
        }
        chatRooms.get(roomId).add(socket.id);

        // Notify room about new user
        socket.to(roomId).emit('user_joined', {
            message: `${userData.name} joined the chat`,
            timestamp: new Date().toISOString()
        });

        // Send active users count
        chatNamespace.to(roomId).emit('active_users_count', chatRooms.get(roomId).size);
    });

    // Handle chat messages
    socket.on('send_message', async (data) => {
        const user = activeUsers.get(socket.id);
        if (!user) return;

        const messageData = {
            id: Date.now(),
            message: data.message,
            sender: user.name,
            senderRole: user.role || 'user',
            timestamp: new Date().toISOString(),
            roomId: user.roomId
        };

        // Save message to database
        try {
            const { executeQuery } = require('./config/database');
            await executeQuery(
                'INSERT INTO chat_messages (room_id, user_id, sender_name, message, message_type) VALUES (?, ?, ?, ?, ?)',
                [user.roomId, user.id || null, user.name, data.message, user.role || 'user']
            );
        } catch (error) {
            console.error('Error saving chat message:', error);
        }

        // Broadcast message to room
        chatNamespace.to(user.roomId).emit('receive_message', messageData);
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
        const user = activeUsers.get(socket.id);
        if (!user) return;
        
        socket.to(user.roomId).emit('user_typing', {
            name: user.name,
            isTyping: data.isTyping
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const user = activeUsers.get(socket.id);
        if (user) {
            const roomUsers = chatRooms.get(user.roomId);
            if (roomUsers) {
                roomUsers.delete(socket.id);
                if (roomUsers.size === 0) {
                    chatRooms.delete(user.roomId);
                } else {
                    // Update active users count
                    chatNamespace.to(user.roomId).emit('active_users_count', roomUsers.size);
                }
            }
            
            // Notify room about user leaving
            socket.to(user.roomId).emit('user_left', {
                message: `${user.name} left the chat`,
                timestamp: new Date().toISOString()
            });
        }
        
        activeUsers.delete(socket.id);
        console.log('User disconnected from chat:', socket.id);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
            ? 'Something went wrong!' 
            : err.message
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        // Test database connection
        const dbConnected = await testConnection();
        if (!dbConnected) {
            console.error('❌ Failed to connect to database. Exiting...');
            process.exit(1);
        }

        server.listen(PORT, () => {
            console.log(`🚀 The Ark API server is running on port ${PORT}`);
            console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
            console.log(`💬 Socket.io chat server ready`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

startServer();