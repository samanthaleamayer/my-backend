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
    
    // Allow render domains
    if (origin.includes('.onrender.com')) {
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
    version: 'integrated-calendar-v1.0'
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

// =================================
// PROVIDER REGISTRATION & LOGIN
// =================================

// Provider Registration Endpoint (Enhanced)
app.post('/api/providers/register', async (req, res) => {
  try {
    console.log('Provider registration request:', req.body);
    
    const {
      // Personal Information
      fullName,
      email,
      phone,
      dateOfBirth,
      profilePhoto,
      bio,
      
      // Business Details
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
      
      // Other
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

    // Create user record with ALL personal info
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
          refresh_url: 'https://zesty-entremet-6f685b.netlify.app/provider-dashboard.html',
          return_url: 'https://zesty-entremet-6f685b.netlify.app/provider-dashboard.html',
          type: 'account_onboarding',
        });

        stripeOnboardingUrl = accountLink.url;
      } catch (stripeError) {
        console.error('Stripe account creation error:', stripeError);
        // Continue without Stripe for now
      }
    }

    // Create provider profile with ALL business details
    const providerData = {
      user_id: createdUser.id,
      business_name: businessName,
      business_type: businessType,
      business_address: businessAddress,
      city: businessCity,
      state: businessState,
      country: businessCountry,
      zip_code: businessZip,
      suburb: businessSuburb,
      service_radius: serviceRadius ? parseInt(serviceRadius) : null,
      years_in_business: yearsInBusiness ? parseInt(yearsInBusiness) : null,
      registration_number: regNumber,
      tax_id: taxId,
      website: website,
      insurance_info: insurance,
      stripe_account_id: stripeAccountId,
      created_at: new Date().toISOString()
    };

    const { data: createdProvider, error: providerError } = await supabase
      .from('providers')
      .insert([providerData])
      .select()
      .single();

    if (providerError) {
      console.error('Error creating provider:', providerError);
      
      // Clean up user record
      await supabase.from('users').delete().eq('id', createdUser.id);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to create provider profile: ' + providerError.message
      });
    }

    // Add services if provided
    if (services && services.length > 0) {
      const servicesData = services.map(service => ({
        provider_id: createdProvider.id,
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
      }
    }

    // Create default business hours
    const defaultBusinessHours = [
      { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '17:00' },
      { day_of_week: 2, is_open: true, open_time: '09:00', close_time: '17:00' },
      { day_of_week: 3, is_open: true, open_time: '09:00', close_time: '17:00' },
      { day_of_week: 4, is_open: true, open_time: '09:00', close_time: '17:00' },
      { day_of_week: 5, is_open: true, open_time: '09:00', close_time: '17:00' },
      { day_of_week: 6, is_open: false, open_time: '10:00', close_time: '16:00' },
      { day_of_week: 0, is_open: false, open_time: '12:00', close_time: '16:00' }
    ];

    const businessHoursData = defaultBusinessHours.map(hour => ({
      provider_id: createdProvider.id,
      ...hour
    }));

    await supabase.from('business_hours').insert(businessHoursData);

    // Create default provider settings
    await supabase.from('provider_settings').insert([{
      provider_id: createdProvider.id,
      auto_confirm_bookings: false,
      require_deposit: false,
      deposit_percentage: 0,
      booking_window_days: 90,
      minimum_notice_hours: 24,
      buffer_time_minutes: 15,
      email_notifications: true,
      sms_notifications: false,
      reminder_hours: 24,
      timezone: 'UTC'
    }]);

    console.log('Provider registration successful:', {
      userId: createdUser.id,
      providerId: createdProvider.id,
      stripeAccountId
    });

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
    console.error('Provider registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

// Provider Login Endpoint
app.post('/api/login', async (req, res) => {
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
        dashboardUrl: `https://zesty-entremet-6f685b.netlify.app/provider-dashboard.html?providerId=${provider.id}&email=${email}`
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

// =================================
// PROVIDER PROFILE ENDPOINTS
// =================================

// Get complete provider profile
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

// Get provider by email
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

// =================================
// CALENDAR SYSTEM ENDPOINTS
// =================================

// Get provider calendar data for month view
app.get('/api/providers/:id/calendar', async (req, res) => {
  try {
    const { month, year } = req.query;
    const providerId = req.params.id;
    
    // Get the date range for the month
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    
    // Get business hours
    const { data: businessHours, error: hoursError } = await supabase
      .from('business_hours')
      .select('*')
      .eq('provider_id', providerId)
      .order('day_of_week');
    
    // Get all bookings for the month
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        *,
        users!bookings_customer_id_fkey(full_name, email, phone),
        services(name, duration, price, category)
      `)
      .eq('provider_id', providerId)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .order('booking_date')
      .order('start_time');
    
    // Get blocked time slots
    const { data: blockedSlots, error: slotsError } = await supabase
      .from('time_slots')
      .select('*')
      .eq('provider_id', providerId)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('slot_type', ['blocked', 'break']);
    
    if (hoursError || bookingsError || slotsError) {
      throw hoursError || bookingsError || slotsError;
    }
    
    res.json({
      success: true,
      data: {
        businessHours,
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

// Get available time slots for booking
app.get('/api/providers/:id/available-slots', async (req, res) => {
  try {
    const { date, serviceId } = req.query;
    const providerId = req.params.id;
    
    // Get service details
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();
    
    if (serviceError) throw serviceError;
    
    // Get day of week (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = new Date(date).getDay();
    
    // Get business hours for this day
    const { data: businessHours, error: hoursError } = await supabase
      .from('business_hours')
      .select('*')
      .eq('provider_id', providerId)
      .eq('day_of_week', dayOfWeek)
      .single();
    
    if (hoursError || !businessHours || !businessHours.is_open) {
      return res.json({ success: true, data: [] }); // Not open this day
    }
    
    // Get existing bookings for this date
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('start_time, end_time, status')
      .eq('provider_id', providerId)
      .eq('booking_date', date)
      .neq('status', 'cancelled');
    
    // Get blocked time slots
    const { data: blockedSlots, error: slotsError } = await supabase
      .from('time_slots')
      .select('start_time, end_time')
      .eq('provider_id', providerId)
      .eq('date', date)
      .eq('slot_type', 'blocked');
    
    if (bookingsError || slotsError) {
      throw bookingsError || slotsError;
    }
    
    // Generate available time slots
    const availableSlots = generateAvailableSlots(
      businessHours.open_time,
      businessHours.close_time,
      service.duration,
      [...(bookings || []), ...(blockedSlots || [])]
    );
    
    res.json({ success: true, data: availableSlots });
    
  } catch (error) {
    console.error('Available slots error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create booking
app.post('/api/bookings/create', async (req, res) => {
  try {
    const {
      providerId,
      serviceId,
      customerName,
      customerEmail,
      customerPhone,
      bookingDate,
      startTime,
      notes
    } = req.body;
    
    // Validate required fields
    if (!providerId || !serviceId || !customerEmail || !bookingDate || !startTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required booking information'
      });
    }
    
    // Get service details
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();
    
    if (serviceError) throw serviceError;
    
    // Calculate end time
    const endTime = addMinutesToTime(startTime, service.duration);
    
    // Check if customer exists, create if not
    let customerId;
    const { data: existingCustomer, error: customerCheckError } = await supabase
      .from('users')
      .select('id')
      .eq('email', customerEmail)
      .eq('role', 'customer')
      .single();
    
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      // Create new customer
      const { data: newCustomer, error: customerError } = await supabase
        .from('users')
        .insert([{
          email: customerEmail,
          full_name: customerName,
          phone: customerPhone,
          role: 'customer',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (customerError) throw customerError;
      customerId = newCustomer.id;
    }
    
    // Create booking
    const bookingData = {
      provider_id: providerId,
      customer_id: customerId,
      service_id: serviceId,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      status: 'pending',
      customer_notes: notes || '',
      total_price: service.price,
      created_at: new Date().toISOString()
    };
    
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert([bookingData])
      .select(`
        *,
        providers(business_name, users(full_name, email, phone)),
        services(name, duration, price),
        users!bookings_customer_id_fkey(full_name, email, phone)
      `)
      .single();
    
    if (bookingError) throw bookingError;
    
    res.json({
      success: true,
      message: 'Booking created successfully',
      data: booking
    });
    
  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update booking status
app.put('/api/bookings/:id/status', async (req, res) => {
  try {
    const { status, providerNotes } = req.body;
    const bookingId = req.params.id;
    
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }
    
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status,
        provider_notes: providerNotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)
      .select(`
        *,
        users!bookings_customer_id_fkey(full_name, email, phone),
        services(name, duration, price)
      `)
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: `Booking ${status} successfully`,
      data: booking
    });
    
  } catch (error) {
    console.error('Booking status update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Block time slots
app.post('/api/providers/:id/block-time', async (req, res) => {
  try {
    const providerId = req.params.id;
    const { date, startTime, endTime, title, type = 'blocked' } = req.body;
    
    const { data: blockedSlot, error } = await supabase
      .from('time_slots')
      .insert([{
        provider_id: providerId,
        date,
        start_time: startTime,
        end_time: endTime,
        slot_type: type,
        title: title || 'Blocked Time',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Time blocked successfully',
      data: blockedSlot
    });
    
  } catch (error) {
    console.error('Block time error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get provider bookings
app.get('/api/providers/:id/bookings', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    let query = supabase
      .from('bookings')
      .select(`
        *,
        users!bookings_customer_id_fkey(full_name, email, phone),
        services(name, duration, price)
      `)
      .eq('provider_id', req.params.id);

    if (startDate) query = query.gte('booking_date', startDate);
    if (endDate) query = query.lte('booking_date', endDate);
    if (status) query = query.eq('status', status);

    query = query.order('booking_date', { ascending: true })
                 .order('start_time', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get provider statistics
app.get('/api/providers/:id/stats', async (req, res) => {
  try {
    const providerId = req.params.id;
    const { period = '30' } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));
    const startDateStr = startDate.toISOString().split('T')[0];
    
    // Get booking statistics
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('status, total_price, booking_date, services(name, category)')
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
        .reduce((sum, b) => sum + (b.total_price || 0), 0),
      averageBookingValue: bookings.length > 0 ? 
        bookings.reduce((sum, b) => sum + (b.total_price || 0), 0) / bookings.length : 0
    };
    
    res.json({ success: true, data: stats });
    
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// BUSINESS HOURS & SETTINGS
// =================================

// Get business hours
app.get('/api/providers/:id/business-hours', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('business_hours')
      .select('*')
      .eq('provider_id', req.params.id)
      .order('day_of_week');

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update business hours
app.put('/api/providers/:id/business-hours', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { businessHours } = req.body;

    // Delete existing hours
    await supabase
      .from('business_hours')
      .delete()
      .eq('provider_id', providerId);

    // Insert new hours
    const hoursData = businessHours.map(hour => ({
      provider_id: providerId,
      day_of_week: hour.day_of_week,
      is_open: hour.is_open,
      open_time: hour.open_time,
      close_time: hour.close_time
    }));

    const { data, error } = await supabase
      .from('business_hours')
      .insert(hoursData)
      .select();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// SERVICES MANAGEMENT
// =================================

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

// =================================
// SEARCH & GENERAL ENDPOINTS
// =================================

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

// =================================
// UTILITY FUNCTIONS
// =================================

function generateAvailableSlots(openTime, closeTime, serviceDuration, unavailableSlots) {
  const slots = [];
  const slotInterval = 30; // 30-minute intervals
  const duration = parseInt(serviceDuration);
  
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  
  for (let time = openMinutes; time <= closeMinutes - duration; time += slotInterval) {
    const startTime = minutesToTime(time);
    const endTime = minutesToTime(time + duration);
    
    // Check if this slot conflicts with any unavailable slots
    const isAvailable = !unavailableSlots.some(slot => {
      const slotStart = timeToMinutes(slot.start_time);
      const slotEnd = timeToMinutes(slot.end_time);
      return (time < slotEnd && time + duration > slotStart);
    });
    
    if (isAvailable) {
      slots.push({
        time: startTime,
        display: formatTimeDisplay(startTime),
        available: true
      });
    }
  }
  
  return slots;
}

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function addMinutesToTime(timeStr, minutesToAdd) {
  const totalMinutes = timeToMinutes(timeStr) + parseInt(minutesToAdd);
  return minutesToTime(totalMinutes);
}

function formatTimeDisplay(timeStr) {
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

// =================================
// ERROR HANDLING
// =================================

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
  console.log(`📅 Calendar system integrated and ready!`);
});

module.exports = app;
