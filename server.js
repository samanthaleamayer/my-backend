const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase (you'll need to add your credentials to .env)
const supabaseUrl = process.env.SUPABASE_URL || 'https://yllawvwoeuvwlvuiqyug.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsbGF3dndvZXV2d2x2dWlxeXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTcxMTgsImV4cCI6MjA3MjY3MzExOH0.lJ5HLC-NcyLCEMGkkvvh-RUmL302a9kkJwpcxLff-Ns';
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080'],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Backend is running!', timestamp: new Date().toISOString() });
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
          refresh_url: 'http://localhost:3000/provider-dashboard.html',
          return_url: 'http://localhost:3000/provider-dashboard.html',
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
        stripeOnboardingUrl
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

// Get provider profile
app.get('/api/providers/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        providers (*)
      `)
      .eq('providers.id', req.params.id)
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
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