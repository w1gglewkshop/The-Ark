-- The Ark: Digital Sanctuary Database Schema
-- MySQL Database Schema for Animal Adoption Platform

CREATE DATABASE IF NOT EXISTS the_ark_sanctuary;
USE the_ark_sanctuary;

-- Users table with role-based access
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(10),
    role ENUM('user', 'admin', 'volunteer') DEFAULT 'user',
    profile_image VARCHAR(255),
    date_joined TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP NULL
);

-- Animals table for adoptable pets
CREATE TABLE animals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    species ENUM('dog', 'cat', 'rabbit', 'bird', 'other') NOT NULL,
    breed VARCHAR(100),
    age_years INT,
    age_months INT,
    gender ENUM('male', 'female') NOT NULL,
    size ENUM('small', 'medium', 'large', 'extra_large') NOT NULL,
    color VARCHAR(100),
    description TEXT,
    personality TEXT,
    special_needs TEXT,
    adoption_fee DECIMAL(8,2) DEFAULT 0.00,
    is_available BOOLEAN DEFAULT TRUE,
    location VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Animal images table
CREATE TABLE animal_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    animal_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    caption VARCHAR(255),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE
);

-- Health records for animals
CREATE TABLE animal_health (
    id INT PRIMARY KEY AUTO_INCREMENT,
    animal_id INT NOT NULL,
    vet_visit_date DATE,
    vaccination_date DATE,
    vaccination_type VARCHAR(100),
    health_status ENUM('excellent', 'good', 'fair', 'poor', 'critical') DEFAULT 'good',
    weight DECIMAL(5,2),
    notes TEXT,
    next_checkup DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE
);

-- Adoption applications
CREATE TABLE adoption_applications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    animal_id INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected', 'completed') DEFAULT 'pending',
    housing_type ENUM('house', 'apartment', 'condo', 'other') NOT NULL,
    has_yard BOOLEAN DEFAULT FALSE,
    has_other_pets BOOLEAN DEFAULT FALSE,
    other_pets_description TEXT,
    experience_with_pets TEXT,
    reason_for_adoption TEXT,
    work_schedule TEXT,
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    veterinarian_name VARCHAR(100),
    veterinarian_phone VARCHAR(20),
    application_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INT NULL,
    reviewed_date TIMESTAMP NULL,
    admin_notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Volunteer applications
CREATE TABLE volunteer_applications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    interests SET('animal_care', 'dog_walking', 'cat_socialization', 'events', 'transport', 'admin', 'fundraising', 'education') NOT NULL,
    availability TEXT,
    experience TEXT,
    skills TEXT,
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    background_check_consent BOOLEAN DEFAULT FALSE,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    application_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INT NULL,
    reviewed_date TIMESTAMP NULL,
    admin_notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Foster applications
CREATE TABLE foster_applications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    housing_type ENUM('house', 'apartment', 'condo', 'other') NOT NULL,
    has_yard BOOLEAN DEFAULT FALSE,
    has_fencing BOOLEAN DEFAULT FALSE,
    has_other_pets BOOLEAN DEFAULT FALSE,
    other_pets_description TEXT,
    foster_experience TEXT,
    preferred_animals SET('dogs', 'cats', 'puppies', 'kittens', 'special_needs', 'seniors') NOT NULL,
    max_foster_duration VARCHAR(50),
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    application_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INT NULL,
    reviewed_date TIMESTAMP NULL,
    admin_notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Donations and sponsorships
CREATE TABLE donations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    donor_name VARCHAR(100),
    donor_email VARCHAR(100),
    amount DECIMAL(10,2) NOT NULL,
    donation_type ENUM('general', 'animal_sponsorship', 'medical_fund', 'food_fund', 'shelter_maintenance') DEFAULT 'general',
    animal_id INT NULL,
    payment_method ENUM('credit_card', 'paypal', 'bank_transfer', 'cash', 'check') NOT NULL,
    transaction_id VARCHAR(255),
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_frequency ENUM('monthly', 'quarterly', 'yearly') NULL,
    message TEXT,
    is_anonymous BOOLEAN DEFAULT FALSE,
    donation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE SET NULL
);

