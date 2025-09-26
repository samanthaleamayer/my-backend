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
  limits: { fileSize: 5 * 1024 * 1024 },
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
app.use('/uploads', express.static('uploads'));

// =================================
// AUTHENTICATION ENDPOINTS
// =================================

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { providerId, currentPassword, newPassword } = req.body;
    
    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('user_id')
      .eq('id', providerId)
      .single();
    
    if (providerError) throw providerError;
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', provider.user_id)
      .single();
    
    if (userError) throw userError;
    
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }
    
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newPasswordHash })
      .eq('id', provider.user_id);
    
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
  res.json({ 
    status: 'Backend running with updated database schema!', 
    timestamp: new Date().toISOString(),
    version: 'v2.0-clean-syntax'
  });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const { data: users } = await supabase.from('users').select('count');
    const { data: providers } = await supabase.from('providers').select('count');
    const { data: services } = await supabase.from('services').select('count');
    
    res.json({ 
      success: true, 
      message: 'All database tables connected successfully',
      tables: {
        users: 'connected',
        providers: 'connected', 
        services: 'connected'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// PROVIDER REGISTRATION
// =================================

app.post('/api/providers/register', async (req, res) => {
  try {
    console.log('=== PROVIDER REGISTRATION STARTED ===');
    
    const {
      fullName, email, phone, dateOfBirth, profilePhoto, bio,
      businessName, businessType, businessCountry, businessState,
      businessCity, businessAddress, businessSuburb, businessZip,
      yearsInBusiness, serviceRadius, regNumber, taxId, website,
      insurance, services, bankCountry, agreeToStripeTerms
    } = req.body;

    if (!fullName || !email || !phone || !businessName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fullName, email, phone, businessName'
      });
    }

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

    const userData = {
      email,
      full_name: fullName,
      phone,
      date_of_birth: dateOfBirth,
      profile_photo_url: profilePhoto,
      bio: bio || '',
      role: 'provider'
    };

    console.log('Creating user:', userData);

    const { data: createdUser, error: userError } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (userError) {
      console.error('User creation error:', userError);
      throw userError;
    }

    console.log('User created with ID:', createdUser.id);

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

        const accountLink = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: 'https://zesty-entremet-6f685b.netlify.app/provider-dashboard.html',
          return_url: 'https://zesty-entremet-6f685b.netlify.app/provider-dashboard.html',
          type: 'account_onboarding'
        });
        stripeOnboardingUrl = accountLink.url;
        console.log('Stripe account created:', stripeAccountId);
      } catch (stripeError) {
        console.error('Stripe error (non-fatal):', stripeError);
      }
    }

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
      service_radius: serviceRadius ? parseInt(serviceRadius) : null,
      years_in_business: yearsInBusiness ? parseInt(yearsInBusiness) : null,
      reg_number: regNumber,
      tax_id: taxId,
      website: website,
      insurance: insurance ? JSON.stringify(insurance) : null,
      bio: bio || '',
      stripe_account_id: stripeAccountId
    };

    console.log('Creating provider:', providerData);

    const { data: createdProvider, error: providerError } = await supabase
      .from('providers')
      .insert([providerData])
      .select()
      .single();

    if (providerError) {
      console.error('Provider creation error:', providerError);
      await supabase.from('users').delete().eq('id', createdUser.id);
      throw providerError;
    }

    console.log('Provider created with ID:', createdProvider.id);

    let servicesInserted = 0;
    if (services && Array.isArray(services) && services.length > 0) {
      console.log(`Processing ${services.length} services...`);
      
      const servicesData = services.map((service) => {
        return {
          provider_id: createdProvider.id,
          name: service.name,
          category: service.category,
          subcategory: service.subCategory || service.subcategory,
          duration: parseInt(service.duration) || 60,
          duration_minutes: parseInt(service.duration) || 60,
          price: parseFloat(service.price) || 0,
          description: service.description || '',
          is_active: true
        };
      });

      const { data: insertedServices, error: servicesError } = await supabase
        .from('services')
        .insert(servicesData)
        .select();

      if (servicesError) {
        console.error('Services insertion error:', servicesError);
      } else {
        servicesInserted = insertedServices.length;
        console.log(`Services created: ${servicesInserted}`);
      }
    }

    console.log('=== REGISTRATION COMPLETED SUCCESSFULLY ===');

    res.json({
      success: true,
      message: 'Provider registration completed successfully',
      data: {
        user: createdUser,
        provider: createdProvider,
        servicesCreated: servicesInserted,
        stripeOnboardingUrl,
        dashboardUrl: `https://zesty-entremet-6f685b.netlify.app/provider-dashboard.html?providerId=${createdProvider.id}&email=${email}`
      }
    });

  } catch (error) {
    console.error('=== REGISTRATION ERROR ===');
    console.error('Error details:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed: ' + error.message
    });
  }
});

// =================================
// PROVIDER PROFILE ENDPOINTS
// =================================

