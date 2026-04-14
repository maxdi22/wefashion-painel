import dotenv from 'dotenv';
import { Resend } from 'resend';
import path from 'path';

// Load env from parents since this is in src/scripts
dotenv.config({ path: path.join(__dirname, '../../.env') });

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
  console.log('--- Resend Test Script ---');
  console.log('API Key:', process.env.RESEND_API_KEY ? 'Present' : 'Missing');

  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'dev@wefashion.marketing',
      subject: 'Hello World',
      html: '<p>Congrats on sending your <strong>first email</strong>!</p>'
    });

    if (error) {
      console.error('Error sending test email:', error);
      return;
    }

    console.log('Success! Email sent. ID:', data?.id);
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testEmail();
