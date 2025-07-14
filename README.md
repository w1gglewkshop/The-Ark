# The Ark: A Digital Sanctuary for Forgotten Creatures

A comprehensive full-stack web application for animal adoption and sanctuary management, built with React.js, Node.js, Express.js, and MySQL.

![The Ark Banner](https://via.placeholder.com/1200x400/0ea5e9/ffffff?text=The+Ark%3A+Digital+Sanctuary)

## 🐾 Project Overview

The Ark is a modern, responsive web application designed to help animal shelters and sanctuaries manage their operations while providing an intuitive platform for potential adopters, volunteers, and donors. The platform features a beautiful, user-friendly interface inspired by leading animal welfare organizations.

## ✨ 14 Core Features

### 🏠 **1. Adoptable Animals Directory**
- Searchable and filterable pet listings with high-quality images
- Advanced search by species, age, size, location, and special needs
- Detailed animal profiles with personality descriptions and medical history
- Mobile-responsive card layouts with image galleries

### 📝 **2. Online Adoption Application**
- Comprehensive digital adoption forms with validation
- Application status tracking and email notifications
- Admin review and approval workflow
- Document upload capabilities

### 🤝 **3. Volunteer & Foster Sign-Up Portal**
- Separate volunteer and foster application processes
- Skills and interest matching system
- Background check integration
- Volunteer scheduling and task management

### 💝 **4. Donation & Sponsorship System**
- Multiple donation types (general, animal-specific, medical fund)
- Recurring donation subscriptions
- Sponsorship programs for individual animals
- Donor recognition and thank-you system
- Real-time donation tracking and leaderboards

### 🔍 **5. Lost & Found Pets Board**
- Community-driven lost and found pet postings
- Location-based searching with map integration
- Photo upload and detailed descriptions
- Contact facilitation between finders and owners
- Success story tracking for reunited pets

### 📚 **6. Blog & Educational Content**
- Admin-managed blog system with rich text editor
- Educational articles about pet care, training, and health
- Success story publication
- SEO-optimized content with social sharing

### 📅 **7. Event Calendar**
- Interactive calendar with adoption events and fundraisers
- Event registration and capacity management
- Email reminders and notifications
- Integration with external calendar applications

### 🛠️ **8. Admin Dashboard**
- Comprehensive analytics and reporting
- User management with role-based permissions
- Content moderation tools
- Financial tracking and donation analytics
- System health monitoring

### 🎉 **9. Success Stories Section**
- User-submitted adoption success stories
- Admin curation and featured story highlights
- Photo galleries and video testimonials
- Social sharing capabilities

### 💬 **10. Live Chat Support**
- Real-time chat using Socket.io
- Support ticket system
- Automated responses and FAQ integration
- Chat history and conversation archiving

### 👤 **11. User Profile Management**
- Personal dashboard with application history
- Donation tracking and tax receipts
- Profile customization and preferences
- Communication preferences management

### 🏥 **12. Animal Health Tracker**
- Veterinary visit scheduling and tracking
- Vaccination records and medical history
- Health status updates and alerts
- Integration with veterinary clinics

### 🎯 **13. Pet Recommendation Engine**
- Interactive quiz-based matching system
- Compatibility scoring algorithm
- Lifestyle and preference analysis
- Personalized pet recommendations

### 🗺️ **14. Interactive Map View**
- Google Maps integration for animal locations
- Location-based search and filtering
- Lost/found pet mapping
- Shelter and event location display

## 🚀 Technology Stack

### Frontend
- **React 18** with TypeScript for type safety
- **Tailwind CSS** for modern, responsive styling
- **React Router** for client-side routing
- **React Hook Form** with Yup validation
- **Socket.io Client** for real-time features
- **Leaflet** for interactive maps
- **Lucide React** for beautiful icons

### Backend
- **Node.js** with Express.js framework
- **MySQL** database with connection pooling
- **JWT** authentication with bcrypt password hashing
- **Socket.io** for real-time chat functionality
- **Multer** for file upload handling
- **Express Validator** for input validation
- **Helmet** and security middleware

### Database Design
- **Relational MySQL schema** with 20+ tables
- **Foreign key constraints** and data integrity
- **Optimized indexes** for performance
- **Comprehensive audit trails**

## 📋 Prerequisites

- Node.js (v16 or higher)
- MySQL (v8.0 or higher)
- npm or yarn package manager

## 🛠️ Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd the-ark-sanctuary
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Install backend dependencies
npm run backend:install

# Install frontend dependencies
npm run frontend:install
```

### 3. Database Setup
```bash
# Create MySQL database
mysql -u root -p
CREATE DATABASE the_ark_sanctuary;

# Import schema
mysql -u root -p the_ark_sanctuary < database/schema.sql
```

### 4. Environment Configuration
```bash
# Copy environment template
cp backend/.env.example backend/.env

# Configure your environment variables
nano backend/.env
```

**Required Environment Variables:**
```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=the_ark_sanctuary

# JWT
JWT_SECRET=your_super_secret_jwt_key

# Server
PORT=5000
FRONTEND_URL=http://localhost:3000

# Optional: Third-party services
GOOGLE_MAPS_API_KEY=your_google_maps_key
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
EMAIL_HOST=smtp.gmail.com
EMAIL_USER=your_email@gmail.com
```

### 5. Start Development Servers
```bash
# Start both frontend and backend simultaneously
npm run dev

# Or start them separately:
npm run backend:dev  # Backend on port 5000
npm run frontend:dev # Frontend on port 3000
```

## 📱 Usage

### Default Admin Account
- **Email:** admin@thearksanctuary.com
- **Password:** admin123

### User Roles
- **Admin:** Full system access and management
- **Volunteer:** Animal and event management
- **User:** Adoption applications and donations

### Key Workflows

1. **Animal Adoption Process:**
   - Browse animals → Apply → Admin review → Approval → Adoption

2. **Volunteer Management:**
   - Apply → Background check → Approval → Task assignment

3. **Donation Process:**
   - Select donation type → Payment → Confirmation → Thank you

4. **Lost Pet Recovery:**
   - Post lost/found → Community search → Contact → Reunion

## 🏗️ Project Structure

```
the-ark-sanctuary/
├── backend/                 # Node.js/Express API
│   ├── config/             # Database and app configuration
│   ├── middleware/         # Authentication and validation
│   ├── routes/             # API route handlers
│   ├── uploads/            # File upload storage
│   └── server.js           # Main server file
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API service layer
│   │   ├── context/        # React context providers
│   │   └── utils/          # Utility functions
│   └── public/             # Static assets
├── database/               # Database schema and seeds
└── README.md              # Project documentation
```

## 🔐 Security Features

- **JWT Authentication** with secure HTTP-only cookies
- **Password Hashing** using bcrypt with salt rounds
- **Rate Limiting** to prevent abuse
- **Input Validation** on all endpoints
- **CORS Configuration** for secure cross-origin requests
- **Helmet.js** for security headers
- **Role-based Access Control** (RBAC)

## 🎨 UI/UX Features

- **Fully Responsive Design** optimized for all devices
- **Modern Gradient Design** with smooth animations
- **Accessibility Compliant** with ARIA labels and keyboard navigation
- **Dark/Light Mode Support** with system preference detection
- **Progressive Web App** capabilities
- **Offline Support** for key features

## 📊 Performance Optimizations

- **Database Connection Pooling** for efficient queries
- **Image Optimization** with lazy loading
- **Code Splitting** for faster initial loads
- **Caching Strategies** for API responses
- **CDN Integration** for static assets

## 🧪 Testing

```bash
# Run backend tests
cd backend && npm test

# Run frontend tests
cd frontend && npm test

# Run end-to-end tests
npm run test:e2e
```

## 📦 Deployment

### Production Build
```bash
# Build frontend for production
npm run build

# Start production server
npm start
```

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d
```

### Environment-specific Configurations
- **Development:** Hot reloading, detailed error messages
- **Staging:** Production-like environment for testing
- **Production:** Optimized builds, security hardening

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 🙏 Acknowledgments

- Inspired by [Animal Aid USA](https://animalaidusa.org/)
- Built with love for animal welfare organizations worldwide
- Special thanks to the open-source community

## 📞 Support

For support, please email support@thearksanctuary.com or join our Discord community.

---

**Made with ❤️ for animals in need**

![Footer](https://via.placeholder.com/1200x100/22c55e/ffffff?text=Helping+Animals+Find+Their+Forever+Homes)