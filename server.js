Server.js


const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://yllawvwoeuvwlvuiqyug.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsbGF3dndvZXV2d2x2dWlxeXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTcxMTgsImV4cCI6MjA3MjY3MzExOH0.lJ5HLC-NcyLCEMGkkvvh-RUmL302a9kkJwpcxLff-Ns';
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/providers/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${req.body.providerId || 'unknown'}_${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  }
});

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://127.0.0.1:3000',
    'https://zesty-entremet-6f685b.netlify.app',
    'https://my-backend-kwgq.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// =================================
// AUTHENTICATION ENDPOINTS
// =================================

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { providerId, currentPassword, newPassword } = req.body;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', providerId)
      .single();
    
    if (error) throw error;
    
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }
    
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newPasswordHash })
      .eq('id', providerId);
    
    if (updateError) throw updateError;
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, role')
      .eq('email', email)
      .eq('role', 'provider')
      .single();

    if (userError || !user) {
      return res.status(404).json({ 
        success: false, 
        error: 'No provider account found with that email address' 
      });
    }

    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (providerError || !provider) {
      return res.status(404).json({ 
        success: false, 
        error: 'Provider profile not found' 
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        provider,
        dashboardUrl: `https://zesty-entremet-6f685b.netlify.app/provider-dashboard.html?providerId=${provider.id}&email=${email}`
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed: ' + error.message });
  }
});

// =================================
// UTILITY ENDPOINTS
// =================================

app.get('/health', (req, res) => {
  res.json({ status: 'Backend is running with your actual database schema!', timestamp: new Date().toISOString() });
});

