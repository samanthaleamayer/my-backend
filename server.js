const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://yllawvwoeuvwlvuiqyug.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsbGF3dndvZXV2d2x2dWlxeXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTcxMTgsImV4cCI6MjA3MjY3MzExOH0.lJ5HLC-NcyLCEMGkkvvh-RUmL302a9kkJwpcxLff-Ns';
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow any Netlify domain
    if (origin.includes('.netlify.app')) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Backend is running!', timestamp: new Date().toISOString() });
});

// Debug endpoint to verify server updates
app.get('/debug/check', (req, res) => {
  res.json({ 
    message: 'Server updated successfully',
    timestamp: new Date().toISOString(),
    version: 'fixed-provider-query-v2'
  });
});

// Test Supabase connection
app.get('/api/test-db', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('count');
    if (error) throw error;
    res.json({ success: true, message: 'Database connected successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Provider Registration Endpoint
app.post('/api/providers/register', async (req, res) => {
  try {
    console.log('Provider registration request:', req.body);
    
    const {
      fullName,
      email,
      phone,
      dateOfBirth,
      bio,
      businessName,
      businessType,
      businessCountry,
      businessState,
      businessCity,
      businessAddress,
      businessSuburb,
      businessZip,
      yearsInBusiness,
      serviceRadius,
      regNumber,
      taxId,
      website,
      insurance,
      services,
      bankCountry,
      agreeToStripeTerms
    } = req.body;

    // Provider Login Endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Provider login request:', req.body);
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Find user by email
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

    // Find provider profile
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

    console.log('Login successful for:', email, 'Provider ID:', provider.id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        provider,
        dashboardUrl: `https://my-backend-kwgq.onrender.com/provider-dashboard.html?providerId=${provider.id}&email=${email}`
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed: ' + error.message
    });
  }
});
    
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
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([{
        email,
        full_name: fullName,
        phone,
        date_of_birth: dateOfBirth,
        role: 'provider',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create user account: ' + userError.message
      });
    }

    // Create Stripe Express account
    let stripeAccountId = null;
    let stripeOnboardingUrl = null;

    if (agreeToStripeTerms && bankCountry) {
      try {
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

        // Create onboarding link
        const accountLink = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: 'https://my-backend-kwgq.onrender.com/provider-dashboard.html',
          return_url: 'https://my-backend-kwgq.onrender.com/provider-dashboard.html',
          type: 'account_onboarding',
        });

        stripeOnboardingUrl = accountLink.url;
      } catch (stripeError) {
        console.error('Stripe account creation error:', stripeError);
        // Continue without Stripe for now
      }
    }

    // Create provider profile
    const { data: providerData, error: providerError } = await supabase
      .from('providers')
      .insert([{
        user_id: userData.id,
        business_name: businessName,
        business_type: businessType,
        business_address: businessAddress,
        city: businessCity,
        state: businessState,
        country: businessCountry,
        zip_code: businessZip,
        suburb: businessSuburb,
        service_radius: serviceRadius,
        years_in_business: yearsInBusiness,
        registration_number: regNumber,
        tax_id: taxId,
        website: website,
        insurance_info: insurance,
        bio: bio || '',
        stripe_account_id: stripeAccountId,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (providerError) {
      console.error('Error creating provider:', providerError);
      
      // Clean up user record
      await supabase.from('users').delete().eq('id', userData.id);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to create provider profile: ' + providerError.message
      });
    }

    // Add services if provided
    if (services && services.length > 0) {
      const servicesData = services.map(service => ({
        provider_id: providerData.id,
        name: service.name,
        category: service.category,
        sub_category: service.subCategory,
        duration: service.duration,
        price: service.price,
        description: service.description || '',
        created_at: new Date().toISOString()
      }));

      const { error: servicesError } = await supabase
        .from('services')
        .insert(servicesData);

      if (servicesError) {
        console.error('Error adding services:', servicesError);
        // Continue anyway - services can be added later
      }
    }

    // Create default business hours
    const defaultBusinessHours = [
      { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '17:00' }, // Monday
      { day_of_week: 2, is_open: true, open_time: '09:00', close_time: '17:00' }, // Tuesday
      { day_of_week: 3, is_open: true, open_time: '09:00', close_time: '17:00' }, // Wednesday
      { day_of_week: 4, is_open: true, open_time: '09:00', close_time: '17:00' }, // Thursday
      { day_of_week: 5, is_open: true, open_time: '09:00', close_time: '17:00' }, // Friday
      { day_of_week: 6, is_open: false, open_time: '10:00', close_time: '16:00' }, // Saturday
      { day_of_week: 0, is_open: false, open_time: '12:00', close_time: '16:00' }  // Sunday
    ];

    const businessHoursData = defaultBusinessHours.map(hour => ({
      provider_id: providerData.id,
      ...hour
    }));

    const { error: businessHoursError } = await supabase
      .from('business_hours')
      .insert(businessHoursData);

    if (businessHoursError) {
      console.error('Error creating business hours:', businessHoursError);
      // Continue anyway - business hours can be set later
    }

    console.log('Provider registration successful:', {
      userId: userData.id,
      providerId: providerData.id,
      stripeAccountId
    });

    res.json({
      success: true,
      message: 'Provider registration completed successfully',
      data: {
        user: userData,
        provider: providerData,
        stripeOnboardingUrl,
        dashboardUrl: `https://my-backend-kwgq.onrender.com/provider-dashboard.html?providerId=${providerData.id}&email=${email}`
      }
    });

  } catch (error) {
    console.error('Provider registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

// Get provider profile (FIXED - robust version)
app.get('/api/providers/:id', async (req, res) => {
  try {
    console.log('Fetching provider with ID:', req.params.id);
    
    // First, check if provider exists without joins
    const { data: providerCheck, error: checkError } = await supabase
      .from('providers')
      .select('id, user_id')
      .eq('id', req.params.id);

    if (checkError) {
      console.error('Provider check error:', checkError);
      return res.status(500).json({ success: false, error: 'Database error: ' + checkError.message });
    }

    if (!providerCheck || providerCheck.length === 0) {
      console.log('No provider found with ID:', req.params.id);
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    const provider = providerCheck[0];
    console.log('Provider exists, fetching full data...');

    // Now fetch full provider data
    const { data: fullProvider, error: providerError } = await supabase
      .from('providers')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (providerError) {
      console.error('Full provider fetch error:', providerError);
      return res.status(500).json({ success: false, error: 'Error fetching provider: ' + providerError.message });
    }

    // Fetch user data separately
    let userData = null;
    if (fullProvider.user_id) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', fullProvider.user_id)
        .single();

      if (userError) {
        console.error('User fetch error:', userError);
        // Continue without user data rather than failing
      } else {
        userData = user;
      }
    }

    // Combine the data
    const combinedData = {
      ...fullProvider,
      users: userData
    };

    console.log('Successfully fetched provider:', fullProvider.business_name);
    res.json({ success: true, data: combinedData });

  } catch (error) {
    console.error('Unexpected error in provider endpoint:', error);
    res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
  }
});

// Get complete provider profile with all related data
app.get('/api/providers/:id/complete', async (req, res) => {
  try {
    console.log('Loading complete provider data for ID:', req.params.id);
    
    const { data: provider, error } = await supabase
      .from('providers')
      .select(`
        *,
        users(*),
        services(*),
        provider_settings(*),
        business_hours(*)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    console.log('Provider found:', provider.users?.full_name, provider.business_name);
    res.json({ success: true, data: provider });
    
  } catch (error) {
    console.error('Error fetching complete provider data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to check if a specific provider exists
app.get('/debug/provider/:id', async (req, res) => {
  try {
    // Check provider table
    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('*')
      .eq('id', req.params.id);

    // Check user table
    let user = null;
    if (provider && provider.length > 0 && provider[0].user_id) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', provider[0].user_id);
      user = userData;
    }

    res.json({
      provider_exists: provider && provider.length > 0,
      provider_count: provider ? provider.length : 0,
      provider_data: provider && provider.length > 0 ? provider[0] : null,
      user_exists: user && user.length > 0,
      user_data: user && user.length > 0 ? user[0] : null,
      errors: {
        provider_error: providerError?.message || null,
        user_error: null
      }
    });
  } catch (error) {
    res.json({ 
      error: error.message,
      provider_exists: false 
    });
  }
});

// Get provider by user_id (for dashboard login via email)
app.get('/api/providers/by-user/:userId', async (req, res) => {
  try {
    const { data: provider, error } = await supabase
      .from('providers')
      .select(`
        *,
        users(*),
        services(*),
        provider_settings(*),
        business_hours(*)
      `)
      .eq('user_id', req.params.userId)
      .single();

    if (error) throw error;
    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    res.json({ success: true, data: provider });
  } catch (error) {
    console.error('Error fetching complete provider data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get provider by email (for debugging)
app.get('/api/providers/by-email/:email', async (req, res) => {
  try {
    console.log('Looking for provider with email:', req.params.email);
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('email', req.params.email)
      .single();

    if (userError || !user) {
      return res.status(404).json({ 
        success: false, 
        error: 'No user found with that email',
        debug: { userError, email: req.params.email }
      });
    }

    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select(`
        *,
        users(*),
        services(*),
        provider_settings(*),
        business_hours(*)
      `)
      .eq('user_id', user.id)
      .single();

    if (providerError || !provider) {
      return res.status(404).json({ 
        success: false, 
        error: 'User found but no provider profile exists',
        debug: { providerError, userId: user.id, user }
      });
    }

    res.json({ success: true, data: provider });
  } catch (error) {
    console.error('Error fetching provider by email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get provider services
app.get('/api/providers/:id/services', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('provider_id', req.params.id);

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create booking
app.post('/api/bookings', async (req, res) => {
  try {
    const bookingData = req.body;
    
    const { data, error } = await supabase
      .from('bookings')
      .insert([{
        ...bookingData,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search providers
app.get('/api/search', async (req, res) => {
  try {
    const { service, location, category } = req.query;
    
    let query = supabase
      .from('providers')
      .select(`
        *,
        users (full_name, phone, email),
        services (*)
      `);

    if (location) {
      query = query.or(`city.ilike.%${location}%,state.ilike.%${location}%,country.ilike.%${location}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Filter by service if provided
    let filteredData = data;
    if (service) {
      filteredData = data.filter(provider => 
        provider.services.some(s => 
          s.name.toLowerCase().includes(service.toLowerCase()) ||
          s.category.toLowerCase().includes(service.toLowerCase())
        )
      );
    }

    res.json({ success: true, data: filteredData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add new service
app.post('/api/providers/:providerId/services', async (req, res) => {
  try {
    const { providerId } = req.params;
    const serviceData = req.body;

    const { data: service, error } = await supabase
      .from('services')
      .insert({
        provider_id: providerId,
        ...serviceData,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data: service });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🗄️  Database test: http://localhost:${PORT}/api/test-db`);
});

module.exports = app;