-- Lost and found pets
CREATE TABLE lost_found_pets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    pet_name VARCHAR(100),
    species ENUM('dog', 'cat', 'rabbit', 'bird', 'other') NOT NULL,
    breed VARCHAR(100),
    color VARCHAR(100),
    size ENUM('small', 'medium', 'large', 'extra_large'),
    distinctive_features TEXT,
    last_seen_location VARCHAR(255) NOT NULL,
    last_seen_date DATE NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    contact_phone VARCHAR(20) NOT NULL,
    additional_contact VARCHAR(255),
    status ENUM('lost', 'found', 'reunited') NOT NULL,
    post_type ENUM('lost', 'found') NOT NULL,
    reward_amount DECIMAL(8,2) DEFAULT 0.00,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Lost/found pet images
CREATE TABLE lost_found_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    post_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    caption VARCHAR(255),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES lost_found_pets(id) ON DELETE CASCADE
);

-- Blog posts
CREATE TABLE blog_posts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    content LONGTEXT NOT NULL,
    excerpt TEXT,
    author_id INT NOT NULL,
    featured_image VARCHAR(500),
    category ENUM('care_tips', 'success_stories', 'news', 'educational', 'fundraising', 'volunteer_spotlight') DEFAULT 'news',
    status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
    meta_title VARCHAR(255),
    meta_description TEXT,
    tags TEXT,
    view_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    published_at TIMESTAMP NULL,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Events calendar
CREATE TABLE events (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type ENUM('adoption_drive', 'fundraiser', 'educational', 'volunteer_training', 'community_outreach') NOT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    location VARCHAR(255),
    address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    max_attendees INT,
    registration_required BOOLEAN DEFAULT FALSE,
    contact_email VARCHAR(100),
    contact_phone VARCHAR(20),
    featured_image VARCHAR(500),
    created_by INT NOT NULL,
    status ENUM('active', 'cancelled', 'completed') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Event registrations
CREATE TABLE event_registrations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    attendee_name VARCHAR(100) NOT NULL,
    attendee_email VARCHAR(100) NOT NULL,
    attendee_phone VARCHAR(20),
    number_of_attendees INT DEFAULT 1,
    special_requirements TEXT,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_event (event_id, user_id)
);

-- Success stories
CREATE TABLE success_stories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    animal_id INT NULL,
    adopter_name VARCHAR(100),
    adopter_email VARCHAR(100),
    story_date DATE,
    featured_image VARCHAR(500),
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    submitted_by INT NULL,
    approved_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE SET NULL,
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- User sessions for authentication
CREATE TABLE user_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Chat messages for support
CREATE TABLE chat_messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    room_id VARCHAR(100) NOT NULL,
    user_id INT NULL,
    sender_name VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    message_type ENUM('user', 'admin', 'bot') DEFAULT 'user',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Pet recommendations quiz results
CREATE TABLE quiz_results (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    session_id VARCHAR(100),
    housing_type ENUM('house', 'apartment', 'condo', 'other'),
    yard_size ENUM('none', 'small', 'medium', 'large'),
    activity_level ENUM('low', 'moderate', 'high'),
    experience_level ENUM('beginner', 'intermediate', 'expert'),
    time_availability ENUM('limited', 'moderate', 'high'),
    preferred_size ENUM('small', 'medium', 'large', 'any'),
    preferred_age ENUM('puppy_kitten', 'young', 'adult', 'senior', 'any'),
    other_pets BOOLEAN DEFAULT FALSE,
    children_at_home BOOLEAN DEFAULT FALSE,
    children_ages VARCHAR(50),
    allergies BOOLEAN DEFAULT FALSE,
    grooming_commitment ENUM('low', 'medium', 'high'),
    results JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Notification system
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('adoption_update', 'donation_thanks', 'event_reminder', 'system', 'volunteer_update') NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_id INT NULL,
    related_type VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_animals_species ON animals(species);
CREATE INDEX idx_animals_available ON animals(is_available);
CREATE INDEX idx_animals_location ON animals(latitude, longitude);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_adoptions_status ON adoption_applications(status);
CREATE INDEX idx_donations_date ON donations(donation_date);
CREATE INDEX idx_events_date ON events(start_date);
CREATE INDEX idx_blog_status ON blog_posts(status);
CREATE INDEX idx_lost_found_status ON lost_found_pets(status);

-- Insert default admin user (password: admin123)
INSERT INTO users (username, email, password_hash, first_name, last_name, role, email_verified) 
VALUES ('admin', 'admin@thearksanctuary.com', '$2b$10$rQj7O6McW.8YQu8gVFWdLOhYdZ9YcFQq7w8JQY2xZRJ1JzJ1QLFq6', 'Admin', 'User', 'admin', TRUE);