app.get('/api/providers/:id/complete', async (req, res) => {
  try {
    console.log('Fetching complete provider data for ID:', req.params.id);

    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (providerError) throw providerError;
    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', provider.user_id)
      .single();

    if (userError) {
      console.error('User fetch error:', userError);
    }

    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('*')
      .eq('provider_id', req.params.id)
      .eq('is_active', true);

    if (servicesError) {
      console.error('Services fetch error:', servicesError);
    }

    const combinedData = {
      ...provider,
      users: user || null,
      services: services || []
    };

    console.log(`Provider data fetched - ${combinedData.services.length} services found`);

    res.json({ success: true, data: combinedData });
    
  } catch (error) {
    console.error('Error fetching provider data:', error);
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
    
    const serviceData = {
      provider_id: providerId,
      name: name,
      category: category,
      duration: duration_minutes,
      duration_minutes: duration_minutes,
      price: price,
      description: description,
      is_active: true
    };
    
    const { data, error } = await supabase
      .from('services')
      .insert(serviceData)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Add service error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/providers/services/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { name, category, duration_minutes, price, description } = req.body;
    
    const updateData = {
      name: name,
      category: category,
      duration: duration_minutes,
      duration_minutes: duration_minutes,
      price: price,
      description: description,
      updated_at: new Date()
    };
    
    const { data, error } = await supabase
      .from('services')
      .update(updateData)
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
      .update({ is_active: false })
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
    console.log('Image upload request received');
    
    const { providerId, imageType, setAsProfile } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }
    
    if (!providerId) {
      return res.status(400).json({ success: false, error: 'Provider ID is required' });
    }
    
    const imageUrl = `/uploads/providers/${file.filename}`;
    
    if (setAsProfile === 'true') {
      const { data: provider } = await supabase
        .from('providers')
        .select('user_id')
        .eq('id', providerId)
        .single();
      
      if (provider) {
        await supabase
          .from('users')
          .update({ profile_photo_url: imageUrl })
          .eq('id', provider.user_id);
      }
    }
    
    let photoId = null;
    try {
      const { data, error } = await supabase
        .from('provider_photos')
        .insert({
          provider_id: providerId,
          filename: file.filename,
          file_size: file.size,
          content_type: file.mimetype
        })
        .select()
        .single();
      
      if (!error && data) {
        photoId = data.id;
      }
    } catch (dbError) {
      console.log('Provider photos table update failed:', dbError.message);
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
    
    res.json({
      success: true,
      data: {
        businessHours: businessHours || [],
        bookings: bookings || [],
        blockedSlots: blockedSlots || [],
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
// BOOKING ENDPOINTS
// =================================

app.post('/api/bookings', async (req, res) => {
  try {
    const {
      providerId, serviceId, customerName, customerEmail, customerPhone,
      bookingDate, bookingTime, serviceDuration, servicePrice, notes
    } = req.body;
    
    const platformFee = servicePrice * 0.1;
    const totalAmount = servicePrice + platformFee;
    const confirmationNumber = generateConfirmationNumber();
    
    const bookingData = {
      provider_id: providerId,
      service_id: serviceId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      booking_date: bookingDate,
      booking_time: bookingTime,
      service_duration: serviceDuration,
      service_price: servicePrice,
      platform_fee: platformFee,
      total_amount: totalAmount,
      confirmation_number: confirmationNumber,
      status: 'pending'
    };
    
    const { data, error } = await supabase
      .from('bookings')
      .insert(bookingData)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/providers/:providerId/bookings', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { status, startDate, endDate } = req.query;
    
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('provider_id', providerId);
    
    if (status) query = query.eq('status', status);
    if (startDate) query = query.gte('booking_date', startDate);
    if (endDate) query = query.lte('booking_date', endDate);
    
    const { data, error } = await query.order('booking_date', { ascending: true });
    
    if (error) throw error;
    
    res.json({ success: true, data: data || [] });
    
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/bookings/:bookingId/status', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status, providerNotes } = req.body;
    
    const updateData = {
      status: status,
      updated_at: new Date()
    };
    
    if (providerNotes) {
      updateData.provider_notes = providerNotes;
    }
    
    const { data, error } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// NOTIFICATIONS ENDPOINT
// =================================

app.get('/api/providers/:providerId/notifications', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const { data: provider } = await supabase
      .from('providers')
      .select('user_id')
      .eq('id', providerId)
      .single();
    
    if (!provider) {
      return res.json({ success: true, data: [] });
    }
    
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', provider.user_id)
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
// UTILITY FUNCTIONS
// =================================

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
// START SERVER
// =================================

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🗄️ Database test: http://localhost:${PORT}/api/test-db`);
  console.log(`✅ CLEAN SYNTAX VERSION - No more parsing errors!`);
  console.log(`✅ FIXED: Registration system using new database schema!`);
  console.log(`✅ NEW: Complete booking and calendar system!`);
});

module.exports = app;
