// GoHighLevel to Velocify CRM Webhook Handler
// This webhook receives form submissions from GoHighLevel and forwards them to Velocify

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Velocify Import URL Configuration - From University Bank
const VELOCIFY_CONFIG = {
    // University Bank's Velocify Import URL (contains all needed parameters)
    importUrl: 'https://import.prod.velocify.com/Import.aspx?Provider=LGS&Client=41484&CampaignId=15&XmlResponse=true',
    
    // Parsed from URL for reference:
    provider: 'LGS',
    clientId: '41484',
    campaignId: '15',
    xmlResponse: true
};

// GoHighLevel webhook verification (optional but recommended)
const GHL_WEBHOOK_SECRET = 'your_ghl_webhook_secret';

// Webhook endpoint to receive GoHighLevel form submissions
app.post('/webhook/ghl-to-velocify', async (req, res) => {
    try {
        console.log('Received webhook from GoHighLevel:', JSON.stringify(req.body, null, 2));
        
        // FILTER: Only process the University Bank form (if using global webhook)
        const formName = req.body.form_name || req.body.formName || '';
        const formId = req.body.form_id || req.body.formId || '';
        
        // Skip if it's not the right form (comment this out if using form-specific webhook)
        if (!isUniversityBankForm(formName, formId, req.body)) {
            console.log('Skipping - not the University Bank form');
            return res.status(200).json({ message: 'Form not targeted for University Bank' });
        }
        
        // Optional: Verify webhook signature from GoHighLevel
        if (GHL_WEBHOOK_SECRET && req.headers['x-signature']) {
            const signature = req.headers['x-signature'];
            const payload = JSON.stringify(req.body);
            const expectedSignature = crypto
                .createHmac('sha256', GHL_WEBHOOK_SECRET)
                .update(payload)
                .digest('hex');
            
            if (signature !== expectedSignature) {
                console.log('Invalid webhook signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        // Extract form data from GoHighLevel payload
        const formData = extractFormData(req.body);
        
        if (!formData) {
            console.log('No valid form data found in webhook');
            return res.status(400).json({ error: 'Invalid form data' });
        }

        // Transform data for Velocify format
        const velocifyPayload = transformToVelocifyFormat(formData);
        
        // Send to Velocify
        const velocifyResponse = await sendToVelocify(velocifyPayload);
        
        console.log('Successfully sent to Velocify:', velocifyResponse.data);
        
        res.status(200).json({
            success: true,
            message: 'Lead successfully sent to Velocify',
            velocifyId: velocifyResponse.data.LeadId || velocifyResponse.data.id || 'N/A'
        });

    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Extract form data from GoHighLevel webhook payload
function extractFormData(payload) {
    // GoHighLevel sends different payload structures depending on the trigger
    
    let formData = {};
    
    // Handle different GoHighLevel payload structures
    if (payload.type === 'form_submit' && payload.form_data) {
        // Direct form submission
        formData = payload.form_data;
        formData.contactId = payload.contact_id;
        formData.locationId = payload.location_id;
    } else if (payload.contact) {
        // Contact-based webhook
        formData = payload.contact;
        formData.contactId = payload.contact.id;
    } else if (payload.customFields) {
        // Custom fields format
        formData = payload.customFields;
        formData.contactId = payload.contactId;
    } else {
        // Fallback - use entire payload
        formData = payload;
    }
    
    return formData;
}

// Transform GoHighLevel data to Velocify Import format
function transformToVelocifyFormat(formData) {
    // Velocify Import URL expects form data (not JSON)
    // Map the exact form fields: First Name, Last Name, Email, Phone
    
    const velocifyPayload = {
        // Standard Velocify import fields
        FirstName: formData['First Name'] || formData.firstName || formData.first_name || '',
        LastName: formData['Last Name'] || formData.lastName || formData.last_name || '',
        Email: formData['Email'] || formData.email || '',
        Phone: formData['Phone'] || formData.phone || '',
        
        // Additional fields for tracking "Replace Your University"
        LeadSource: 'Replace Your University - GoHighLevel',
        Campaign: 'Replace Your University - Get Started Form',
        
        // Custom fields for identification
        Comments: 'Lead from Replace Your University - Get Started Form. Submitted via GoHighLevel integration.',
        
        // Additional tracking fields that Velocify Import might accept
        Source: 'RYU Website Form',
        Medium: 'GoHighLevel Integration',
        Content: 'Complete This Form To Get Started',
        
        // Metadata
        SubmissionDate: new Date().toISOString(),
        ClientIdentifier: 'Replace Your University (RYU)',
        FormName: 'RYU - Get Started Form',
        
        // GoHighLevel reference data
        GHLContactId: formData.contactId || formData.contact_id || '',
        OriginalSource: 'Replace Your University Website'
    };
    
    // Handle alternative field naming from GoHighLevel
    if (!velocifyPayload.FirstName) {
        velocifyPayload.FirstName = formData.firstname || formData['first-name'] || formData.fname || '';
    }
    if (!velocifyPayload.LastName) {
        velocifyPayload.LastName = formData.lastname || formData['last-name'] || formData.lname || '';
    }
    if (!velocifyPayload.Email) {
        velocifyPayload.Email = formData.emailAddress || formData['email-address'] || '';
    }
    if (!velocifyPayload.Phone) {
        velocifyPayload.Phone = formData.phoneNumber || formData['phone-number'] || formData.mobile || '';
    }
    
    // Clean up empty values
    Object.keys(velocifyPayload).forEach(key => {
        if (velocifyPayload[key] === null || velocifyPayload[key] === undefined) {
            delete velocifyPayload[key];
        }
        // Convert empty strings to avoid issues
        if (typeof velocifyPayload[key] === 'string' && velocifyPayload[key].trim() === '') {
            velocifyPayload[key] = '';
        }
    });
    
    return velocifyPayload;
}

// Send data to Velocify using their Import URL
async function sendToVelocify(payload) {
    console.log('Sending to Velocify Import URL:', JSON.stringify(payload, null, 2));
    
    try {
        // Velocify Import URL expects form-encoded data (application/x-www-form-urlencoded)
        // NOT JSON data like typical APIs
        
        const formData = new URLSearchParams();
        
        // Add all payload fields to form data
        Object.keys(payload).forEach(key => {
            if (payload[key] !== null && payload[key] !== undefined) {
                formData.append(key, payload[key]);
            }
        });
        
        console.log('Form data being sent:', formData.toString());
        
        const response = await axios.post(VELOCIFY_CONFIG.importUrl, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 30000 // 30 second timeout
        });
        
        console.log('Velocify response:', response.data);
        
        return response;
        
    } catch (error) {
        console.error('Velocify Import Error:', error.response?.data || error.message);
        throw error;
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Velocify webhook server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhook/ghl-to-velocify`);
    console.log(`Test endpoint: http://localhost:${PORT}/test-velocify`);
    console.log(`Velocify Import URL: ${VELOCIFY_CONFIG.importUrl}`);
    console.log(`Campaign ID: ${VELOCIFY_CONFIG.campaignId}`);
});

// Helper function to identify the University Bank forms
function isUniversityBankForm(formName, formId, payload) {
    // Specific Form IDs for University Bank forms
    const universityBankFormIds = [
        '35aVCd7RUqgNDAZ3aDC1', // First University Bank form
        '3k9CDG63EryRBKqLmmqI'  // Second University Bank form
    ];
    
    // Primary check: Form ID match
    if (formId && universityBankFormIds.includes(formId)) {
        console.log(`✅ Form ID match found: ${formId}`);
        return true;
    }
    
    // Secondary check: Form name patterns
    if (formName) {
        const lowerFormName = formName.toLowerCase();
        if (lowerFormName.includes('complete this form to get started') ||
            lowerFormName.includes('university bank') ||
            lowerFormName.includes('schedule a meeting')) {
            console.log(`✅ Form name match found: ${formName}`);
            return true;
        }
    }
    
    // Tertiary check: Form title/button text
    if (payload.form_title) {
        const lowerTitle = payload.form_title.toLowerCase();
        if (lowerTitle.includes('university bank') ||
            lowerTitle.includes('schedule a meeting with university bank')) {
            console.log(`✅ Form title match found: ${payload.form_title}`);
            return true;
        }
    }
    
    // Check by page URL containing either form ID
    if (payload.page_url && 
        (payload.page_url.includes('35aVCd7RUqgNDAZ3aDC1') || 
         payload.page_url.includes('3k9CDG63EryRBKqLmmqI'))) {
        console.log(`✅ Form ID found in page URL: ${payload.page_url}`);
        return true;
    }
    
    // Check by location ID (from your URL: mwppqiCfdkvcu0dJroWh)
    const universityBankLocationId = 'mwppqiCfdkvcu0dJroWh';
    if (payload.location_id === universityBankLocationId || payload.locationId === universityBankLocationId) {
        console.log(`✅ Location ID match found: ${payload.location_id || payload.locationId}`);
        return true;
    }
    
    // STRICT FILTERING: Only process if we found a match
    console.log(`❌ Form not recognized for University Bank:`, {
        formId: formId,
        formName: formName,
        locationId: payload.location_id || payload.locationId,
        pageUrl: payload.page_url,
        formTitle: payload.form_title
    });
    
    return false; // Reject all other forms
}

// Remove the old SOAP/REST functions since we're using the Import URL
// sendToVelocifySOAP and sendToVelocifyREST are no longer needed

module.exports = app;
