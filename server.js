// GoHighLevel to Velocify CRM Webhook Handler - Clean Version
// This webhook receives form submissions from GoHighLevel and forwards them to Velocify

const express = require('express');
const axios = require('axios');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// University Bank's Velocify Import URL
const VELOCIFY_IMPORT_URL = 'https://import.prod.velocify.com/Import.aspx?Provider=LGS&Client=41484&CampaignId=15&XmlResponse=true';

// University Bank Form IDs
const UNIVERSITY_BANK_FORMS = [
    '35aVCd7RUqgNDAZ3aDC1', // First University Bank form
    '3k9CDG63EryRBKqLmmqI'  // Second University Bank form
];

const UNIVERSITY_BANK_LOCATION = 'mwppqiCfdkvcu0dJroWh';

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'ghl-velocify-webhook'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'GoHighLevel to Velocify Webhook Server',
        status: 'running',
        endpoints: {
            health: '/health',
            webhook: '/webhook/ghl-to-velocify',
            test: '/test-velocify'
        }
    });
});

// Main webhook endpoint
app.post('/webhook/ghl-to-velocify', async (req, res) => {
    try {
        console.log('=== WEBHOOK RECEIVED ===');
        console.log('Timestamp:', new Date().toISOString());
        console.log('Payload:', JSON.stringify(req.body, null, 2));

        // Extract form information from multiple possible locations
        const formId = req.body.form_id || req.body.formId || 
                      extractFormIdFromUrl(req.body.url) || 
                      extractFormIdFromUrl(req.body.page_url) || '';
        
        const formName = req.body.form_name || req.body.formName || 
                        req.body.workflow?.name || '';
        
        const locationId = req.body.location_id || req.body.locationId || 
                          req.body.id || '';

        console.log('Form Info:', { formId, formName, locationId });

        // Check if this is a University Bank form
        if (!isUniversityBankForm(formId, formName, locationId, req.body)) {
            console.log('❌ Form not recognized for University Bank - skipping');
            return res.status(200).json({ 
                success: true, 
                message: 'Form not targeted for University Bank',
                formId: formId,
                formName: formName
            });
        }

        console.log('✅ University Bank form detected - processing lead');

        // Extract and transform form data
        const formData = extractFormData(req.body);
        console.log('Extracted form data:', formData);

        if (!formData.firstName && !formData.lastName && !formData.email) {
            console.log('❌ No valid form data found');
            return res.status(400).json({ error: 'No valid form data found' });
        }

        // Send to Velocify
        const velocifyResponse = await sendToVelocify(formData);
        
        console.log('✅ Successfully sent to Velocify');
        console.log('Velocify response status:', velocifyResponse.status);

        res.status(200).json({
            success: true,
            message: 'Lead successfully sent to University Bank Velocify',
            formId: formId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Webhook error:', error.message);
        console.error('Error details:', error.response?.data || 'No additional details');
        
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Test endpoint
app.get('/test-velocify', async (req, res) => {
    try {
        console.log('=== TESTING VELOCIFY CONNECTION ===');
        
        const testData = {
            firstName: 'Test',
            lastName: 'Lead',
            email: 'test@replaceyouruniversity.com',
            phone: '555-123-4567'
        };

        console.log('Sending test data:', testData);
        const result = await sendToVelocify(testData);
        
        console.log('✅ Test successful');
        console.log('Velocify response status:', result.status);

        res.json({
            success: true,
            message: 'Test lead sent successfully to University Bank Velocify',
            testData: testData,
            velocifyStatus: result.status,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data || 'No additional details',
            timestamp: new Date().toISOString()
        });
    }
});

// Extract form ID from URL string
function extractFormIdFromUrl(url) {
    if (!url) return '';
    
    // Look for form ID pattern in URLs
    const formIdMatch = url.match(/form\/([a-zA-Z0-9]+)/);
    if (formIdMatch) {
        return formIdMatch[1];
    }
    
    // Look for other possible patterns
    const altMatch = url.match(/\/([a-zA-Z0-9]{16,})/);
    if (altMatch) {
        return altMatch[1];
    }
    
    return '';
}

// Helper function to check if form is for University Bank
function isUniversityBankForm(formId, formName, locationId, payload) {
    console.log('Checking form identification...');

    // Check Form ID (most reliable)
    if (formId && UNIVERSITY_BANK_FORMS.includes(formId)) {
        console.log(`✅ Form ID match: ${formId}`);
        return true;
    }

    // Check Location ID
    if (locationId === UNIVERSITY_BANK_LOCATION) {
        console.log(`✅ Location ID match: ${locationId}`);
        return true;
    }

    // Check form name patterns
    if (formName) {
        const name = formName.toLowerCase();
        if (name.includes('university bank') || name.includes('complete this form')) {
            console.log(`✅ Form name match: ${formName}`);
            return true;
        }
    }

    // Check page URL for form IDs
    if (payload.page_url) {
        for (const id of UNIVERSITY_BANK_FORMS) {
            if (payload.page_url.includes(id)) {
                console.log(`✅ Form ID found in URL: ${id}`);
                return true;
            }
        }
    }

    console.log('❌ No University Bank form identifiers found');
    return false;
}

// Extract form data from GoHighLevel payload
function extractFormData(payload) {
    const data = {
        firstName: '',
        lastName: '',
        email: '',
        phone: ''
    };

    // Try different field name variations
    data.firstName = payload['First Name'] || payload.firstName || payload.first_name || 
                     payload.firstname || payload['first-name'] || '';
    
    data.lastName = payload['Last Name'] || payload.lastName || payload.last_name || 
                    payload.lastname || payload['last-name'] || '';
    
    data.email = payload['Email'] || payload.email || payload.emailAddress || 
                 payload['email-address'] || '';
    
    data.phone = payload['Phone'] || payload.phone || payload.phoneNumber || 
                 payload['phone-number'] || payload.mobile || '';

    // If we have form_data object, try that too
    if (payload.form_data) {
        data.firstName = data.firstName || payload.form_data.firstName || payload.form_data['First Name'] || '';
        data.lastName = data.lastName || payload.form_data.lastName || payload.form_data['Last Name'] || '';
        data.email = data.email || payload.form_data.email || payload.form_data['Email'] || '';
        data.phone = data.phone || payload.form_data.phone || payload.form_data['Phone'] || '';
    }

    // If we have contact object, try that
    if (payload.contact) {
        data.firstName = data.firstName || payload.contact.firstName || '';
        data.lastName = data.lastName || payload.contact.lastName || '';
        data.email = data.email || payload.contact.email || '';
        data.phone = data.phone || payload.contact.phone || '';
    }

    return data;
}

// Send data to Velocify Import URL
async function sendToVelocify(leadData) {
    console.log('Preparing Velocify submission...');
    
    // Create form data for Velocify Import
    const formData = new URLSearchParams();
    formData.append('FirstName', leadData.firstName || '');
    formData.append('LastName', leadData.lastName || '');
    formData.append('Email', leadData.email || '');
    formData.append('Phone', leadData.phone || '');
    formData.append('LeadSource', 'Replace Your University - GoHighLevel');
    formData.append('Comments', 'Lead from Replace Your University via GoHighLevel integration');
    formData.append('Campaign', 'Replace Your University - Get Started Form');

    console.log('Velocify form data:', formData.toString());
    console.log('Sending to:', VELOCIFY_IMPORT_URL);

    const response = await axios.post(VELOCIFY_IMPORT_URL, formData, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000
    });

    console.log('Velocify response received:', response.status);
    return response;
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('=================================');
    console.log('🚀 GoHighLevel → Velocify Webhook');
    console.log('=================================');
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Health check: /health`);
    console.log(`✅ Webhook: /webhook/ghl-to-velocify`);
    console.log(`✅ Test: /test-velocify`);
    console.log(`✅ Velocify URL configured`);
    console.log(`✅ Campaign ID: 15`);
    console.log(`✅ Target forms: ${UNIVERSITY_BANK_FORMS.join(', ')}`);
    console.log('=================================');
});

module.exports = app;
