-- PostgreSQL Schema for SIPENA SABAH

-- Table for System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(50) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to handle updated_at automatically
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for system_settings
DROP TRIGGER IF EXISTS update_system_settings_modtime ON system_settings;
CREATE TRIGGER update_system_settings_modtime
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- Insert initial values for weights and user roles
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('WEIGHT_HEALTH', '0.4', 'Weight for Health index in CVI calculation'),
('WEIGHT_EDUCATION', '0.6', 'Weight for Education index in CVI calculation'),
('USER_ROLES', '["Admin", "Manager", "Guest"]', 'Available user roles in the system')
ON CONFLICT (setting_key) DO NOTHING;

-- Table for Audit Logs (Accountability)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT,
    user_role VARCHAR(20),
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'Guest',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