app.get('/debug/check', (req, res) => {
  res.json({ 
    message: 'Server fixed for your actual database schema',
    timestamp: new Date().toISOString(),
    version: 'fixed-for-actual-schema-v1.0'
  });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('count');
    if (error) throw error;
    res.json({ success: true, message: 'Database connected successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// PROVIDER REGISTRATION
// =================================

app.post('/api/providers/register', async (req, res) => {
  try {
    console.log('=== PROVIDER REGISTRATION DEBUG ===');
    console.log('Full request body:', JSON.stringify(req.body, null, 2));
    console.log('Services in request:', req.body.services);
    console.log('Services array length:', req.body.services?.length || 0);
    console.log('Services type:', typeof req.body.services);
    
    const {
      fullName, email, phone, dateOfBirth, profilePhoto, bio,
      businessName, businessType, businessCountry, businessState,
      businessCity, businessAddress, businessSuburb, businessZip,
      yearsInBusiness, serviceRadius, regNumber, taxId, website,
      insurance, services, bankCountry, agreeToStripeTerms
    } = req.body;

    console.log('Extracted services:', services);
    console.log('Services is array?', Array.isArray(services));
    if (Array.isArray(services)) {
      console.log('Individual services:');
      services.forEach((service, index) => {
        console.log(`Service ${index}:`, service);
      });
    }
    
    // Validate required fields
    if (!fullName || !email || !phone || !businessName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fullName, email, phone, businessName'
      });
    }

    // Check if email already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser && !checkError) {
      return res.status(400).json({
        success: false,
        error: 'An account with this email address already exists'
      });
    }

    // Create user record
    const userData = {
      email,
      full_name: fullName,
      phone,
      date_of_birth: dateOfBirth,
      profile_photo_url: profilePhoto,
      bio: bio || '',
      role: 'provider',
      created_at: new Date().toISOString()
    };

    console.log('Creating user with data:', userData);

    const { data: createdUser, error: userError } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create user account: ' + userError.message
      });
    }

    console.log('User created successfully:', createdUser);

    // Create Stripe account if requested
    let stripeAccountId = null;
    let stripeOnboardingUrl = null;

    if (agreeToStripeTerms && bankCountry) {
      try {
        console.log('Creating Stripe account...');
        const account = await stripe.accounts.create({
          type: 'express',
          country: bankCountry,
          email: email,
          business_profile: {
            name: businessName,
            product_description: 'Professional services'
          }
        });
        stripeAccountId = account.id;
        console.log('Stripe account created:', stripeAccountId);

        const accountLink = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: 'https://zesty-entremet-6f685b.netlify.app/provider-dashboard.html',
          return_url: 'https://zesty-entremet-6f685b.netlify.app/provider-dashboard.html',
          type: 'account_onboarding',
        });
        stripeOnboardingUrl = accountLink.url;
        console.log('Stripe onboarding URL created');
      } catch (stripeError) {
        console.error('Stripe account creation error:', stripeError);
      }
    }

    // Create provider profile
    const providerData = {
      user_id: createdUser.id,
      business_name: businessName,
      business_type: businessType,
      business_address: businessAddress,
      city: businessCity,
      state: businessState,
      country: businessCountry,
      zip_code: businessZip,
      business_suburb: businessSuburb,
      service_radius: serviceRadius,
      years_in_business: yearsInBusiness,
      reg_number: regNumber,
      tax_id: taxId,
      website: website,
      insurance: insurance,
      bio: bio || '',
      stripe_account_id: stripeAccountId,
      created_at: new Date().toISOString()
    };

    console.log('Creating provider with data:', providerData);

    const { data: createdProvider, error: providerError } = await supabase
      .from('providers')
      .insert([providerData])
      .select()
      .single();

    if (providerError) {
      console.error('Error creating provider:', providerError);
      await supabase.from('users').delete().eq('id', createdUser.id);
      return res.status(500).json({
        success: false,
        error: 'Failed to create provider profile: ' + providerError.message
      });
    }

    console.log('Provider created successfully:', createdProvider);

    // Add services
    console.log('=== SERVICES PROCESSING ===');
    console.log('Services to process:', services);
    console.log('Provider ID for services:', createdProvider.id);

    if (services && Array.isArray(services) && services.length > 0) {
      console.log(`Processing ${services.length} services...`);
      
      const servicesData = services.map((service, index) => {
        console.log(`Processing service ${index}:`, service);
        
        const serviceData = {
          provider_id: createdProvider.id,
          name: service.name,
          category: service.category,
          subcategory: service.subCategory || service.subcategory,
          duration_minutes: service.duration,
          duration: service.duration,
          price: service.price,
          description: service.description || '',
          is_active: true,
          created_at: new Date().toISOString()
        };
        
        console.log(`Service data ${index}:`, serviceData);
        return serviceData;
      });

      console.log('All services data prepared:', servicesData);

      const { data: insertedServices, error: servicesError } = await supabase
        .from('services')
        .insert(servicesData)
        .select();

      if (servicesError) {
        console.error('Error inserting services:', servicesError);
        console.error('Services data that failed:', servicesData);
      } else {
        console.log('Services inserted successfully:', insertedServices);
        console.log(`${insertedServices.length} services inserted`);
      }
    } else {
      console.log('No services to insert - services array is empty or not an array');
      console.log('Services value:', services);
      console.log('Services type:', typeof services);
      console.log('Is array?', Array.isArray(services));
    }

    console.log('=== REGISTRATION COMPLETED SUCCESSFULLY ===');

    res.json({
      success: true,
      message: 'Provider registration completed successfully',
      data: {
        user: createdUser,
        provider: createdProvider,
        stripeOnboardingUrl,
        dashboardUrl: `https://zesty-entremet-6f685b.netlify.app/provider-dashboard.html?providerId=${createdProvider.id}&email=${email}`
      }
    });

  } catch (error) {
    console.error('=== REGISTRATION ERROR ===');
    console.error('Error details:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

// =================================
// PROVIDER PROFILE ENDPOINTS
// =================================

app.get('/api/providers/:id/complete', async (req, res) => {
  try {
    console.log('=== FETCHING COMPLETE PROVIDER DATA ===');
    console.log('Provider ID:', req.params.id);

    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (providerError) {
      console.error('Provider fetch error:', providerError);
      throw providerError;
    }
    if (!provider) {
      console.log('No provider found with ID:', req.params.id);
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    console.log('Provider data retrieved:', provider);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', provider.user_id)
      .single();

    if (userError) {
      console.error('User fetch error:', userError);
    } else {
      console.log('User data retrieved');
    }

    console.log('Fetching services for provider_id:', req.params.id);
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('*')
      .eq('provider_id', req.params.id);

    console.log('Services query result:', { services, servicesError });
    console.log('Number of services found:', services?.length || 0);

    if (servicesError) {
      console.error('Services fetch error:', servicesError);
    }

    const combinedData = {
      ...provider,
      users: user,
      services: services || [],
    };

    console.log('Combined data services count:', combinedData.services.length);

    res.json({ success: true, data: combinedData });
    
  } catch (error) {
    console.error('Error fetching complete provider data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// SERVICES ENDPOINTS
// =================================

app.get('/api/providers/:providerId/services', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, data: data || [] });
    
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/providers/services', async (req, res) => {
  try {
    const { providerId, name, category, duration_minutes, price, description } = req.body;
    
    const { data, error } = await supabase
      .from('services')
      .insert({
        provider_id: providerId,
        name: name,
        category: category,
        duration_minutes: duration_minutes,
        price: price,
        description: description
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Add service error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/providers/services/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/providers/services/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { name, category, duration_minutes, price, description } = req.body;
    
    const { data, error } = await supabase
      .from('services')
      .update({
        name: name,
        category: category,
        duration_minutes: duration_minutes,
        price: price,
        description: description,
        updated_at: new Date()
      })
      .eq('id', serviceId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/providers/services/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', serviceId);
    
    if (error) throw error;
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// PHOTO UPLOAD ENDPOINTS
// =================================

app.post('/api/providers/upload-image', upload.single('image'), async (req, res) => {
  try {
    console.log('File upload request received');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    
    const { providerId, imageType, setAsProfile } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }
    
    if (!providerId) {
      return res.status(400).json({ success: false, error: 'Provider ID is required' });
    }
    
    const imageUrl = `/uploads/providers/${file.filename}`;
    
    let photoId = null;
    try {
      const { data, error } = await supabase
        .from('provider_photos')
        .insert({
          provider_id: providerId,
          image_url: imageUrl,
          image_type: imageType || 'other',
          is_profile: setAsProfile === 'true',
          file_name: file.filename,
          file_size: file.size,
          mime_type: file.mimetype
        })
        .select()
        .single();
      
      if (!error && data) {
        photoId = data.id;
        
        if (setAsProfile === 'true') {
          await supabase
            .from('provider_photos')
            .update({ is_profile: false })
            .eq('provider_id', providerId)
            .neq('id', data.id);
          
          await supabase
            .from('users')
            .update({ profile_photo_url: imageUrl })
            .eq('id', providerId);
        }
      }
    } catch (dbError) {
      console.log('Database storage failed:', dbError.message);
    }
    
    res.json({ 
      success: true, 
      imageUrl: imageUrl,
      photoId: photoId,
      message: 'Image uploaded successfully'
    });
    
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/providers/:providerId/photos', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const { data, error } = await supabase
      .from('provider_photos')
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });
    
    if (error && error.code !== '42P01') {
      throw error;
    }
    
    res.json({ success: true, data: data || [] });
    
  } catch (error) {
    console.error('Get photos error:', error);
    res.json({ success: true, data: [] });
  }
});

app.post('/api/providers/:providerId/set-profile-picture', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { photoId, imageUrl } = req.body;
    
    const { data, error } = await supabase
      .from('users')
      .update({ profile_photo_url: imageUrl })
      .eq('id', providerId)
      .select()
      .single();
    
    if (error) throw error;
    
    try {
      if (photoId) {
        await supabase
          .from('provider_photos')
          .update({ is_profile: false })
          .eq('provider_id', providerId);
        
        await supabase
          .from('provider_photos')
          .update({ is_profile: true })
          .eq('id', photoId);
      }
    } catch (dbError) {
      console.log('Photo table update failed:', dbError.message);
    }
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Set profile picture error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// NOTIFICATIONS ENDPOINT
// =================================

app.get('/api/providers/:providerId/notifications', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    
    res.json({ success: true, data: data || [] });
    
  } catch (error) {
    console.error('Notifications error:', error);
    res.json({ success: true, data: [] });
  }
});

// =================================
// CALENDAR ENDPOINTS
// =================================

app.get('/api/providers/:id/calendar', async (req, res) => {
  try {
    const { month, year } = req.query;
    const providerId = req.params.id;
    
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    
    const { data: businessHours, error: hoursError } = await supabase
      .from('business_hours')
      .select('*')
      .eq('provider_id', providerId)
      .order('day_of_week');
    
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('provider_id', providerId)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .order('booking_date')
      .order('booking_time');
    
    const { data: blockedSlots, error: slotsError } = await supabase
      .from('calendar_slots')
      .select('*')
      .eq('provider_id', providerId)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('status', ['blocked', 'break']);
    
    if (hoursError || bookingsError || slotsError) {
      throw hoursError || bookingsError || slotsError;
    }
    
    const transformedSlots = (blockedSlots || []).map(slot => ({
      id: slot.id,
      date: slot.date,
      start_time: `${slot.start_hour.toString().padStart(2, '0')}:${slot.start_minute.toString().padStart(2, '0')}`,
      end_time: `${slot.end_hour.toString().padStart(2, '0')}:${slot.end_minute.toString().padStart(2, '0')}`,
      title: slot.title || 'Blocked',
      slot_type: slot.status
    }));

    const transformedBookings = (bookings || []).map(booking => ({
      ...booking,
      start_time: booking.start_time || booking.booking_time,
      end_time: booking.end_time || addMinutesToTime(booking.booking_time, booking.service_duration || 60),
      users: {
        full_name: booking.customer_name,
        email: booking.customer_email,
        phone: booking.customer_phone
      },
      services: {
        name: 'Service',
        duration: booking.service_duration,
        price: booking.service_price
      }
    }));
    
    res.json({
      success: true,
      data: {
        businessHours: businessHours || [],
        bookings: transformedBookings,
        blockedSlots: transformedSlots,
        month: parseInt(month),
        year: parseInt(year)
      }
    });
    
  } catch (error) {
    console.error('Calendar fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/providers/:providerId/stats', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { period = '30' } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));
    const startDateStr = startDate.toISOString().split('T')[0];
    
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('status, total_amount, booking_date')
      .eq('provider_id', providerId)
      .gte('booking_date', startDateStr);
    
    if (bookingsError) throw bookingsError;
    
    const stats = {
      totalBookings: bookings.length,
      confirmedBookings: bookings.filter(b => b.status === 'confirmed').length,
      pendingBookings: bookings.filter(b => b.status === 'pending').length,
      cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
      completedBookings: bookings.filter(b => b.status === 'completed').length,
      totalRevenue: bookings
        .filter(b => b.status === 'completed')
        .reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0)
    };
    
    res.json({ success: true, data: stats });
    
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// UTILITY FUNCTIONS
// =================================

function addMinutesToTime(timeStr, minutes) {
  if (!timeStr || !minutes) return timeStr;
  
  try {
    const [hours, mins] = timeStr.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + parseInt(minutes);
    const newHours = Math.floor(totalMinutes / 60);
    const newMins = totalMinutes % 60;
    return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
  } catch (error) {
    return timeStr;
  }
}

function generateConfirmationNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `BK${year}${month}${day}${random}`;
}

// =================================
// ERROR HANDLING
// =================================

app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// =================================
// START SERVER (ONLY ONE app.listen!)
// =================================

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🗄️ Database test: http://localhost:${PORT}/api/test-db`);
  console.log(`📅 Calendar system fixed for your actual database schema!`);
  console.log(`🐛 Debug logging enabled for registration and services`);
});

module.exports = app;
