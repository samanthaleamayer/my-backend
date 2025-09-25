const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
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

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { providerId, currentPassword, newPassword } = req.body;
    
    // Get user's current password hash
    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', providerId)
      .single();
    
    if (error) throw error;
    
    // Verify current password
    const bcrypt = require('bcrypt');
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password
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

// Notifications endpoint
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
    res.json({ success: true, data: [] }); // Return empty array on error
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Backend is running with your actual database schema!', timestamp: new Date().toISOString() });
});

// Debug endpoint
app.get('/debug/check', (req, res) => {
  res.json({ 
    message: 'Server fixed for your actual database schema',
    timestamp: new Date().toISOString(),
    version: 'fixed-for-actual-schema-v1.0'
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
// PROVIDER REGISTRATION (WITH DEBUG LOGGING)
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

    // Upload provider photos/profile pictures
app.post('/api/providers/upload-image', upload.single('image'), async (req, res) => {
  try {
    const { providerId, imageType, setAsProfile } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }
    
    // Upload to your preferred storage (AWS S3, Cloudinary, etc.)
    // For now, storing locally - you'll need to implement cloud storage
    const fileName = `${providerId}_${Date.now()}_${file.originalname}`;
    const imagePath = `/uploads/providers/${fileName}`;
    
    // Save file info to database
    const { data, error } = await supabase
      .from('provider_photos')
      .insert({
        provider_id: providerId,
        image_url: imagePath,
        image_type: imageType,
        is_profile: setAsProfile === 'true',
        file_name: fileName,
        file_size: file.size,
        mime_type: file.mimetype
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // If setting as profile, update user record and unset other profile pics
    if (setAsProfile === 'true') {
      // Unset other profile pictures
      await supabase
        .from('provider_photos')
        .update({ is_profile: false })
        .eq('provider_id', providerId)
        .neq('id', data.id);
      
      // Update user profile_photo_url
      await supabase
        .from('users')
        .update({ profile_photo_url: imagePath })
        .eq('id', providerId);
    }
    
    res.json({ 
      success: true, 
      imageUrl: imagePath,
      photoId: data.id
    });
    
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get provider photos
app.get('/api/providers/:providerId/photos', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const { data, error } = await supabase
      .from('provider_photos')
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, data: data || [] });
    
  } catch (error) {
    console.error('Get photos error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set profile picture
app.post('/api/providers/:providerId/set-profile-picture', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { photoId } = req.body;
    
    // Unset all other profile pictures for this provider
    await supabase
      .from('provider_photos')
      .update({ is_profile: false })
      .eq('provider_id', providerId);
    
    // Set the selected photo as profile
    const { data, error } = await supabase
      .from('provider_photos')
      .update({ is_profile: true })
      .eq('id', photoId)
      .eq('provider_id', providerId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Update user record
    await supabase
      .from('users')
      .update({ profile_photo_url: data.image_url })
      .eq('id', providerId);
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Set profile picture error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete photo
app.delete('/api/providers/photos/:photoId', async (req, res) => {
  try {
    const { photoId } = req.params;
    
    const { data, error } = await supabase
      .from('provider_photos')
      .delete()
      .eq('id', photoId)
      .select()
      .single();
    
    if (error) throw error;
    
    // TODO: Delete actual file from storage
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ENHANCED CALENDAR ENDPOINTS
// ============================================================================

// Block time (enhanced with recurring)
app.post('/api/providers/block-time', async (req, res) => {
  try {
    const { providerId, type, reason, date, startTime, endTime, pattern, startDate, endDate, customDays } = req.body;
    
    if (type === 'single') {
      // Single block
      const { data, error } = await supabase
        .from('blocked_time')
        .insert({
          provider_id: providerId,
          date: date,
          start_time: startTime,
          end_time: endTime,
          reason: reason,
          type: 'single'
        });
      
      if (error) throw error;
      
    } else if (type === 'recurring') {
      // Recurring blocks - generate multiple entries
      const start = new Date(startDate);
      const end = new Date(endDate);
      const blocks = [];
      
      while (start <= end) {
        let shouldAdd = false;
        
        switch (pattern) {
          case 'daily':
            shouldAdd = true;
            break;
          case 'weekly':
            shouldAdd = start.getDay() === new Date(startDate).getDay();
            break;
          case 'weekdays':
            shouldAdd = start.getDay() >= 1 && start.getDay() <= 5;
            break;
          case 'weekends':
            shouldAdd = start.getDay() === 0 || start.getDay() === 6;
            break;
          case 'custom':
            shouldAdd = customDays && customDays.includes(start.getDay());
            break;
        }
        
        if (shouldAdd) {
          blocks.push({
            provider_id: providerId,
            date: start.toISOString().split('T')[0],
            start_time: startTime,
            end_time: endTime,
            reason: reason,
            type: 'recurring',
            pattern: pattern
          });
        }
        
        start.setDate(start.getDate() + 1);
      }
      
      if (blocks.length > 0) {
        const { error } = await supabase
          .from('blocked_time')
          .insert(blocks);
        
        if (error) throw error;
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Block time error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get provider stats (enhanced)
app.get('/api/providers/:providerId/stats', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { period, month, year } = req.query;
    
    let dateFilter = '';
    if (month && year) {
      dateFilter = `AND EXTRACT(MONTH FROM created_at) = ${month} AND EXTRACT(YEAR FROM created_at) = ${year}`;
    } else if (period) {
      dateFilter = `AND created_at >= NOW() - INTERVAL '${period} days'`;
    }
    
    // Get booking stats
    const { data: bookings, error: bookingError } = await supabase
      .from('bookings')
      .select('status, total_price')
      .eq('provider_id', providerId);
    
    if (bookingError) throw bookingError;
    
    const stats = {
      totalBookings: bookings.length,
      confirmedBookings: bookings.filter(b => b.status === 'confirmed').length,
      pendingBookings: bookings.filter(b => b.status === 'pending').length,
      cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
      totalRevenue: bookings
        .filter(b => b.status === 'completed')
        .reduce((sum, b) => sum + (parseFloat(b.total_price) || 0), 0)
    };
    
    res.json({ success: true, data: stats });
    
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Business hours management
app.post('/api/providers/business-hours', async (req, res) => {
  try {
    const { providerId, businessHours } = req.body;
    
    // Delete existing business hours
    await supabase
      .from('business_hours')
      .delete()
      .eq('provider_id', providerId);
    
    // Insert new business hours
    const hoursData = businessHours.map(hour => ({
      provider_id: providerId,
      day_of_week: hour.day,
      is_available: hour.available,
      open_time: hour.openTime,
      close_time: hour.closeTime,
      is_24_hours: hour.is24Hours
    }));
    
    const { error } = await supabase
      .from('business_hours')
      .insert(hoursData);
    
    if (error) throw error;
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Business hours error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DATA EXPORT ENDPOINTS
// ============================================================================

// Download provider data (GDPR compliance)
app.get('/api/providers/:providerId/download-data', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { format } = req.query;
    
    // Get all provider data
    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select(`
        *,
        users(*),
        services(*),
        bookings(*),
        provider_photos(*)
      `)
      .eq('id', providerId)
      .single();
    
    if (providerError) throw providerError;
    
    // Format data based on requested format
    let responseData;
    let contentType;
    let filename;
    
    switch (format) {
      case 'json':
        responseData = JSON.stringify(provider, null, 2);
        contentType = 'application/json';
        filename = `provider_data_${new Date().toISOString().split('T')[0]}.json`;
        break;
        
      case 'csv':
        // Convert to CSV format (simplified)
        const csvData = convertToCSV(provider);
        responseData = csvData;
        contentType = 'text/csv';
        filename = `provider_data_${new Date().toISOString().split('T')[0]}.csv`;
        break;
        
      case 'pdf':
        // Generate PDF (you'll need a PDF library like puppeteer)
        responseData = await generatePDF(provider);
        contentType = 'application/pdf';
        filename = `provider_data_${new Date().toISOString().split('T')[0]}.pdf`;
        break;
        
      default:
        responseData = JSON.stringify(provider, null, 2);
        contentType = 'application/json';
        filename = `provider_data_${new Date().toISOString().split('T')[0]}.json`;
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(responseData);
    
  } catch (error) {
    console.error('Download data error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export calendar
app.post('/api/providers/export-calendar', async (req, res) => {
  try {
    const { providerId, format, dateRange, includeBookings, includeBlocked } = req.body;
    
    // Get calendar data based on filters
    let startDate, endDate;
    const today = new Date();
    
    switch (dateRange) {
      case 'month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case '3months':
        startDate = today;
        endDate = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
        break;
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today.getFullYear(), 11, 31);
        break;
      default:
        startDate = today;
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    }
    
    const calendarData = [];
    
    if (includeBookings) {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('*, users(full_name), services(name)')
        .eq('provider_id', providerId)
        .gte('booking_date', startDate.toISOString().split('T')[0])
        .lte('booking_date', endDate.toISOString().split('T')[0]);
      
      calendarData.push(...(bookings || []));
    }
    
    if (includeBlocked) {
      const { data: blocked } = await supabase
        .from('blocked_time')
        .select('*')
        .eq('provider_id', providerId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]);
      
      calendarData.push(...(blocked || []));
    }
    
    // Generate export based on format
    let exportData;
    let contentType;
    let filename;
    
    switch (format) {
      case 'ics':
        exportData = generateICSCalendar(calendarData);
        contentType = 'text/calendar';
        filename = `calendar_export_${new Date().toISOString().split('T')[0]}.ics`;
        break;
        
      case 'csv':
        exportData = convertCalendarToCSV(calendarData);
        contentType = 'text/csv';
        filename = `calendar_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
        
      default:
        exportData = JSON.stringify(calendarData, null, 2);
        contentType = 'application/json';
        filename = `calendar_export_${new Date().toISOString().split('T')[0]}.json`;
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(exportData);
    
  } catch (error) {
    console.error('Calendar export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function convertToCSV(data) {
  // Simple CSV conversion - you may want to use a proper CSV library
  const csv = [];
  csv.push('Field,Value');
  
  function addRow(key, value) {
    csv.push(`"${key}","${String(value).replace(/"/g, '""')}"`);
  }
  
  addRow('Business Name', data.business_name);
  addRow('Email', data.users?.email);
  addRow('Phone', data.users?.phone);
  addRow('City', data.city);
  addRow('State', data.state);
  addRow('Country', data.country);
  
  return csv.join('\n');
}

function convertCalendarToCSV(events) {
  const csv = [];
  csv.push('Date,Time,Type,Title,Description');
  
  events.forEach(event => {
    const date = event.booking_date || event.date;
    const time = event.start_time;
    const type = event.status ? 'Booking' : 'Blocked';
    const title = event.services?.name || event.reason || 'Event';
    const desc = event.users?.full_name || event.reason || '';
    
    csv.push(`"${date}","${time}","${type}","${title}","${desc}"`);
  });
  
  return csv.join('\n');
}

function generateICSCalendar(events) {
  // Basic ICS format - you may want to use a proper ICS library
  let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:Need a Service\n';
  
  events.forEach(event => {
    const date = event.booking_date || event.date;
    const startTime = event.start_time;
    const title = event.services?.name || event.reason || 'Event';
    
    ics += 'BEGIN:VEVENT\n';
    ics += `DTSTART:${date.replace(/-/g, '')}T${startTime.replace(/:/g, '')}00\n`;
    ics += `SUMMARY:${title}\n`;
    ics += `UID:${event.id}@need-a-service.com\n`;
    ics += 'END:VEVENT\n';
  });
  
  ics += 'END:VCALENDAR';
  return ics;
}

async function generatePDF(data) {
  // PDF generation - you'll need to install puppeteer or similar
  // const puppeteer = require('puppeteer');
  // Implementation depends on your PDF library choice
  return JSON.stringify(data, null, 2); // Fallback to JSON
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

    // Create user record with ALL fields now available
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

    // Create provider profile using your exact field names
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

    // Add services using your exact field names
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

    // Create default business hours
    console.log('Creating default business hours...');
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

    const { error: hoursError } = await supabase
      .from('business_hours')
      .insert(businessHoursData);

    if (hoursError) {
      console.error('Error creating business hours:', hoursError);
    } else {
      console.log('Business hours created successfully');
    }

    console.log('=== REGISTRATION COMPLETED SUCCESSFULLY ===');
    console.log('User ID:', createdUser.id);
    console.log('Provider ID:', createdProvider.id);
    console.log('Stripe Account ID:', stripeAccountId);

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
// PROVIDER LOGIN
// =================================

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
// PROVIDER PROFILE ENDPOINTS (WITH DEBUG)
// =================================

app.get('/api/providers/:id/complete', async (req, res) => {
  try {
    console.log('=== FETCHING COMPLETE PROVIDER DATA ===');
    console.log('Provider ID:', req.params.id);

    // Get provider data separately to avoid JOIN issues
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

    // Get user data separately
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', provider.user_id)
      .single();

    if (userError) {
      console.error('User fetch error:', userError);
      // Continue without user data
    } else {
      console.log('User data retrieved');
    }

    // Get services separately - THIS IS THE KEY DEBUG
    console.log('Fetching services for provider_id:', req.params.id);
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('*')
      .eq('provider_id', req.params.id);

    console.log('Services query result:', { services, servicesError });
    console.log('Number of services found:', services?.length || 0);
    if (services && services.length > 0) {
      console.log('Services details:', services);
    }

    if (servicesError) {
      console.error('Services fetch error:', servicesError);
    }

    // Get provider settings separately
    const { data: settings, error: settingsError } = await supabase
      .from('provider_settings')
      .select('*')
      .eq('provider_id', req.params.id);

    if (settingsError) {
      console.error('Settings fetch error:', settingsError);
    }

    // Get business hours separately
    const { data: businessHours, error: hoursError } = await supabase
      .from('business_hours')
      .select('*')
      .eq('provider_id', req.params.id);

    if (hoursError) {
      console.error('Business hours fetch error:', hoursError);
    }

    // Combine the data manually
    const combinedData = {
      ...provider,
      users: user,
      services: services || [],
      provider_settings: settings || [],
      business_hours: businessHours || []
    };

    console.log('Combined data services count:', combinedData.services.length);

    res.json({ success: true, data: combinedData });
    
  } catch (error) {
    console.error('Error fetching complete provider data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// SERVICES ENDPOINTS (WITH DEBUG)
// =================================

app.get('/api/providers/:id/services', async (req, res) => {
  try {
    console.log('=== FETCHING PROVIDER SERVICES ===');
    console.log('Provider ID:', req.params.id);

    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('provider_id', req.params.id);

    console.log('Services query result:', { data, error });
    console.log('Number of services found:', data?.length || 0);

    if (error) {
      console.error('Services fetch error:', error);
      throw error;
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================
// CALENDAR ENDPOINTS (FIXED FOR YOUR SCHEMA)
// =================================

app.get('/api/providers/:id/calendar', async (req, res) => {
  try {
    const { month, year } = req.query;
    const providerId = req.params.id;
    
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    
    // Get business hours
    const { data: businessHours, error: hoursError } = await supabase
      .from('business_hours')
      .select('*')
      .eq('provider_id', providerId)
      .order('day_of_week');
    
    // Get bookings using your actual schema (NO JOINS - customer info is in bookings table)
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('provider_id', providerId)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .order('booking_date')
      .order('booking_time');
    
    // Get blocked slots from calendar_slots
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
    
    // Transform calendar_slots to match expected format
    const transformedSlots = (blockedSlots || []).map(slot => ({
      id: slot.id,
      date: slot.date,
      start_time: `${slot.start_hour.toString().padStart(2, '0')}:${slot.start_minute.toString().padStart(2, '0')}`,
      end_time: `${slot.end_hour.toString().padStart(2, '0')}:${slot.end_minute.toString().padStart(2, '0')}`,
      title: slot.title || 'Blocked',
      slot_type: slot.status
    }));

    // Transform bookings - customer info is ALREADY in the bookings table
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

// Block time using your calendar_slots table
app.post('/api/providers/:id/block-time', async (req, res) => {
  try {
    const providerId = req.params.id;
    const { date, startTime, endTime, title, type = 'blocked' } = req.body;
    
    // Parse times
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const { data: blockedSlot, error } = await supabase
      .from('calendar_slots')
      .insert([{
        provider_id: providerId,
        date,
        start_hour: startHour,
        start_minute: startMinute,
        end_hour: endHour,
        end_minute: endMinute,
        status: type,
        title: title || 'Blocked Time'
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

// Get provider statistics (FIXED for your actual schema)
app.get('/api/providers/:id/stats', async (req, res) => {
  try {
    const providerId = req.params.id;
    const { period = '30' } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));
    const startDateStr = startDate.toISOString().split('T')[0];
    
    // Use YOUR actual column name: total_amount (not total_price)
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

app.post('/api/bookings/create', async (req, res) => {
  try {
    const {
      providerId, serviceId, customerName, customerEmail, customerPhone,
      bookingDate, startTime, notes
    } = req.body;
    
    // Get service details
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();
    
    if (serviceError) throw serviceError;
    
    // Create booking using your actual schema
    const bookingData = {
      provider_id: providerId,
      service_id: serviceId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      booking_date: bookingDate,
      booking_time: startTime,
      start_time: startTime,
      service_duration: service.duration_minutes || service.duration,
      service_price: service.price,
      platform_fee: service.price * 0.1,
      total_amount: service.price * 1.1, // YOUR field name
      status: 'pending',
      notes: notes || '',
      confirmation_number: generateConfirmationNumber(),
      created_at: new Date().toISOString()
    };
    
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert([bookingData])
      .select()
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
    
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status,
        provider_notes: providerNotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)
      .select()
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

// Add this to your server.js to handle photo uploads
// ADD TO server.js AFTER your existing endpoints

const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// Photo upload endpoint
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
    
    // Create the image URL
    const imageUrl = `/uploads/providers/${file.filename}`;
    
    // Check if provider_photos table exists, if not create it
    const { data: tableCheck, error: tableError } = await supabase
      .from('provider_photos')
      .select('id')
      .limit(1);
    
    if (tableError && tableError.code === '42P01') {
      // Table doesn't exist, create it
      const { error: createError } = await supabase.rpc('create_provider_photos_table');
      if (createError) {
        console.log('Table creation failed, proceeding without table storage');
      }
    }
    
    // Try to save to database, but don't fail if table doesn't exist
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
        
        // If setting as profile, update user record
        if (setAsProfile === 'true') {
          // Unset other profile pictures
          await supabase
            .from('provider_photos')
            .update({ is_profile: false })
            .eq('provider_id', providerId)
            .neq('id', data.id);
          
          // Update user profile_photo_url
          await supabase
            .from('users')
            .update({ profile_photo_url: imageUrl })
            .eq('id', providerId);
        }
      }
    } catch (dbError) {
      console.log('Database storage failed:', dbError.message);
      // Continue anyway - file is uploaded, just not tracked in DB
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

// Get provider photos
app.get('/api/providers/:providerId/photos', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const { data, error } = await supabase
      .from('provider_photos')
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });
    
    if (error && error.code !== '42P01') { // Ignore table not found error
      throw error;
    }
    
    res.json({ success: true, data: data || [] });
    
  } catch (error) {
    console.error('Get photos error:', error);
    res.json({ success: true, data: [] }); // Return empty array if table doesn't exist
  }
});

// Set profile picture endpoint
app.post('/api/providers/:providerId/set-profile-picture', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { photoId, imageUrl } = req.body;
    
    // Update user profile_photo_url directly
    const { data, error } = await supabase
      .from('users')
      .update({ profile_photo_url: imageUrl })
      .eq('id', providerId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Try to update provider_photos table if it exists
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
      // Continue anyway
    }
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Set profile picture error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function uploadCroppedImage(fileName, imageSrc) {
  const imageType = document.getElementById('imageType').value;
  const setAsProfile = document.getElementById('setAsProfile').checked;
  
  try {
    // Show loading state
    const uploadBtn = document.querySelector('.btn-primary');
    const originalText = uploadBtn.textContent;
    uploadBtn.textContent = 'Uploading...';
    uploadBtn.disabled = true;
    
    // Convert base64 to blob
    const response = await fetch(imageSrc);
    const blob = await response.blob();
    
    // Create FormData for upload
    const formData = new FormData();
    formData.append('image', blob, fileName);
    formData.append('providerId', providerId);
    formData.append('imageType', imageType);
    formData.append('setAsProfile', setAsProfile);
    
    console.log('Uploading image to:', `${API_BASE}/api/providers/upload-image`);
    
    // Upload to backend
    const uploadResponse = await fetch(`${API_BASE}/api/providers/upload-image`, {
      method: 'POST',
      body: formData
    });
    
    console.log('Upload response status:', uploadResponse.status);
    
    if (!uploadResponse.ok) {
      throw new Error(`HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`);
    }
    
    const result = await uploadResponse.json();
    console.log('Upload result:', result);
    
    if (result.success) {
      showNotification('Image uploaded successfully!', 'success');
      
      // If set as profile, update the UI immediately
      if (setAsProfile) {
        updateProviderProfilePicture(result.imageUrl);
      }
      
      // Refresh photo grid
      loadProviderPhotos();
      
      // Close modal
      document.querySelector('.modal').remove();
    } else {
      throw new Error(result.error || 'Upload failed');
    }
    
  } catch (error) {
    console.error('Upload error:', error);
    showNotification('Failed to upload image: ' + error.message, 'error');
  } finally {
    // Reset button
    const uploadBtn = document.querySelector('.btn-primary');
    if (uploadBtn) {
      uploadBtn.textContent = originalText;
      uploadBtn.disabled = false;
    }
  }
}

// Enhanced photo management
function updateProviderProfilePicture(imageUrl) {
  // Ensure URL is complete
  if (imageUrl && !imageUrl.startsWith('http')) {
    imageUrl = `${API_BASE}${imageUrl}`;
  }
  
  console.log('Updating profile picture to:', imageUrl);
  
  // Update top bar avatar
  const avatar = document.getElementById('userAvatar');
  if (avatar && imageUrl) {
    avatar.innerHTML = `<img src="${imageUrl}" alt="Profile" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;" onerror="this.style.display='none'; this.parentNode.textContent='${(currentProvider?.users?.full_name || 'P').charAt(0).toUpperCase()}'">`;
  }
  
  // Update currentProvider data
  if (currentProvider && currentProvider.users) {
    currentProvider.users.profile_photo_url = imageUrl;
  }
  
  // Refresh profile section if currently active
  if (document.getElementById('profile-section').classList.contains('active')) {
    loadProfileSection();
  }
}

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🗄️ Database test: http://localhost:${PORT}/api/test-db`);
  console.log(`📅 Calendar system fixed for your actual database schema!`);
  console.log(`🐛 Debug logging enabled for registration and services`);
});

module.exports = app;




